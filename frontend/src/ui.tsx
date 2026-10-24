import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, PlugZap, X, XCircle } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex justify-center py-10 text-brand ${className}`}>
      <Loader2 className="h-7 w-7 animate-spin" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold underline">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/** Erro 409 da API = Monitor sem conexão com o Hub: mostra o atalho para conectar. */
export function HubError({ message, status, onRetry }: { message: string; status: number; onRetry?: () => void }) {
  if (!message) return null;
  if (status !== 409) return <ErrorBox message={message} onRetry={onRetry} />;
  return (
    <div className="card flex flex-col items-center px-5 py-8 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand">
        <PlugZap className="h-7 w-7" />
      </div>
      <p className="font-semibold">Conecte o Monitor ao Hub</p>
      <p className="mt-1 max-w-sm text-sm text-[#64748b]">{message}</p>
      <Link to="/configuracoes" className="btn-primary mt-4">
        Conectar agora
      </Link>
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand">{icon}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-[#64748b]">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-4 flex min-h-[44px] items-center gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[clamp(1.35rem,5vw,1.75rem)] font-bold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-[#64748b]">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export type Level = 'ok' | 'warn' | 'error' | 'off';
const LEVEL: Record<Level, { cls: string; Icon: typeof CheckCircle2; label: string }> = {
  ok: { cls: 'bg-[#ecfdf3] text-[#047857]', Icon: CheckCircle2, label: 'OK' },
  warn: { cls: 'bg-[#fffbeb] text-[#b45309]', Icon: AlertTriangle, label: 'Atenção' },
  error: { cls: 'bg-[#fef2f2] text-[#b91c1c]', Icon: XCircle, label: 'Problema' },
  off: { cls: 'bg-[#f1f5f9] text-[#475569]', Icon: XCircle, label: 'Parado' },
};

/** Selo de estado: sempre ícone + texto, nunca só cor. */
export function StatusBadge({ level, label }: { level: Level; label?: string }) {
  const l = LEVEL[level];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${l.cls}`}>
      <l.Icon className="h-3.5 w-3.5" />
      {label ?? l.label}
    </span>
  );
}

export const levelFor = (pct: number, warn = 75, err = 90): Level => (pct >= err ? 'error' : pct >= warn ? 'warn' : 'ok');

/** Painel que vira bottom sheet no celular e modal centralizado no desktop. */
export function Sheet({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0f172a]/40 md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] md:rounded-2xl ${wide ? 'md:max-w-4xl' : 'md:max-w-lg'}`}
      >
        <div className="flex items-center gap-2 border-b border-[#eef2f7] px-4 py-2">
          <h2 className="min-w-0 flex-1 truncate font-bold">{title}</h2>
          <button className="icon-btn -mr-2" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** Confirmação antes de ações que mudam o servidor. */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; text: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = (title: string, text: string, danger = false) => new Promise<boolean>((resolve) => setState({ title, text, danger, resolve }));
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const node = (
    <Sheet open={!!state} title={state?.title || ''} onClose={() => close(false)}>
      <p className="break-words text-[#334155]">{state?.text}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="btn-outline" onClick={() => close(false)}>
          Cancelar
        </button>
        <button className={state?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
          Confirmar
        </button>
      </div>
    </Sheet>
  );
  return { ask, node };
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const ref = useRef(onDone);
  ref.current = onDone;
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => ref.current(), 3500);
    return () => clearTimeout(id);
  }, [message]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6">
      <div className="max-w-full break-words rounded-xl bg-[#0f172a] px-4 py-3 text-sm font-medium text-white shadow-lg">{message}</div>
    </div>
  );
}

export function fmtBytes(n?: number) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

export function fmtUptime(sec?: number) {
  if (!sec && sec !== 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m} min`;
}

export function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fmtAgo(s?: string | null) {
  if (!s) return '—';
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return fmtDate(s);
}
