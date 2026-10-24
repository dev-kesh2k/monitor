import Anthropic from '@anthropic-ai/sdk';
import { HttpError, getJson, getSecret, prisma } from './db.js';
import { assertName, containerAction, hub, runCommand, serverSnapshot, serviceAction } from './hub.js';
import { history } from './metrics.js';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (mais capaz)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (rápido)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (econômico)' },
];
export const EFFORTS = ['low', 'medium', 'high'];
export const DEFAULT_AGENT_CONFIG = { model: 'claude-opus-5-5', effort: 'medium', autoApprove: false };

export async function agentConfig() {
  const cfg = await getJson('agent:config', DEFAULT_AGENT_CONFIG);
  const stored = await getSecret('agent:anthropicKey');
  const key = stored || process.env.ANTHROPIC_API_KEY || '';
  return { ...cfg, key, keySource: stored ? 'app' : key ? 'env' : 'none', keyHint: key ? `…${key.slice(-4)}` : '' };
}

const SYSTEM = `Você é o agente do app Monitor, que acompanha e controla o servidor Linux (Ubuntu) do Central Apps Hub do usuário.
Responda sempre em português do Brasil, de forma curta e direta (o usuário costuma estar no celular). Use Markdown simples.

Sobre o servidor:
- Tudo roda como root. O Hub (painel) fica em /opt/hub, backend no serviço systemd hub-backend.service (127.0.0.1:3001).
- Containers Docker: apache (estáticos), postgres (porta 5433), traefik (entrada do túnel, 8082), cloudflared (túnel Cloudflare), portainer, pgadmin, pihole e os apps publicados (hub-<app>-api-N, hub-<app>-lb), com arquivos em /hub-apps/servicos/<app>.
- Backup restic no pendrive /mnt/pendrive/HubBackup (timer hub-backup.timer). Watchdogs: hub-cloudflared-watchdog.timer e hub-runner-watchdog.timer.

Como trabalhar:
- Para diagnosticar, use primeiro as ferramentas de leitura (status, containers, serviços, logs, histórico). Leia antes de mudar.
- Ações que mudam o servidor (run_command, service_action, container_action) passam por aprovação do usuário no app, a menos que ele tenha ligado a aprovação automática. Peça só o necessário e explique em uma frase o que o comando faz.
- Prefira comandos não interativos e com saída limitada (ex.: --no-pager, tail -n 100, head). Nunca rode comandos que esperam entrada.
- Reiniciar hub-backend.service derruba o painel do Hub e este Monitor perde o acesso por alguns segundos; só faça se o usuário pedir.
- Nunca mostre senhas, tokens ou o conteúdo de arquivos .env; se precisar, mostre só os nomes das variáveis.
- Não apague dados, volumes, bancos ou backups sem o usuário pedir explicitamente.
- Ao terminar, resuma o que encontrou ou fez e o resultado.`;

const tools = [
  {
    name: 'get_server_status',
    description:
      'Resumo atual do servidor: CPU, memória, disco, rede, processos, máquina (SO, kernel, uptime, carga), discos (SMART), segurança (firewall, fail2ban, atualizações), serviços principais, alertas, temperatura, backup e containers. Use para qualquer pergunta sobre a saúde do servidor.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_containers',
    description: 'Lista os containers Docker com estado, status e uso de CPU/memória.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'container_logs',
    description: 'Últimas linhas do log de um container Docker.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome exato do container (ex.: traefik, hub-dieta-x-api-1)' },
        tail: { type: 'integer', description: 'Quantidade de linhas (10 a 500, padrão 100)' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_services',
    description: 'Lista as unidades systemd do servidor com estado (active/sub).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'system_logs',
    description: 'Últimas linhas do journal do sistema (journalctl).',
    input_schema: {
      type: 'object',
      properties: { rows: { type: 'integer', description: 'Linhas (10 a 500, padrão 100)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'metrics_history',
    description: 'Histórico de CPU, memória, disco, temperatura e carga gravado pelo Monitor (uma amostra por minuto).',
    input_schema: {
      type: 'object',
      properties: { range: { type: 'string', enum: ['1h', '24h', '7d', '30d'] } },
      required: ['range'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_command',
    description:
      'Executa um comando bash como root no servidor e devolve stdout, stderr e código de saída. Precisa de aprovação do usuário. Use para inspeções que as outras ferramentas não cobrem e para mudanças pedidas.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando bash não interativo' },
        reason: { type: 'string', description: 'Uma frase dizendo o que o comando faz e por quê' },
        timeout_sec: { type: 'integer', description: 'Tempo máximo em segundos (1 a 600, padrão 60)' },
      },
      required: ['command', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'service_action',
    description: 'Inicia, para, reinicia ou mostra o status de uma unidade systemd. start/stop/restart precisam de aprovação.',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Nome da unidade (ex.: hub-backup.timer, docker.service)' },
        action: { type: 'string', enum: ['start', 'stop', 'restart', 'status'] },
      },
      required: ['service', 'action'],
      additionalProperties: false,
    },
  },
  {
    name: 'container_action',
    description: 'Inicia, para ou reinicia um container Docker. Precisa de aprovação.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome exato do container' },
        action: { type: 'string', enum: ['start', 'stop', 'restart'] },
      },
      required: ['name', 'action'],
      additionalProperties: false,
    },
  },
];

/** Ferramentas que mudam o servidor: param o agente até o usuário aprovar. */
export function needsApproval(block) {
  if (block.name === 'run_command' || block.name === 'container_action') return true;
  if (block.name === 'service_action') return block.input?.action !== 'status';
  return false;
}

const clampInt = (v, min, max, def) => Math.min(Math.max(Number.isInteger(v) ? v : def, min), max);
const MAX_RESULT = 30_000;
const cut = (s) => (s.length > MAX_RESULT ? `${s.slice(0, MAX_RESULT)}\n…(saída cortada)` : s);
const cmdText = (r) => cut(`exit=${r.exitCode}\n--- stdout ---\n${r.stdout || '(vazio)'}\n--- stderr ---\n${r.stderr || '(vazio)'}`);

async function executeTool(block, userId) {
  const input = block.input && typeof block.input === 'object' ? block.input : {};
  switch (block.name) {
    case 'get_server_status': {
      const s = await serverSnapshot();
      const st = s.stats || {};
      const summary = {
        stats: { ...st, dockerContainers: undefined },
        overview: s.overview,
        temperature: s.temperature,
        backup: s.backup,
        containers: s.containers.map((c) => `${c.name}: ${c.state} (${c.status})`),
      };
      return cut(JSON.stringify(summary));
    }
    case 'list_containers': {
      const [ops, stats] = await Promise.all([hub('GET', '/ops/status'), hub('GET', '/wsl/stats').catch(() => ({}))]);
      const usage = Object.fromEntries((stats.dockerContainers || []).map((c) => [c.name, c]));
      return cut(
        (ops.containers || [])
          .map((c) => {
            const u = usage[c.name];
            return `${c.name} | ${c.state} | ${c.status} | ${c.image}${u ? ` | cpu ${u.cpuPercent}% | mem ${u.memUsedMB}/${u.memLimitMB} MB` : ''}`;
          })
          .join('\n') || 'Nenhum container.',
      );
    }
    case 'container_logs': {
      const name = assertName(input.name, 'Container');
      const tail = clampInt(input.tail, 10, 500, 100);
      const r = await hub('GET', `/ops/containers/${encodeURIComponent(name)}/logs?tail=${tail}`);
      return cut(String(r.logs || '(sem logs)').replace(/\x1b\[[0-9;]*m/g, ''));
    }
    case 'list_services': {
      const list = await hub('GET', '/services');
      return cut(list.map((s) => `${s.name} | ${s.active}/${s.sub} | ${s.description}`).join('\n'));
    }
    case 'system_logs': {
      const rows = clampInt(input.rows, 10, 500, 100);
      const r = await hub('GET', `/logs?rows=${rows}`);
      return cut((r.logs || []).join('\n') || '(sem logs)');
    }
    case 'metrics_history': {
      const h = await history(String(input.range || '24h'));
      if (!h) throw new HttpError(400, 'Período inválido');
      if (!h.points.length) return 'Ainda não há amostras gravadas nesse período.';
      return cut(JSON.stringify(h));
    }
    case 'run_command': {
      const command = String(input.command || '').trim();
      if (!command) throw new HttpError(400, 'Comando vazio');
      return cmdText(await runCommand(command, { userId, source: 'agent', timeoutSec: clampInt(input.timeout_sec, 1, 600, 60) }));
    }
    case 'service_action':
      return cmdText(await serviceAction(String(input.service || ''), String(input.action || ''), { userId }));
    case 'container_action':
      return cmdText(await containerAction(String(input.name || ''), String(input.action || ''), { userId }));
    default:
      throw new HttpError(400, `Ferramenta desconhecida: ${block.name}`);
  }
}

async function toolResult(block, userId) {
  try {
    return { type: 'tool_result', tool_use_id: block.id, content: await executeTool(block, userId) };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: block.id, content: `Erro: ${e.message}`, is_error: true };
  }
}

const toolUses = (content) => (Array.isArray(content) ? content.filter((b) => b?.type === 'tool_use') : []);

async function setStatus(id, status, error = '') {
  await prisma.conversation.update({ where: { id }, data: { status, error } });
}

function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Chave da API da Anthropic inválida. Confira em Configurações.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'A chave da Anthropic não tem permissão para este modelo.';
  if (e instanceof Anthropic.RateLimitError) return 'Limite de uso da API da Anthropic atingido. Tente de novo em instantes.';
  if (e instanceof Anthropic.BadRequestError) return `A API da Anthropic recusou o pedido: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return 'Sem conexão com a API da Anthropic.';
  if (e instanceof Anthropic.APIError) return `Erro na API da Anthropic (${e.status ?? '?'}): ${e.message}`;
  return e?.message || 'Erro inesperado no agente';
}

const MAX_STEPS = 30;

/** Loop do agente: chama o modelo, executa ferramentas de leitura e para quando precisa de aprovação. */
async function loop(conversationId, userId) {
  const cfg = await agentConfig();
  if (!cfg.key) throw new HttpError(400, 'Configure a chave da API da Anthropic em Configurações.');
  const client = new Anthropic({ apiKey: cfg.key, timeout: 5 * 60_000, maxRetries: 2 });

  for (let step = 0; step < MAX_STEPS; step++) {
    const rows = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
    const messages = rows.map((m) => ({ role: m.role, content: m.content }));

    const response = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      messages,
      thinking: { type: 'adaptive' },
      output_config: { effort: cfg.effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    await prisma.message.create({ data: { conversationId, role: 'assistant', content: response.content } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    if (response.stop_reason === 'refusal') {
      await setStatus(conversationId, 'error', 'O modelo recusou este pedido. Reformule e tente de novo.');
      return;
    }
    if (response.stop_reason === 'pause_turn') continue;

    const uses = toolUses(response.content);
    if (response.stop_reason !== 'tool_use' || !uses.length) {
      await setStatus(conversationId, 'idle', response.stop_reason === 'max_tokens' ? 'A resposta foi cortada pelo limite de tamanho.' : '');
      return;
    }

    if (!cfg.autoApprove && uses.some(needsApproval)) {
      await setStatus(conversationId, 'awaiting_approval');
      return;
    }
    const results = await Promise.all(uses.map((b) => toolResult(b, userId)));
    await prisma.message.create({ data: { conversationId, role: 'user', content: results } });
  }
  await setStatus(conversationId, 'idle', 'O agente parou após muitos passos seguidos. Mande "continue" para seguir.');
}

function runInBackground(conversationId, userId) {
  loop(conversationId, userId).catch(async (e) => {
    console.error('Agente falhou:', e?.message || e);
    await setStatus(conversationId, 'error', friendlyError(e)).catch(() => {});
  });
}

/** Marca como 'running' só se não estiver ocupado (evita dois loops na mesma conversa, mesmo entre réplicas). */
async function claim(conversationId, from) {
  const r = await prisma.conversation.updateMany({ where: { id: conversationId, status: { in: from } }, data: { status: 'running', error: '' } });
  return r.count === 1;
}

const STALE_MS = 10 * 60_000;
/** Conversa presa em 'running' (container reiniciou no meio) volta a aceitar mensagens. */
export async function unstick(conv) {
  if (conv.status === 'running' && Date.now() - new Date(conv.updatedAt).getTime() > STALE_MS) {
    await setStatus(conv.id, 'error', 'O agente foi interrompido (o servidor do Monitor reiniciou). Mande a mensagem de novo.');
    return { ...conv, status: 'error' };
  }
  return conv;
}

export async function sendMessage(conv, userId, text) {
  const cfg = await agentConfig();
  if (!cfg.key) throw new HttpError(400, 'Configure a chave da API da Anthropic em Configurações para usar o agente.');
  conv = await unstick(conv);
  if (conv.status === 'awaiting_approval') throw new HttpError(409, 'Aprove ou recuse a ação pendente antes de mandar outra mensagem.');
  if (!(await claim(conv.id, ['idle', 'error']))) throw new HttpError(409, 'O agente ainda está trabalhando nesta conversa.');
  // A API exige alternância user/assistant e resposta para todo tool_use: junta na última mensagem do usuário ou fecha as ferramentas pendentes.
  const last = await prisma.message.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } });
  const textBlock = { type: 'text', text };
  if (last?.role === 'user' && Array.isArray(last.content)) {
    await prisma.message.update({ where: { id: last.id }, data: { content: [...last.content, textBlock] } });
  } else {
    const open = last?.role === 'assistant' ? toolUses(last.content) : [];
    const closed = open.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Interrompido.', is_error: true }));
    await prisma.message.create({ data: { conversationId: conv.id, role: 'user', content: [...closed, textBlock] } });
  }
  if (conv.title === 'Nova conversa') {
    await prisma.conversation.update({ where: { id: conv.id }, data: { title: text.replace(/\s+/g, ' ').slice(0, 60) } });
  }
  runInBackground(conv.id, userId);
}

/** Aprova ou recusa as ações pendentes (última mensagem do assistente com tool_use). */
export async function decide(conv, userId, approve) {
  if (conv.status !== 'awaiting_approval') throw new HttpError(409, 'Não há ação aguardando aprovação.');
  const last = await prisma.message.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } });
  const uses = last?.role === 'assistant' ? toolUses(last.content) : [];
  if (!uses.length) {
    await setStatus(conv.id, 'idle');
    throw new HttpError(409, 'Não há ação pendente.');
  }
  if (!(await claim(conv.id, ['awaiting_approval']))) throw new HttpError(409, 'Esta aprovação já foi respondida.');
  try {
    const results = approve
      ? await Promise.all(uses.map((b) => toolResult(b, userId)))
      : uses.map((b) => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: needsApproval(b) ? 'O usuário RECUSOU esta ação. Não tente de novo sem perguntar.' : 'Não executado: o usuário recusou as ações deste passo.',
          is_error: true,
        }));
    await prisma.message.create({ data: { conversationId: conv.id, role: 'user', content: results } });
  } catch (e) {
    await setStatus(conv.id, 'error', e.message);
    throw e;
  }
  runInBackground(conv.id, userId);
}

/** Para um loop preso: a conversa volta a aceitar mensagens (tool_use sem resposta é fechado como cancelado). */
export async function cancel(conv) {
  const last = await prisma.message.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } });
  const uses = last?.role === 'assistant' ? toolUses(last.content) : [];
  if (uses.length) {
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        role: 'user',
        content: uses.map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Cancelado pelo usuário.', is_error: true })),
      },
    });
  }
  await setStatus(conv.id, 'idle');
}

/** Converte os blocos da API em itens simples para a tela. */
export function viewMessages(rows, status) {
  const results = new Map();
  for (const m of rows) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content) if (b?.type === 'tool_result') results.set(b.tool_use_id, b);
  }
  const items = [];
  rows.forEach((m, idx) => {
    if (!Array.isArray(m.content)) return;
    const isLast = idx === rows.length - 1;
    for (const b of m.content) {
      if (b?.type === 'text' && b.text?.trim()) {
        items.push({ id: `${m.id}:${items.length}`, kind: m.role === 'user' ? 'user' : 'assistant', text: b.text, at: m.createdAt });
      } else if (b?.type === 'tool_use') {
        const r = results.get(b.id);
        const resultText = r ? (typeof r.content === 'string' ? r.content : JSON.stringify(r.content)) : '';
        items.push({
          id: `${m.id}:${b.id}`,
          kind: 'tool',
          tool: b.name,
          input: b.input,
          needsApproval: needsApproval(b),
          pending: !r && isLast && status === 'awaiting_approval',
          result: resultText.slice(0, 8000),
          isError: !!r?.is_error,
          done: !!r,
          at: m.createdAt,
        });
      }
    }
  });
  return items;
}
