import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Check, ChevronDown, Loader2, MessageSquarePlus, Pencil, Send, ShieldAlert, Square, Trash2, Wrench, X } from 'lucide-react';
import { api, useApi, type AgentItem, type AgentSettings, type ConversationSummary, type ConversationView } from '../api';
import { Empty, ErrorBox, Spinner, StatusBadge, fmtAgo, useConfirm } from '../ui';

const TOOL_LABEL: Record<string, string> = {
  get_server_status: 'Consultou o status do servidor',
  list_containers: 'Listou os containers',
  container_logs: 'Leu logs do container',
  list_services: 'Listou os serviços',
  system_logs: 'Leu os logs do sistema',
  metrics_history: 'Consultou o histórico de métricas',
  run_command: 'Comando no servidor',
  service_action: 'Ação em serviço',
  container_action: 'Ação em container',
};

const SUGGESTIONS = [
  'Como está a saúde do servidor agora?',
  'Algum container com problema? Veja os logs se tiver.',
  'Quanto espaço livre tem no disco e o que mais ocupa em /hub-apps?',
  'O último backup deu certo?',
];

/** Markdown mínimo: blocos de código, `código`, **negrito** e listas. */
function Markdown({ text }: { text: string }) {
  const parts = text.split(/```[a-zA-Z]*\n?/);
  return (
    <div className="space-y-2 break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="mono overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[#0f172a] p-3 text-[#e2e8f0]">
            {p.replace(/\n$/, '')}
          </pre>
        ) : (
          <Fragment key={i}>
            {p
              .split(/\n{2,}/)
              .filter((b) => b.trim())
              .map((block, j) => (
                <p key={j} className="whitespace-pre-wrap">
                  {inline(block.trim())}
                </p>
              ))}
          </Fragment>
        ),
      )}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((t, i) => {
    if (t.startsWith('`') && t.endsWith('`') && t.length > 2)
      return (
        <code key={i} className="rounded bg-[#eef2ff] px-1 py-0.5 font-mono text-[0.9em] text-[#3730a3]">
          {t.slice(1, -1)}
        </code>
      );
    if (t.startsWith('**') && t.endsWith('**') && t.length > 4) return <strong key={i}>{t.slice(2, -2)}</strong>;
    return t;
  });
}

function ToolCard({ item }: { item: AgentItem }) {
  const [open, setOpen] = useState(false);
  const input = item.input || {};
  const detail =
    item.tool === 'run_command'
      ? String(input.command || '')
      : item.tool === 'service_action'
        ? `systemctl ${input.action} ${input.service}`
        : item.tool === 'container_action'
          ? `docker ${input.action} ${input.name}`
          : item.tool === 'container_logs'
            ? String(input.name || '')
            : item.tool === 'metrics_history'
              ? String(input.range || '')
              : '';
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${item.pending ? 'border-[#fcd34d] bg-[#fffbeb]' : 'border-[#e8ecf4] bg-[#f8fafc]'}`}>
      <button className="flex w-full min-w-0 items-center gap-2 text-left" onClick={() => setOpen(!open)} disabled={!item.done}>
        {item.pending ? <ShieldAlert className="h-4 w-4 shrink-0 text-[#b45309]" /> : <Wrench className="h-4 w-4 shrink-0 text-[#64748b]" />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#334155]">{TOOL_LABEL[item.tool || ''] || item.tool}</span>
        {item.pending ? (
          <StatusBadge level="warn" label="Aguardando aprovação" />
        ) : item.done ? (
          <>
            <StatusBadge level={item.isError ? 'error' : 'ok'} label={item.isError ? 'Erro' : 'Feito'} />
            <ChevronDown className={`h-4 w-4 shrink-0 text-[#64748b] transition ${open ? 'rotate-180' : ''}`} />
          </>
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
        )}
      </button>
      {detail && <code className="mono mt-2 block break-all rounded-lg bg-white px-2 py-1.5 text-[#0f172a]">{detail}</code>}
      {typeof input.reason === 'string' && <p className="mt-1.5 text-sm text-[#475569]">{input.reason}</p>}
      {open && item.result && (
        <pre className="mono mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-[#0f172a] p-2 text-[#e2e8f0]">{item.result}</pre>
      )}
    </div>
  );
}

function ConversationList({ activeId, compact }: { activeId?: string; compact?: boolean }) {
  const list = useApi<{ conversations: ConversationSummary[] }>('/agent/conversations', 10_000);
  const nav = useNavigate();
  const items = list.data?.conversations || [];
  return (
    <div className="min-w-0">
      <button className="btn-primary mb-3 w-full" onClick={() => nav('/agente')}>
        <MessageSquarePlus className="h-5 w-5" /> Nova conversa
      </button>
      <ErrorBox message={list.error} onRetry={list.reload} />
      {list.loading && !list.data && <Spinner />}
      {list.data && items.length === 0 && !compact && <p className="px-1 text-sm text-[#64748b]">Nenhuma conversa ainda.</p>}
      <div className="space-y-1.5">
        {items.map((c) => (
          <Link
            key={c.id}
            to={`/agente/${c.id}`}
            className={`flex min-h-[56px] min-w-0 items-center gap-2 rounded-xl px-3 py-2 ${c.id === activeId ? 'bg-brand-light' : 'bg-white hover:bg-[#f8fafc]'} border border-[#e8ecf4]`}
          >
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${c.id === activeId ? 'text-brand' : ''}`}>{c.title}</p>
              <p className="text-xs text-[#64748b]">{fmtAgo(c.updatedAt)}</p>
            </div>
            {c.status === 'running' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />}
            {c.status === 'awaiting_approval' && <ShieldAlert className="h-4 w-4 shrink-0 text-[#b45309]" aria-label="Aguardando aprovação" />}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Composer({ onSend, disabled, placeholder }: { onSend: (t: string) => Promise<void>; disabled?: boolean; placeholder?: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <textarea
        className="input max-h-40 min-h-[48px] flex-1 resize-none"
        rows={1}
        placeholder={placeholder || 'Peça algo ao agente…'}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 768px)').matches) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Mensagem"
      />
      <button className="btn-primary h-12 w-12 shrink-0 px-0" disabled={disabled || busy || !text.trim()} aria-label="Enviar">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
      </button>
    </form>
  );
}

function NoKey() {
  return (
    <Empty
      icon={<Bot className="h-7 w-7" />}
      title="Configure o agente"
      text="Para o agente funcionar, salve a chave da API da Anthropic (console.anthropic.com) em Configurações."
      action={
        <Link to="/configuracoes" className="btn-primary">
          Abrir Configurações
        </Link>
      }
    />
  );
}

function NewChat() {
  const nav = useNavigate();
  const [error, setError] = useState('');
  const start = async (text: string) => {
    setError('');
    try {
      const r = await api.post<ConversationView>('/agent/conversations', { text });
      nav(`/agente/${r.conversation.id}`);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };
  return (
    <div className="flex min-h-[60dvh] flex-col justify-end gap-4 md:min-h-[calc(100dvh-4rem)]">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white">
          <Bot className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold">Agente do servidor</h2>
        <p className="mt-1 max-w-md text-sm text-[#64748b]">
          Pergunte sobre o servidor ou peça ações. Ele lê status, logs e containers sozinho; comandos que mudam algo esperam sua aprovação.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => start(s).catch(() => {})} className="card min-h-[48px] px-4 py-3 text-left text-sm font-medium active:scale-[0.99]">
            {s}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] -mx-1 bg-[#f4f6fb] px-1 pb-3 pt-1 md:bottom-0 md:pb-6">
        <Composer onSend={start} />
      </div>
    </div>
  );
}

function Chat({ id }: { id: string }) {
  const nav = useNavigate();
  const [view, setView] = useState<ConversationView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const lastCount = useRef(0);

  const load = async () => {
    try {
      const v = await api.get<ConversationView>(`/agent/conversations/${id}`);
      setView(v);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    setView(null);
    lastCount.current = 0;
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = view?.conversation.status;
  useEffect(() => {
    if (status !== 'running') return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [status, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const n = view?.items.length || 0;
    if (n !== lastCount.current) {
      lastCount.current = n;
      bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [view, status]);

  const send = async (text: string) => {
    setError('');
    try {
      setView(await api.post<ConversationView>(`/agent/conversations/${id}/messages`, { text }));
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError('');
    try {
      setView(await api.post<ConversationView>(`/agent/conversations/${id}/decision`, { approve }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    try {
      setView(await api.post<ConversationView>(`/agent/conversations/${id}/cancel`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const rename = async () => {
    const title = window.prompt('Novo título da conversa', view?.conversation.title || '');
    if (!title?.trim()) return;
    await api.put(`/agent/conversations/${id}`, { title: title.trim() }).catch((e) => setError(e.message));
    load();
  };

  const remove = async () => {
    if (!(await confirm.ask('Apagar conversa?', 'A conversa e todo o histórico dela serão apagados.', true))) return;
    await api.del(`/agent/conversations/${id}`);
    nav('/agente');
  };

  if (!view && !error) return <Spinner />;
  if (!view) return <ErrorBox message={error} onRetry={load} />;
  const pending = view.items.filter((i) => i.pending);

  return (
    <div className="flex min-h-[calc(100dvh-60px-env(safe-area-inset-bottom)-max(1rem,env(safe-area-inset-top)))] flex-col md:min-h-[calc(100dvh-2rem)]">
      <header className="mb-3 flex min-h-[44px] items-center gap-1">
        <Link to="/agente" className="icon-btn -ml-2 md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{view.conversation.title}</h1>
        <button className="icon-btn" onClick={rename} aria-label="Renomear">
          <Pencil className="h-5 w-5" />
        </button>
        <button className="icon-btn text-[#b91c1c]" onClick={remove} aria-label="Apagar conversa">
          <Trash2 className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3">
        {view.items.map((it) =>
          it.kind === 'user' ? (
            <div key={it.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-white">{it.text}</div>
            </div>
          ) : it.kind === 'assistant' ? (
            <div key={it.id} className="flex gap-2">
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
                <Bot className="h-4 w-4" />
              </div>
              <div className="card min-w-0 max-w-[92%] px-4 py-3 text-[15px]">
                <Markdown text={it.text || ''} />
              </div>
            </div>
          ) : (
            <div key={it.id} className="pl-9">
              <ToolCard item={it} />
            </div>
          ),
        )}
        {status === 'running' && (
          <div className="flex items-center gap-2 pl-9 text-sm text-[#64748b]">
            <Loader2 className="h-4 w-4 animate-spin text-brand" /> Pensando…
            <button onClick={stop} className="ml-2 inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2 font-semibold text-[#475569]">
              <Square className="h-3.5 w-3.5" /> Parar
            </button>
          </div>
        )}
        {view.conversation.error && <ErrorBox message={view.conversation.error} />}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] z-10 -mx-1 mt-3 bg-[#f4f6fb] px-1 pb-3 pt-1 md:bottom-0 md:pb-6">
        <ErrorBox message={error} />
        {status === 'awaiting_approval' ? (
          <div className="card mt-2 border-[#fcd34d] p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#92400e]">
              <ShieldAlert className="h-4 w-4" /> O agente quer executar {pending.length > 1 ? `${pending.length} ações` : 'uma ação'} no servidor
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-outline" disabled={busy} onClick={() => decide(false)}>
                <X className="h-5 w-5" /> Recusar
              </button>
              <button className="btn-primary" disabled={busy} onClick={() => decide(true)}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Aprovar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Composer onSend={send} disabled={status === 'running'} placeholder={status === 'running' ? 'Aguarde o agente terminar…' : undefined} />
          </div>
        )}
      </div>
      {confirm.node}
    </div>
  );
}

export default function Agent() {
  const { id } = useParams();
  const settings = useApi<AgentSettings>('/settings/agent');
  const content = settings.loading && !settings.data ? <Spinner /> : settings.data && !settings.data.hasKey ? <NoKey /> : id ? <Chat id={id} /> : <NewChat />;

  return (
    <div className="md:grid md:grid-cols-[16rem_1fr] md:gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="hidden md:sticky md:top-8 md:block md:max-h-[calc(100dvh-4rem)] md:overflow-y-auto">
        <h1 className="mb-3 text-2xl font-bold">Agente</h1>
        <ConversationList activeId={id} />
      </aside>
      <div className="min-w-0">
        {!id && (
          <div className="mb-4 md:hidden">
            <h1 className="mb-3 text-2xl font-bold">Agente</h1>
            <details className="card p-3">
              <summary className="flex min-h-[40px] cursor-pointer items-center font-semibold">Conversas anteriores</summary>
              <div className="mt-2">
                <ConversationList compact />
              </div>
            </details>
          </div>
        )}
        <ErrorBox message={settings.error} onRetry={settings.reload} />
        {content}
      </div>
    </div>
  );
}
