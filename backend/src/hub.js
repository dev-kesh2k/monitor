import { HttpError, deleteSetting, getJson, getSecret, prisma, setSecret, setSetting } from './db.js';

/** Cliente da API do Central Apps Hub (sessão Bearer obtida no login, guardada cifrada no banco). */
const HUB_API_URL = String(process.env.HUB_API_URL || '').replace(/\/+$/, '');
const SESSION_HOURS = Number(process.env.HUB_SESSION_HOURS) || 12;

export const hubConfigured = () => !!HUB_API_URL;

export async function hubConnection() {
  const meta = await getJson('hub:meta', { username: '', connectedAt: null, expiresAt: null, lastError: '' });
  const token = await getSecret('hub:token');
  const expired = meta.expiresAt && Date.parse(meta.expiresAt) < Date.now();
  return { ...meta, connected: !!token && !expired, url: HUB_API_URL, token: token && !expired ? token : null };
}

async function raw(method, path, { token, body, timeoutMs = 30_000 } = {}) {
  if (!HUB_API_URL) throw new HttpError(500, 'HUB_API_URL não configurado no servidor do Monitor');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${HUB_API_URL}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Monitor-App/1.0',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new HttpError(502, e?.name === 'AbortError' ? 'O Hub demorou demais para responder' : 'Não foi possível falar com o Hub');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: `Resposta inesperada do Hub (${res.status})` };
  }
  return { status: res.status, ok: res.ok, data };
}

/** Login no Hub (usuário/senha do Hub + código 2FA, se houver). A senha não é guardada. */
export async function connectHub(username, password, otp) {
  const r = await raw('POST', '/auth/login', { body: { username, password, ...(otp ? { otp } : {}) } });
  if (!r.ok) {
    const err = new HttpError(r.status === 401 || r.status === 403 ? 400 : 502, r.data.error || 'Falha no login do Hub');
    err.otpRequired = !!r.data.otpRequired;
    throw err;
  }
  if (!r.data.token) throw new HttpError(502, 'O Hub não devolveu o token de sessão');
  if (r.data.role !== 'admin') throw new HttpError(400, 'Use um usuário administrador do Hub');
  await setSecret('hub:token', r.data.token);
  const now = new Date();
  await setSetting(
    'hub:meta',
    JSON.stringify({
      username: r.data.user || username,
      connectedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString(),
      lastError: '',
    }),
  );
  return hubConnection();
}

export async function disconnectHub() {
  const token = await getSecret('hub:token');
  if (token) await raw('POST', '/auth/logout', { token, body: {} }).catch(() => {});
  await deleteSetting('hub:token');
  const meta = await getJson('hub:meta', {});
  await setSetting('hub:meta', JSON.stringify({ ...meta, expiresAt: null, lastError: 'Desconectado' }));
}

/** Chamada autenticada à API do Hub; 401 derruba a conexão salva. */
export async function hub(method, path, body, opts = {}) {
  const conn = await hubConnection();
  if (!conn.token) throw new HttpError(409, 'Monitor não está conectado ao Hub. Conecte em Configurações.');
  const r = await raw(method, path, { token: conn.token, body, ...opts });
  if (r.status === 401) {
    await deleteSetting('hub:token');
    const meta = await getJson('hub:meta', {});
    await setSetting('hub:meta', JSON.stringify({ ...meta, expiresAt: null, lastError: 'A sessão no Hub expirou' }));
    throw new HttpError(409, 'A sessão no Hub expirou. Conecte de novo em Configurações.');
  }
  if (!r.ok) throw new HttpError(r.status >= 500 ? 502 : 400, r.data.error || r.data.stderr || `Hub respondeu ${r.status}`);
  return r.data;
}

/** Executa um comando como root no servidor (via Hub) e grava no histórico. */
export async function runCommand(command, { userId = null, source = 'terminal', timeoutSec = 60, cwd } = {}) {
  const timeout = Math.min(Math.max(Number(timeoutSec) || 60, 1), 600) * 1000;
  const started = Date.now();
  const r = await hub('POST', '/command', { command, timeout, ...(cwd ? { workingDirectory: cwd } : {}) }, { timeoutMs: timeout + 15_000 });
  const result = {
    command,
    exitCode: Number.isFinite(r.exitCode) ? r.exitCode : -1,
    stdout: String(r.stdout || '').slice(-200_000),
    stderr: String(r.stderr || '').slice(-50_000),
    durationMs: Number(r.executionTimeMs) || Date.now() - started,
  };
  const log = await prisma.commandLog.create({ data: { ...result, userId, source } });
  return { ...result, id: log.id, createdAt: log.createdAt };
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,199}$/;
export function assertName(name, what = 'nome') {
  if (!SAFE_NAME.test(String(name || ''))) throw new HttpError(400, `${what} inválido`);
  return String(name);
}

export async function serviceAction(service, action, opts) {
  assertName(service, 'Serviço');
  if (!['start', 'stop', 'restart', 'status'].includes(action)) throw new HttpError(400, 'Ação inválida');
  return runCommand(`systemctl ${action} ${service} --no-pager 2>&1; echo "exit=$?"`, { ...opts, source: 'service' });
}

export async function containerAction(name, action, opts) {
  assertName(name, 'Container');
  if (!['start', 'stop', 'restart'].includes(action)) throw new HttpError(400, 'Ação inválida');
  return runCommand(`docker ${action} ${name}`, { ...opts, source: 'container', timeoutSec: 120 });
}

/** Resumo do servidor: métricas, máquina, temperatura, backup e containers. */
export async function serverSnapshot() {
  const settle = (p) => p.then((v) => v, (e) => ({ error: e.message }));
  const [stats, overview, temperature, backup, ops] = await Promise.all([
    settle(hub('GET', '/wsl/stats')),
    settle(hub('GET', '/system/overview', undefined, { timeoutMs: 45_000 })),
    settle(hub('GET', '/system/temperature')),
    settle(hub('GET', '/system/backup-status')),
    settle(hub('GET', '/ops/status')),
  ]);
  if (stats.error && overview.error) throw new HttpError(502, stats.error);
  return { stats, overview, temperature, backup, containers: ops.containers || [], containersError: ops.error, at: new Date().toISOString() };
}
