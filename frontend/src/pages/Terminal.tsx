import { useState, type FormEvent } from 'react';
import { Bot, History, Loader2, Play, SquareTerminal, Trash2, User } from 'lucide-react';
import { api, useApi, type CommandResult } from '../api';
import { Empty, ErrorBox, PageHeader, StatusBadge, fmtAgo, useConfirm } from '../ui';

const SOURCES = [
  { id: '', label: 'Todos' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'agent', label: 'Agente' },
  { id: 'service', label: 'Serviços' },
  { id: 'container', label: 'Containers' },
];

function Output({ r }: { r: CommandResult }) {
  return (
    <pre className="mono max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-all rounded-xl bg-[#0f172a] p-3 text-[#e2e8f0]">
      {r.stdout}
      {r.stderr && <span className="text-[#fca5a5]">{r.stderr}</span>}
      {!r.stdout && !r.stderr && <span className="text-[#94a3b8]">(sem saída)</span>}
    </pre>
  );
}

export default function Terminal() {
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState<CommandResult | null>(null);
  const [source, setSource] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const hist = useApi<{ items: CommandResult[] }>(`/commands${source ? `?source=${source}` : ''}`);
  const confirm = useConfirm();

  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!command.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post<CommandResult>('/commands', { command, cwd: cwd.trim() || undefined, timeoutSec });
      setLast(r);
      hist.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!(await confirm.ask('Limpar histórico?', 'Todos os comandos gravados (terminal, agente, serviços e containers) serão apagados.', true))) return;
    await api.del('/commands').catch((e) => setError(e.message));
    hist.reload();
  };

  return (
    <div>
      <PageHeader title="Terminal" subtitle="Comandos como root no servidor" />
      <form onSubmit={run} className="card space-y-3 p-4">
        <textarea
          className="input mono min-h-[96px] resize-y font-mono"
          placeholder="ex.: docker ps --format '{{.Names}}' | head"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
          }}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Comando"
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
          <input className="input" placeholder="Pasta (opcional, ex.: /opt/hub)" value={cwd} onChange={(e) => setCwd(e.target.value)} autoCapitalize="off" aria-label="Pasta" />
          <select className="input" value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))} aria-label="Tempo máximo">
            {[30, 60, 120, 300, 600].map((s) => (
              <option key={s} value={s}>
                Limite {s < 60 ? `${s}s` : `${s / 60} min`}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={busy || !command.trim()}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />} Executar
          </button>
        </div>
        <ErrorBox message={error} />
        {last && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm">
              <StatusBadge level={last.exitCode === 0 ? 'ok' : 'error'} label={`saída ${last.exitCode}`} />
              <span className="text-[#64748b]">{(last.durationMs / 1000).toFixed(1)} s</span>
            </div>
            <Output r={last} />
          </div>
        )}
      </form>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex flex-1 items-center gap-2 text-lg font-bold">
            <History className="h-5 w-5 text-brand" /> Histórico
          </h2>
          <button className="icon-btn text-[#b91c1c]" onClick={clear} aria-label="Limpar histórico">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {SOURCES.map((s) => (
            <button key={s.id} onClick={() => setSource(s.id)} className={`chip ${source === s.id ? 'border-brand bg-brand text-white' : 'border-[#e2e8f0] bg-white text-[#475569]'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <ErrorBox message={hist.error} onRetry={hist.reload} />
        {hist.data && hist.data.items.length === 0 && <Empty icon={<SquareTerminal className="h-7 w-7" />} title="Nenhum comando ainda" />}
        <div className="space-y-2">
          {hist.data?.items.map((c) => (
            <div key={c.id} className="card min-w-0 p-3">
              <button className="flex w-full min-w-0 items-start gap-2 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <span className="mt-0.5 shrink-0 text-[#64748b]">{c.source === 'agent' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}</span>
                <code className="mono min-w-0 flex-1 break-all">{c.command}</code>
                <StatusBadge level={c.exitCode === 0 ? 'ok' : 'error'} label={String(c.exitCode)} />
              </button>
              <p className="mt-1 pl-6 text-xs text-[#64748b]">
                {c.source} · {c.user?.name || '—'} · {fmtAgo(c.createdAt)}
              </p>
              {open === c.id && (
                <div className="mt-2 space-y-2">
                  <Output r={c} />
                  <button className="btn-outline w-full text-sm" onClick={() => setCommand(c.command)}>
                    Usar este comando
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      {confirm.node}
    </div>
  );
}
