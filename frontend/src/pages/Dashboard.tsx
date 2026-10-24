import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Cpu, HardDrive, MemoryStick, RefreshCw, Shield, Thermometer, Archive, Boxes } from 'lucide-react';
import { useApi, type HistoryPoint, type Snapshot } from '../api';
import { LineChart, Meter } from '../chart';
import { HubError, PageHeader, Spinner, StatusBadge, fmtAgo, fmtBytes, fmtUptime, levelFor, type Level } from '../ui';

function Tile({ icon, label, value, sub, pct, level }: { icon: React.ReactNode; label: string; value: string; sub?: string; pct?: number; level: Level }) {
  return (
    <div className="card min-w-0 p-4">
      <div className="mb-2 flex items-center gap-2 text-[#64748b]">
        {icon}
        <span className="truncate text-sm font-semibold">{label}</span>
      </div>
      <p className="text-[clamp(1.4rem,6vw,1.9rem)] font-bold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-[#64748b]">{sub}</p>}
      {pct !== undefined && (
        <div className="mt-3">
          <Meter pct={pct} level={level} />
        </div>
      )}
    </div>
  );
}

const RANGES = ['1h', '24h', '7d', '30d'] as const;
const SERIES: { key: keyof HistoryPoint; title: string; unit: string; max?: number }[] = [
  { key: 'cpu', title: 'CPU (%)', unit: '%', max: 100 },
  { key: 'mem', title: 'Memória (%)', unit: '%', max: 100 },
  { key: 'temp', title: 'Temperatura da CPU (°C)', unit: '°C' },
  { key: 'disk', title: 'Disco (%)', unit: '%', max: 100 },
];

export default function Dashboard() {
  const snap = useApi<Snapshot>('/overview', 15_000);
  const [range, setRange] = useState<(typeof RANGES)[number]>('24h');
  const hist = useApi<{ points: HistoryPoint[]; samples: number }>(`/metrics/history?range=${range}`, 60_000);
  const d = snap.data;

  if (!d && snap.loading) return <Spinner />;
  if (!d)
    return (
      <div>
        <PageHeader title="Painel" />
        <HubError message={snap.error} status={snap.status} onRetry={snap.reload} />
      </div>
    );

  const s = d.stats;
  const host = d.overview?.host;
  const cpuTemp = d.temperature?.groups?.find((g) => g.kind === 'cpu')?.maxCelsius;
  const alerts = d.overview?.alerts || [];
  const sec = d.overview?.security;
  const running = d.containers.filter((c) => c.state === 'running').length;
  const stopped = d.containers.length - running;
  const servicesDown = (d.overview?.services || []).filter((x) => !x.active);
  const overall: Level = alerts.some((a) => a.level === 'error') || stopped > 0 || servicesDown.length ? 'error' : alerts.length ? 'warn' : 'ok';

  return (
    <div>
      <PageHeader
        title="Painel"
        subtitle={host ? `${host.hostname} · ${host.os}` : 'Servidor do Hub'}
        right={
          <button className="icon-btn" onClick={snap.reload} aria-label="Atualizar">
            <RefreshCw className={`h-5 w-5 ${snap.loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      {snap.error && <p className="mb-3 text-sm text-[#b91c1c]">Falha ao atualizar: {snap.error}</p>}

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <StatusBadge level={overall} label={overall === 'ok' ? 'Tudo funcionando' : overall === 'warn' ? 'Atenção' : 'Precisa de atenção'} />
        <span className="min-w-0 flex-1 text-sm text-[#475569]">
          Ligado há {fmtUptime(host?.uptimeSec)} · carga {host?.load?.map((l) => l.toFixed(2)).join(' / ') ?? '—'} · atualizado {fmtAgo(d.at)}
        </span>
        <Link to="/agente" className="btn-primary w-full sm:w-auto">
          <Bot className="h-5 w-5" /> Perguntar ao agente
        </Link>
      </div>

      {(alerts.length > 0 || stopped > 0 || servicesDown.length > 0) && (
        <div className="card mb-4 space-y-2 p-4">
          <h2 className="font-bold">Alertas</h2>
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <StatusBadge level={a.level === 'error' ? 'error' : 'warn'} />
              <span className="min-w-0 break-words">{a.text}</span>
            </div>
          ))}
          {stopped > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <StatusBadge level="error" />
              <Link to="/containers" className="min-w-0 break-words underline">
                {stopped} container(s) fora do ar
              </Link>
            </div>
          )}
          {servicesDown.map((x) => (
            <div key={x.unit} className="flex items-start gap-2 text-sm">
              <StatusBadge level="error" />
              <span className="min-w-0 break-words">{x.label} parado</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Cpu className="h-4 w-4" />} label="CPU" value={`${s.cpuUsage?.toFixed(0) ?? '—'}%`} sub={host ? `${host.cores} núcleos` : undefined} pct={s.cpuUsage} level={levelFor(s.cpuUsage)} />
        <Tile
          icon={<MemoryStick className="h-4 w-4" />}
          label="Memória"
          value={`${s.memoryPercent?.toFixed(0) ?? '—'}%`}
          sub={`${s.memoryUsedGB?.toFixed(1)} de ${s.memoryTotalGB?.toFixed(1)} GB`}
          pct={s.memoryPercent}
          level={levelFor(s.memoryPercent, 80, 92)}
        />
        <Tile
          icon={<HardDrive className="h-4 w-4" />}
          label="Disco"
          value={`${s.diskPercent ?? '—'}%`}
          sub={`${s.diskUsedGB?.toFixed(0)} de ${s.diskTotalGB?.toFixed(0)} GB`}
          pct={s.diskPercent}
          level={levelFor(s.diskPercent, 80, 90)}
        />
        <Tile
          icon={<Thermometer className="h-4 w-4" />}
          label="Temperatura"
          value={cpuTemp !== undefined ? `${Math.round(cpuTemp)}°C` : '—'}
          sub="CPU (máxima)"
          pct={cpuTemp !== undefined ? Math.min(100, cpuTemp) : undefined}
          level={cpuTemp !== undefined ? levelFor(cpuTemp, 75, 88) : 'off'}
        />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Histórico</h2>
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`chip ${range === r ? 'border-brand bg-brand text-white' : 'border-[#e2e8f0] bg-white text-[#475569]'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {SERIES.map((ser) => (
            <div key={ser.key} className="card min-w-0 p-4">
              <p className="mb-2 text-sm font-semibold text-[#475569]">{ser.title}</p>
              <LineChart points={(hist.data?.points || []).map((p) => ({ at: p.at, v: p[ser.key] as number | null }))} unit={ser.unit} max={ser.max} />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="card min-w-0 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Boxes className="h-5 w-5 text-brand" /> Containers
          </h2>
          <p className="text-3xl font-bold">
            {running}
            <span className="text-base font-semibold text-[#64748b]"> / {d.containers.length} rodando</span>
          </p>
          <Link to="/containers" className="btn-outline mt-3 w-full">
            Ver containers
          </Link>
        </div>

        <div className="card min-w-0 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Shield className="h-5 w-5 text-brand" /> Segurança
          </h2>
          {sec ? (
            <ul className="space-y-2 text-sm">
              <Row label="Firewall" level={sec.firewall ? 'ok' : 'error'} text={sec.firewall ? 'Ativo' : 'Desligado'} />
              <Row label="Fail2ban" level={sec.fail2ban ? 'ok' : 'warn'} text={sec.fail2ban ? `${sec.bannedNow} bloqueados agora` : 'Desligado'} />
              <Row label="Atualizações" level={sec.securityUpdates ? 'warn' : 'ok'} text={`${sec.updates} (${sec.securityUpdates} de segurança)`} />
              <Row label="Reinício pendente" level={sec.rebootRequired ? 'warn' : 'ok'} text={sec.rebootRequired ? 'Sim' : 'Não'} />
            </ul>
          ) : (
            <p className="text-sm text-[#64748b]">Sem dados.</p>
          )}
        </div>

        <div className="card min-w-0 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Archive className="h-5 w-5 text-brand" /> Backup
          </h2>
          {d.backup?.configured ? (
            <ul className="space-y-2 text-sm">
              <Row label="Último" level={d.backup.lastRunOk ? 'ok' : 'error'} text={fmtAgo(d.backup.lastRunAt)} />
              <Row label="Versões" level="ok" text={String(d.backup.versions ?? '—')} />
              <Row label="Tamanho" level="ok" text={fmtBytes(d.backup.backupBytes)} />
              <Row label="Livre no destino" level="ok" text={fmtBytes(d.backup.diskFreeBytes)} />
            </ul>
          ) : (
            <p className="text-sm text-[#64748b]">Backup não configurado.</p>
          )}
        </div>

        {(d.overview?.disks || []).map((disk) => (
          <div key={disk.device} className="card min-w-0 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <HardDrive className="h-5 w-5 text-brand" /> <span className="truncate">{disk.model}</span>
            </h2>
            <ul className="space-y-2 text-sm">
              <Row label="Saúde (SMART)" level={disk.healthy ? 'ok' : 'error'} text={disk.healthy ? 'Saudável' : 'Com falhas'} />
              <Row label="Vida útil" level={levelFor(100 - disk.lifeLeft, 70, 90)} text={`${disk.lifeLeft}%`} />
              <Row label="Temperatura" level={levelFor(disk.celsius, 50, 60)} text={`${disk.celsius}°C`} />
              <Row label="Horas ligado" level="ok" text={disk.powerOnHours.toLocaleString('pt-BR')} />
            </ul>
          </div>
        ))}

        {(d.overview?.services || []).length > 0 && (
          <div className="card min-w-0 p-4 md:col-span-2 lg:col-span-3">
            <h2 className="mb-3 font-bold">Serviços principais</h2>
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {d.overview.services!.map((x) => (
                <li key={x.unit} className="flex min-w-0 items-center gap-2">
                  <StatusBadge level={x.active ? 'ok' : 'error'} label={x.active ? 'Ativo' : 'Parado'} />
                  <span className="min-w-0 truncate">{x.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, text, level }: { label: string; text: string; level: Level }) {
  return (
    <li className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[#475569]">{label}</span>
      <StatusBadge level={level} label={text} />
    </li>
  );
}
