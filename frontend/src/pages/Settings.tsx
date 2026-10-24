import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Bot, KeyRound, Loader2, PlugZap, Unplug, UserRound } from 'lucide-react';
import { ApiError, api, useApi, type AgentSettings, type HubConn, type User } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, PageHeader, Spinner, StatusBadge, Toast, fmtDate, useConfirm } from '../ui';

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <span className="text-brand">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function HubSection({ toast }: { toast: (m: string) => void }) {
  const conn = useApi<HubConn>('/hub');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      conn.setData(await api.post<HubConn>('/hub/connect', { username, password, otp }));
      setPassword('');
      setOtp('');
      setNeedOtp(false);
      toast('Conectado ao Hub');
    } catch (err) {
      if ((err as ApiError).data?.otpRequired) setNeedOtp(true);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!(await confirm.ask('Desconectar do Hub?', 'O Monitor para de coletar métricas e o agente perde o acesso ao servidor até você conectar de novo.', true))) return;
    conn.setData(await api.post<HubConn>('/hub/disconnect'));
  };

  if (!conn.data) return conn.loading ? <Spinner /> : <ErrorBox message={conn.error} onRetry={conn.reload} />;
  const c = conn.data;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge level={c.connected ? 'ok' : 'error'} label={c.connected ? 'Conectado' : 'Desconectado'} />
        <span className="min-w-0 break-all text-[#64748b]">{c.url}</span>
      </div>
      {c.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-[#475569]">
            Usuário <strong>{c.username}</strong> · conectado em {fmtDate(c.connectedAt)} · a sessão do Hub vale até <strong>{fmtDate(c.expiresAt)}</strong>. Depois disso,
            conecte de novo.
          </p>
          <button className="btn-outline w-full sm:w-auto" onClick={disconnect}>
            <Unplug className="h-5 w-5" /> Desconectar
          </button>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-3">
          {c.lastError && <p className="text-sm text-[#b45309]">{c.lastError}</p>}
          <p className="text-sm text-[#475569]">Entre com um usuário administrador do Central Apps Hub. A senha não é guardada: o Monitor guarda só a sessão, cifrada.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="hub-user">
                Usuário do Hub
              </label>
              <input id="hub-user" className="input" autoComplete="off" autoCapitalize="off" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="hub-pass">
                Senha do Hub
              </label>
              <input id="hub-pass" className="input" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          <div className={needOtp ? '' : 'md:w-1/2'}>
            <label className="label" htmlFor="hub-otp">
              Código 2FA {needOtp ? '' : '(se o usuário tiver)'}
            </label>
            <input
              id="hub-otp"
              className="input tracking-widest"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required={needOtp}
            />
          </div>
          <ErrorBox message={error} />
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlugZap className="h-5 w-5" />} Conectar
          </button>
        </form>
      )}
      {confirm.node}
    </>
  );
}

function AgentSection({ toast }: { toast: (m: string) => void }) {
  const s = useApi<AgentSettings>('/settings/agent');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();

  useEffect(() => {
    if (!s.data) return;
    setModel(s.data.model);
    setEffort(s.data.effort);
    setAutoApprove(s.data.autoApprove);
  }, [s.data]);

  const save = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError('');
    try {
      s.setData(await api.put<AgentSettings>('/settings/agent', body));
      setApiKey('');
      toast(msg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAuto = async (v: boolean) => {
    if (v && !(await confirm.ask('Aprovar tudo automaticamente?', 'O agente vai executar comandos como root e parar/reiniciar serviços e containers sem pedir sua confirmação.', true))) return;
    setAutoApprove(v);
  };

  if (!s.data) return s.loading ? <Spinner /> : <ErrorBox message={s.error} onRetry={s.reload} />;
  const d = s.data;
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="key">
          Chave da API da Anthropic
        </label>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
          <StatusBadge level={d.hasKey ? 'ok' : 'warn'} label={d.hasKey ? `Configurada ${d.keyHint}` : 'Não configurada'} />
          {d.keySource === 'env' && <span>(vinda do servidor)</span>}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="key" className="input font-mono" type="password" placeholder="sk-ant-..." autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={busy || !apiKey.trim()} onClick={() => save({ apiKey }, 'Chave salva')}>
            Salvar chave
          </button>
          {d.keySource === 'app' && (
            <button className="btn-outline shrink-0" disabled={busy} onClick={() => save({ apiKey: '' }, 'Chave removida')}>
              Remover
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-[#64748b]">Crie em console.anthropic.com → API Keys. Fica cifrada no banco do Monitor.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="model">
            Modelo
          </label>
          <select id="model" className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {d.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="effort">
            Esforço
          </label>
          <select id="effort" className="input" value={effort} onChange={(e) => setEffort(e.target.value)}>
            <option value="low">Baixo (mais rápido e barato)</option>
            <option value="medium">Médio</option>
            <option value="high">Alto (mais cuidadoso)</option>
          </select>
        </div>
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#4f46e5]" checked={autoApprove} onChange={(e) => toggleAuto(e.target.checked)} />
        <span className="min-w-0">
          <span className="font-semibold">Aprovar ações automaticamente</span>
          <span className="block text-sm text-[#64748b]">Desligado (recomendado): comandos e ações em serviços/containers esperam seu OK no chat.</span>
        </span>
      </label>
      <ErrorBox message={error} />
      <button className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => save({ model, effort, autoApprove }, 'Configurações do agente salvas')}>
        Salvar agente
      </button>
      {confirm.node}
    </div>
  );
}

function AccountSection({ toast }: { toast: (m: string) => void }) {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.put<{ user: User }>('/me', { name, email });
      setUser(r.user);
      toast('Perfil salvo');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.put('/me/password', { current, next });
      setCurrent('');
      setNext('');
      toast('Senha alterada. Atualize a entrada no Cofre do Hub.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={saveProfile} className="space-y-3">
        <div>
          <label className="label" htmlFor="name">
            Nome
          </label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="mail">
            E-mail
          </label>
          <input id="mail" className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button className="btn-outline w-full sm:w-auto">Salvar perfil</button>
      </form>
      <form onSubmit={savePassword} className="space-y-3">
        <div>
          <label className="label" htmlFor="cur">
            Senha atual
          </label>
          <input id="cur" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="new">
            Nova senha (mín. 10 caracteres)
          </label>
          <input id="new" className="input" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <button className="btn-outline w-full sm:w-auto" disabled={busy}>
          <KeyRound className="h-5 w-5" /> Trocar senha
        </button>
      </form>
      <div className="md:col-span-2">
        <ErrorBox message={error} />
      </div>
    </div>
  );
}

export default function Settings() {
  const [toast, setToast] = useState('');
  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="space-y-4">
        <Section icon={<PlugZap className="h-5 w-5" />} title="Conexão com o Hub">
          <HubSection toast={setToast} />
        </Section>
        <Section icon={<Bot className="h-5 w-5" />} title="Agente">
          <AgentSection toast={setToast} />
        </Section>
        <Section icon={<UserRound className="h-5 w-5" />} title="Minha conta">
          <AccountSection toast={setToast} />
        </Section>
      </div>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
