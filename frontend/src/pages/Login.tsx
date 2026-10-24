import { useState, type FormEvent } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { useAuth } from '../auth';
import { ErrorBox } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-[max(1rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)]">
            <Activity className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Monitor</h1>
          <p className="mt-1 text-sm text-[#64748b]">Acompanhe e controle o servidor do Hub</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              E-mail
            </label>
            <input id="email" className="input" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Senha
            </label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <ErrorBox message={error} />
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Entrar
          </button>
        </div>
      </form>
    </div>
  );
}
