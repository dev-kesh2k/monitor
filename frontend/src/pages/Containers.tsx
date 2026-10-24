import { useState } from 'react';
import { Boxes, FileText, Play, RefreshCw, RotateCw, Search, Square } from 'lucide-react';
import { api, useApi, type CommandResult, type Container } from '../api';
import { Empty, ErrorBox, HubError, PageHeader, Sheet, Spinner, StatusBadge, Toast, useConfirm } from '../ui';

export default function Containers() {
  const list = useApi<{ containers: Container[] }>('/containers', 20_000);
  const [q, setQ] = useState('');
  const [logsOf, setLogsOf] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [result, setResult] = useState<CommandResult | null>(null);
  const confirm = useConfirm();

  const act = async (c: Container, action: 'start' | 'stop' | 'restart') => {
    const verb = { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar' }[action];
    if (!(await confirm.ask(`${verb} ${c.name}?`, `O container ${c.name} vai ${action === 'start' ? 'ser iniciado' : action === 'stop' ? 'parar (o serviço sai do ar)' : 'reiniciar (fica fora do ar alguns segundos)'}.`, action !== 'start'))) return;
    setBusy(`${c.name}:${action}`);
    try {
      const r = await api.post<CommandResult>(`/containers/${encodeURIComponent(c.name)}/${action}`);
      if (r.exitCode === 0) setToast(`${c.name}: ${verb.toLowerCase()} OK`);
      else setResult(r);
      list.reload();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const items = (list.data?.containers || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.image.toLowerCase().includes(q.toLowerCase()));
  const running = (list.data?.containers || []).filter((c) => c.state === 'running').length;

  return (
    <div>
      <PageHeader
        title="Containers"
        subtitle={list.data ? `${running} de ${list.data.containers.length} rodando` : undefined}
        right={
          <button className="icon-btn" onClick={list.reload} aria-label="Atualizar">
            <RefreshCw className={`h-5 w-5 ${list.loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      {!list.data && list.loading && <Spinner />}
      {!list.data && <HubError message={list.error} status={list.status} onRetry={list.reload} />}
      {list.data && (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94a3b8]" />
            <input className="input pl-10" placeholder="Buscar container ou imagem" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          </div>
          {items.length === 0 ? (
            <Empty icon={<Boxes className="h-7 w-7" />} title="Nenhum container encontrado" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((c) => {
                const up = c.state === 'running';
                const healthy = !/unhealthy/i.test(c.status);
                return (
                  <div key={c.name} className="card min-w-0 p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{c.name}</p>
                        <p className="truncate text-xs text-[#64748b]">{c.image}</p>
                      </div>
                      <StatusBadge level={!up ? 'error' : healthy ? 'ok' : 'warn'} label={!up ? 'Parado' : healthy ? 'Rodando' : 'Instável'} />
                    </div>
                    <p className="mt-2 truncate text-sm text-[#475569]">{c.status}</p>
                    {c.usage && (
                      <p className="mt-1 text-sm text-[#475569]">
                        CPU {c.usage.cpuPercent}% · RAM {Math.round(c.usage.memUsedMB)} / {Math.round(c.usage.memLimitMB)} MB
                      </p>
                    )}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button className="btn-outline px-2 text-sm" onClick={() => setLogsOf(c.name)}>
                        <FileText className="h-4 w-4" /> Logs
                      </button>
                      <button className="btn-outline px-2 text-sm" disabled={!!busy} onClick={() => act(c, 'restart')}>
                        <RotateCw className={`h-4 w-4 ${busy === `${c.name}:restart` ? 'animate-spin' : ''}`} /> Reiniciar
                      </button>
                      {up ? (
                        <button className="btn-outline px-2 text-sm text-[#b91c1c]" disabled={!!busy} onClick={() => act(c, 'stop')}>
                          <Square className="h-4 w-4" /> Parar
                        </button>
                      ) : (
                        <button className="btn-outline px-2 text-sm text-[#047857]" disabled={!!busy} onClick={() => act(c, 'start')}>
                          <Play className="h-4 w-4" /> Iniciar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <LogsSheet name={logsOf} onClose={() => setLogsOf(null)} />
      <Sheet open={!!result} title="Resultado" onClose={() => setResult(null)}>
        {result && <pre className="mono whitespace-pre-wrap break-words rounded-xl bg-[#0f172a] p-3 text-[#e2e8f0]">{`exit=${result.exitCode}\n${result.stdout}${result.stderr}`}</pre>}
      </Sheet>
      {confirm.node}
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

function LogsSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const [tail, setTail] = useState(200);
  const logs = useApi<{ logs: string }>(name ? `/containers/${encodeURIComponent(name)}/logs?tail=${tail}` : null);
  return (
    <Sheet open={!!name} title={`Logs · ${name}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[100, 200, 500, 1000].map((n) => (
          <button key={n} onClick={() => setTail(n)} className={`chip ${tail === n ? 'border-brand bg-brand text-white' : 'border-[#e2e8f0] bg-white text-[#475569]'}`}>
            {n} linhas
          </button>
        ))}
        <button className="icon-btn ml-auto" onClick={logs.reload} aria-label="Atualizar logs">
          <RefreshCw className={`h-5 w-5 ${logs.loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {logs.loading && !logs.data ? (
        <Spinner />
      ) : (
        <>
          <ErrorBox message={logs.error} />
          {logs.data && (
            <pre className="mono max-w-full whitespace-pre-wrap break-all rounded-xl bg-[#0f172a] p-3 text-[#e2e8f0]">{logs.data.logs || '(sem logs)'}</pre>
          )}
        </>
      )}
    </Sheet>
  );
}
