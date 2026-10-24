import { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useApi } from '../api';
import { HubError, PageHeader, Spinner } from '../ui';

export default function Logs() {
  const [rows, setRows] = useState(200);
  const [q, setQ] = useState('');
  const logs = useApi<{ logs: string[] }>(`/logs?rows=${rows}`);
  const lines = (logs.data?.logs || []).filter((l) => !q || l.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Logs do sistema"
        subtitle="journalctl"
        right={
          <button className="icon-btn" onClick={logs.reload} aria-label="Atualizar">
            <RefreshCw className={`h-5 w-5 ${logs.loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94a3b8]" />
          <input className="input pl-10" placeholder="Filtrar linhas" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar" />
        </div>
        <select className="input sm:w-40" value={rows} onChange={(e) => setRows(Number(e.target.value))} aria-label="Quantidade de linhas">
          {[100, 200, 500, 1000].map((n) => (
            <option key={n} value={n}>
              {n} linhas
            </option>
          ))}
        </select>
      </div>
      {!logs.data && logs.loading && <Spinner />}
      {!logs.data && <HubError message={logs.error} status={logs.status} onRetry={logs.reload} />}
      {logs.data && (
        <div className="card overflow-hidden">
          <p className="border-b border-[#eef2f7] px-4 py-2 text-sm text-[#64748b]">{lines.length} linhas</p>
          <pre className="mono max-h-[70dvh] overflow-y-auto whitespace-pre-wrap break-all bg-[#0f172a] p-3 text-[#e2e8f0]">
            {lines.length ? lines.slice().reverse().join('\n') : '(nada encontrado)'}
          </pre>
        </div>
      )}
    </div>
  );
}
