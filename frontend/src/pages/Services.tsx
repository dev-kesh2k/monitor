import { useState } from 'react';
import { Info, Play, RefreshCw, RotateCw, Search, Server, Square } from 'lucide-react';
import { api, useApi, type CommandResult, type Service } from '../api';
import { Empty, HubError, PageHeader, Sheet, Spinner, StatusBadge, useConfirm } from '../ui';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'running', label: 'Rodando' },
  { id: 'failed', label: 'Com falha' },
  { id: 'hub', label: 'Do Hub' },
] as const;

export default function Services() {
  const list = useApi<{ services: Service[] }>('/services', 30_000);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ title: string; r: CommandResult } | null>(null);
  const [error, setError] = useState('');
  const confirm = useConfirm();

  const act = async (s: Service, action: 'start' | 'stop' | 'restart' | 'status') => {
    const verb = { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar', status: 'Status' }[action];
    if (action !== 'status') {
      const warn = s.name.startsWith('hub-backend') ? ' Atenção: isso derruba o painel do Hub e o Monitor por alguns segundos.' : '';
      if (!(await confirm.ask(`${verb} ${s.name}?`, `${verb} a unidade ${s.name}.${warn}`, action !== 'start'))) return;
    }
    setBusy(`${s.name}:${action}`);
    setError('');
    try {
      const r = await api.post<CommandResult>(`/services/${encodeURIComponent(s.name)}/${action}`);
      setResult({ title: `${verb} · ${s.name}`, r });
      if (action !== 'status') list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const all = list.data?.services || [];
  const items = all.filter((s) => {
    if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'running') return s.sub === 'running';
    if (filter === 'failed') return s.active === 'failed';
    if (filter === 'hub') return /^(hub-|actions\.runner|docker|cloudflared|fail2ban)/.test(s.name);
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Serviços"
        subtitle={list.data ? `${all.length} unidades systemd` : undefined}
        right={
          <button className="icon-btn" onClick={list.reload} aria-label="Atualizar">
            <RefreshCw className={`h-5 w-5 ${list.loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      {!list.data && list.loading && <Spinner />}
      {!list.data && <HubError message={list.error} status={list.status} onRetry={list.reload} />}
      {error && <p className="mb-3 break-words text-sm text-[#b91c1c]">{error}</p>}
      {list.data && (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94a3b8]" />
            <input className="input pl-10" placeholder="Buscar serviço" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`chip ${filter === f.id ? 'border-brand bg-brand text-white' : 'border-[#e2e8f0] bg-white text-[#475569]'}`}>
                {f.label}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <Empty icon={<Server className="h-7 w-7" />} title="Nenhum serviço encontrado" />
          ) : (
            <div className="card divide-y divide-[#eef2f7]">
              {items.map((s) => {
                const on = s.sub === 'running' || s.active === 'active';
                return (
                  <div key={s.name} className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 truncate font-semibold">{s.name}</p>
                        <StatusBadge level={s.active === 'failed' ? 'error' : on ? 'ok' : 'off'} label={`${s.active}/${s.sub}`} />
                      </div>
                      <p className="truncate text-sm text-[#64748b]">{s.description}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 lg:flex">
                      <button className="btn-outline px-2 text-sm" disabled={!!busy} onClick={() => act(s, 'status')}>
                        <Info className="h-4 w-4" /> Status
                      </button>
                      <button className="btn-outline px-2 text-sm" disabled={!!busy} onClick={() => act(s, 'restart')}>
                        <RotateCw className={`h-4 w-4 ${busy === `${s.name}:restart` ? 'animate-spin' : ''}`} /> Reiniciar
                      </button>
                      {on ? (
                        <button className="btn-outline px-2 text-sm text-[#b91c1c]" disabled={!!busy} onClick={() => act(s, 'stop')}>
                          <Square className="h-4 w-4" /> Parar
                        </button>
                      ) : (
                        <button className="btn-outline px-2 text-sm text-[#047857]" disabled={!!busy} onClick={() => act(s, 'start')}>
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
      <Sheet open={!!result} title={result?.title || ''} onClose={() => setResult(null)} wide>
        {result && <pre className="mono whitespace-pre-wrap break-words rounded-xl bg-[#0f172a] p-3 text-[#e2e8f0]">{`${result.r.stdout}${result.r.stderr}` || '(sem saída)'}</pre>}
      </Sheet>
      {confirm.node}
    </div>
  );
}
