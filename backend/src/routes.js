import express from 'express';
import bcrypt from 'bcryptjs';
import { HttpError, deleteSetting, getJson, prisma, setSecret, setSetting, str, wrap } from './db.js';
import { clearFailures, publicUser, recordFailure, requireAuth, signToken, tooManyAttempts } from './auth.js';
import { assertName, connectHub, containerAction, disconnectHub, hub, hubConnection, runCommand, serverSnapshot, serviceAction } from './hub.js';
import { history } from './metrics.js';
import { DEFAULT_AGENT_CONFIG, EFFORTS, MODELS, agentConfig, cancel, decide, sendMessage, unstick, viewMessages } from './agent.js';

export const api = express.Router();

api.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

// ---------- Autenticação ----------
api.post(
  '/auth/login',
  wrap(async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) throw new HttpError(400, 'Informe e-mail e senha');
    const key = `${req.ip}|${email}`;
    if (tooManyAttempts(key)) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      recordFailure(key);
      throw new HttpError(401, 'E-mail ou senha inválidos');
    }
    clearFailures(key);
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

api.use(requireAuth);

api.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

api.put(
  '/me',
  wrap(async (req, res) => {
    const name = str(req.body?.name, 80);
    const email = str(req.body?.email, 200).toLowerCase();
    if (!name) throw new HttpError(400, 'Informe o nome');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido');
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { name, email } });
    res.json({ user: publicUser(user) });
  }),
);

api.put(
  '/me/password',
  wrap(async (req, res) => {
    const current = String(req.body?.current || '');
    const next = String(req.body?.next || '');
    if (!(await bcrypt.compare(current, req.user.passwordHash))) throw new HttpError(400, 'Senha atual incorreta');
    if (next.length < 10) throw new HttpError(400, 'A nova senha precisa ter pelo menos 10 caracteres');
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
    res.json({ ok: true });
  }),
);

// ---------- Conexão com o Hub ----------
const publicConn = ({ token, ...c }) => c;

api.get('/hub', wrap(async (_req, res) => res.json(publicConn(await hubConnection()))));

api.post(
  '/hub/connect',
  wrap(async (req, res) => {
    const username = str(req.body?.username, 100);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const otp = str(req.body?.otp, 8).replace(/\s/g, '');
    if (!username || !password) throw new HttpError(400, 'Informe usuário e senha do Hub');
    try {
      res.json(publicConn(await connectHub(username, password, otp)));
    } catch (e) {
      if (e.otpRequired) return res.status(400).json({ error: e.message, otpRequired: true });
      throw e;
    }
  }),
);

api.post(
  '/hub/disconnect',
  wrap(async (_req, res) => {
    await disconnectHub();
    res.json(publicConn(await hubConnection()));
  }),
);

// ---------- Monitoramento ----------
api.get('/overview', wrap(async (_req, res) => res.json(await serverSnapshot())));

api.get(
  '/metrics/history',
  wrap(async (req, res) => {
    const h = await history(String(req.query.range || '24h'));
    if (!h) throw new HttpError(400, 'Período inválido');
    res.json(h);
  }),
);

api.get(
  '/containers',
  wrap(async (_req, res) => {
    const [ops, stats] = await Promise.all([hub('GET', '/ops/status'), hub('GET', '/wsl/stats').catch(() => ({}))]);
    const usage = Object.fromEntries((stats.dockerContainers || []).map((c) => [c.name, c]));
    res.json({ containers: (ops.containers || []).map((c) => ({ ...c, usage: usage[c.name] || null })) });
  }),
);

api.get(
  '/containers/:name/logs',
  wrap(async (req, res) => {
    const name = assertName(req.params.name, 'Container');
    const tail = Math.min(Math.max(Number(req.query.tail) || 200, 10), 2000);
    const r = await hub('GET', `/ops/containers/${encodeURIComponent(name)}/logs?tail=${tail}`);
    res.json({ logs: String(r.logs || '').replace(/\x1b\[[0-9;]*m/g, '') });
  }),
);

api.post(
  '/containers/:name/:action',
  wrap(async (req, res) => {
    res.json(await containerAction(req.params.name, req.params.action, { userId: req.user.id }));
  }),
);

api.get('/services', wrap(async (_req, res) => res.json({ services: await hub('GET', '/services') })));

api.post(
  '/services/:name/:action',
  wrap(async (req, res) => {
    res.json(await serviceAction(req.params.name, req.params.action, { userId: req.user.id }));
  }),
);

api.get(
  '/logs',
  wrap(async (req, res) => {
    const rows = Math.min(Math.max(Number(req.query.rows) || 200, 10), 1000);
    const r = await hub('GET', `/logs?rows=${rows}`);
    res.json({ logs: r.logs || [] });
  }),
);

// ---------- Terminal ----------
api.post(
  '/commands',
  wrap(async (req, res) => {
    const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
    if (!command) throw new HttpError(400, 'Digite um comando');
    if (command.length > 10_000) throw new HttpError(400, 'Comando muito longo');
    const cwd = str(req.body?.cwd, 500);
    if (cwd && !cwd.startsWith('/')) throw new HttpError(400, 'A pasta precisa ser um caminho absoluto');
    res.json(await runCommand(command, { userId: req.user.id, source: 'terminal', timeoutSec: req.body?.timeoutSec, cwd: cwd || undefined }));
  }),
);

api.get(
  '/commands',
  wrap(async (req, res) => {
    const source = str(req.query.source, 20);
    const q = str(req.query.q, 200);
    const where = {
      ...(['terminal', 'agent', 'service', 'container'].includes(source) ? { source } : {}),
      ...(q ? { command: { contains: q, mode: 'insensitive' } } : {}),
    };
    const items = await prisma.commandLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { name: true } } } });
    res.json({ items: items.map((c) => ({ ...c, stdout: c.stdout.slice(-20_000), stderr: c.stderr.slice(-10_000) })) });
  }),
);

api.delete(
  '/commands',
  wrap(async (_req, res) => {
    const r = await prisma.commandLog.deleteMany({});
    res.json({ deleted: r.count });
  }),
);

// ---------- Agente ----------
async function ownConversation(req) {
  const conv = await prisma.conversation.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  return unstick(conv);
}

async function conversationView(conv) {
  const rows = await prisma.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } });
  const { userId, ...c } = conv;
  return { conversation: c, items: viewMessages(rows, conv.status) };
}

api.get(
  '/agent/conversations',
  wrap(async (req, res) => {
    const list = await prisma.conversation.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, title: true, status: true, updatedAt: true, createdAt: true },
    });
    res.json({ conversations: list });
  }),
);

api.post(
  '/agent/conversations',
  wrap(async (req, res) => {
    const text = str(req.body?.text, 20_000);
    if (text && !(await agentConfig()).key) throw new HttpError(400, 'Configure a chave da API da Anthropic em Configurações para usar o agente.');
    const conv = await prisma.conversation.create({ data: { userId: req.user.id } });
    if (text) await sendMessage(conv, req.user.id, text);
    res.status(201).json(await conversationView(await prisma.conversation.findUnique({ where: { id: conv.id } })));
  }),
);

api.get('/agent/conversations/:id', wrap(async (req, res) => res.json(await conversationView(await ownConversation(req)))));

api.put(
  '/agent/conversations/:id',
  wrap(async (req, res) => {
    const conv = await ownConversation(req);
    const title = str(req.body?.title, 80);
    if (!title) throw new HttpError(400, 'Informe o título');
    await prisma.conversation.update({ where: { id: conv.id }, data: { title } });
    res.json({ ok: true });
  }),
);

api.delete(
  '/agent/conversations/:id',
  wrap(async (req, res) => {
    const conv = await ownConversation(req);
    await prisma.conversation.delete({ where: { id: conv.id } });
    res.json({ ok: true });
  }),
);

api.post(
  '/agent/conversations/:id/messages',
  wrap(async (req, res) => {
    const conv = await ownConversation(req);
    const text = str(req.body?.text, 20_000);
    if (!text) throw new HttpError(400, 'Escreva uma mensagem');
    await sendMessage(conv, req.user.id, text);
    res.json(await conversationView(await prisma.conversation.findUnique({ where: { id: conv.id } })));
  }),
);

api.post(
  '/agent/conversations/:id/decision',
  wrap(async (req, res) => {
    const conv = await ownConversation(req);
    await decide(conv, req.user.id, req.body?.approve === true);
    res.json(await conversationView(await prisma.conversation.findUnique({ where: { id: conv.id } })));
  }),
);

api.post(
  '/agent/conversations/:id/cancel',
  wrap(async (req, res) => {
    const conv = await ownConversation(req);
    await cancel(conv);
    res.json(await conversationView(await prisma.conversation.findUnique({ where: { id: conv.id } })));
  }),
);

// ---------- Configurações do agente ----------
api.get(
  '/settings/agent',
  wrap(async (_req, res) => {
    const { key, ...cfg } = await agentConfig();
    res.json({ ...cfg, hasKey: !!key, models: MODELS, efforts: EFFORTS });
  }),
);

api.put(
  '/settings/agent',
  wrap(async (req, res) => {
    const current = await getJson('agent:config', DEFAULT_AGENT_CONFIG);
    const model = MODELS.some((m) => m.id === req.body?.model) ? req.body.model : current.model;
    const effort = EFFORTS.includes(req.body?.effort) ? req.body.effort : current.effort;
    const autoApprove = typeof req.body?.autoApprove === 'boolean' ? req.body.autoApprove : current.autoApprove;
    await setSetting('agent:config', JSON.stringify({ model, effort, autoApprove }));
    if (typeof req.body?.apiKey === 'string') {
      const k = req.body.apiKey.trim();
      if (k === '') await deleteSetting('agent:anthropicKey');
      else if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) throw new HttpError(400, 'Chave da Anthropic inválida (começa com sk-ant-)');
      else await setSecret('agent:anthropicKey', k);
    }
    const { key, ...cfg } = await agentConfig();
    res.json({ ...cfg, hasKey: !!key, models: MODELS, efforts: EFFORTS });
  }),
);
