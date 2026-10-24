import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = `${import.meta.env.BASE_URL}api`;
const TOKEN_KEY = 'monitor:token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.error || `Erro ${res.status}`, data);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

/** Carrega um recurso; `intervalMs` atualiza sozinho enquanto a aba estiver visível. */
export function useApi<T>(path: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(0);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await api.get<T>(path);
      if (pathRef.current === path) {
        setData(d);
        setError('');
        setStatus(200);
      }
    } catch (e) {
      setError((e as Error).message);
      setStatus((e as ApiError).status || 0);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
    if (!intervalMs) return;
    const id = setInterval(() => document.visibilityState === 'visible' && reload(), intervalMs);
    return () => clearInterval(id);
  }, [reload, intervalMs]);

  return { data, error, status, loading, reload, setData };
}

// ---------- Tipos ----------
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface HubConn {
  connected: boolean;
  username: string;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string;
  url: string;
}

export interface DockerUsage {
  name: string;
  cpuPercent: number;
  memPercent: number;
  memUsedMB: number;
  memLimitMB: number;
}

export interface Stats {
  cpuUsage: number;
  memoryUsedGB: number;
  memoryTotalGB: number;
  memoryPercent: number;
  diskUsedGB: number;
  diskTotalGB: number;
  diskPercent: number;
  runningProcesses: number;
  networkRxMB: number;
  networkTxMB: number;
  dockerContainers?: DockerUsage[];
  error?: string;
}

export interface Overview {
  host?: { hostname: string; os: string; kernel: string; uptimeSec: number; load: number[]; cpuModel: string; cores: number };
  disks?: { device: string; model: string; healthy: boolean; celsius: number; powerOnHours: number; lifeLeft: number; writtenGB: number }[];
  security?: {
    firewall: boolean;
    fail2ban: boolean;
    bannedNow: number;
    bannedTotal: number;
    sshPassword: boolean;
    updates: number;
    securityUpdates: number;
    rebootRequired: boolean;
  };
  services?: { unit: string; label: string; active: boolean }[];
  alerts?: { level: string; text: string }[];
  error?: string;
}

export interface Temperature {
  available?: boolean;
  groups?: { kind: string; name: string; maxCelsius: number }[];
  error?: string;
}

export interface Backup {
  configured?: boolean;
  lastRunAt?: string;
  lastRunOk?: boolean;
  lastSuccessAt?: string;
  error?: string;
  diskTotalBytes?: number;
  diskFreeBytes?: number;
  backupBytes?: number;
  versions?: number;
}

export interface Container {
  name: string;
  image: string;
  state: string;
  status: string;
  usage?: DockerUsage | null;
}

export interface Snapshot {
  stats: Stats;
  overview: Overview;
  temperature: Temperature;
  backup: Backup;
  containers: Container[];
  at: string;
}

export interface Service {
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface CommandResult {
  id: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  createdAt: string;
  source?: string;
  user?: { name: string } | null;
}

export interface HistoryPoint {
  at: string;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  temp: number | null;
  load: number | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  status: 'idle' | 'running' | 'awaiting_approval' | 'error';
  updatedAt: string;
  error?: string;
}

export interface AgentItem {
  id: string;
  kind: 'user' | 'assistant' | 'tool';
  text?: string;
  tool?: string;
  input?: Record<string, unknown>;
  needsApproval?: boolean;
  pending?: boolean;
  result?: string;
  isError?: boolean;
  done?: boolean;
  at: string;
}

export interface ConversationView {
  conversation: ConversationSummary;
  items: AgentItem[];
}

export interface AgentSettings {
  model: string;
  effort: string;
  autoApprove: boolean;
  hasKey: boolean;
  keySource: 'app' | 'env' | 'none';
  keyHint: string;
  models: { id: string; label: string }[];
  efforts: string[];
}
