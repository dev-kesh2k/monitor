import { prisma } from './db.js';
import { hub, hubConnection } from './hub.js';

/** Coleta uma amostra por minuto enquanto houver conexão com o Hub (bucket único evita duplicar entre réplicas). */
const RETENTION_DAYS = 30;

async function collect() {
  const conn = await hubConnection();
  if (!conn.connected) return;
  const bucket = Math.floor(Date.now() / 60_000);
  if (await prisma.metricSample.findUnique({ where: { bucket } })) return;
  const [stats, temp] = await Promise.all([hub('GET', '/wsl/stats'), hub('GET', '/system/temperature').catch(() => null)]);
  const cpuGroup = temp?.groups?.find((g) => g.kind === 'cpu');
  const tempC = cpuGroup?.maxCelsius ?? (temp?.groups?.length ? Math.max(...temp.groups.map((g) => g.maxCelsius || 0)) : null);
  let load1 = null;
  try {
    const ov = await hub('GET', '/system/overview', undefined, { timeoutMs: 45_000 });
    load1 = ov?.host?.load?.[0] ?? null;
  } catch {
    /* sem carga nesta amostra */
  }
  await prisma.metricSample
    .create({
      data: {
        bucket,
        cpu: Number(stats.cpuUsage) || 0,
        memPercent: Number(stats.memoryPercent) || 0,
        memUsedGB: Number(stats.memoryUsedGB) || 0,
        diskPercent: Number(stats.diskPercent) || 0,
        tempC: Number.isFinite(tempC) ? tempC : null,
        load1,
        containers: Array.isArray(stats.dockerContainers) ? stats.dockerContainers.length : 0,
      },
    })
    .catch((e) => {
      if (e?.code !== 'P2002') throw e;
    });
}

async function prune() {
  await prisma.metricSample.deleteMany({ where: { at: { lt: new Date(Date.now() - RETENTION_DAYS * 86400_000) } } });
}

export function startMetricsLoop() {
  const tick = () => collect().catch((e) => console.warn('Coleta de métricas falhou:', e.message));
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000);
  setInterval(() => prune().catch(() => {}), 6 * 3600_000);
}

const RANGES = { '1h': 3600_000, '24h': 86400_000, '7d': 7 * 86400_000, '30d': 30 * 86400_000 };

/** Histórico agregado em no máximo ~120 pontos. */
export async function history(range) {
  const span = RANGES[range];
  if (!span) return null;
  const since = new Date(Date.now() - span);
  const rows = await prisma.metricSample.findMany({ where: { at: { gte: since } }, orderBy: { at: 'asc' } });
  const step = Math.max(1, Math.ceil(rows.length / 120));
  const points = [];
  for (let i = 0; i < rows.length; i += step) {
    const chunk = rows.slice(i, i + step);
    const avg = (k) => {
      const vals = chunk.map((r) => r[k]).filter((v) => v !== null && v !== undefined);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    };
    points.push({ at: chunk[chunk.length - 1].at, cpu: avg('cpu'), mem: avg('memPercent'), disk: avg('diskPercent'), temp: avg('tempC'), load: avg('load1') });
  }
  return { range, points, samples: rows.length };
}
