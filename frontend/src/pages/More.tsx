import { Link } from 'react-router-dom';
import { ChevronRight, Cog, LogOut, ScrollText, Server } from 'lucide-react';
import { useAuth } from '../auth';
import { PageHeader } from '../ui';

const LINKS = [
  { to: '/servicos', label: 'Serviços', text: 'Unidades systemd: iniciar, parar e reiniciar', Icon: Server },
  { to: '/logs', label: 'Logs do sistema', text: 'Últimas linhas do journal', Icon: ScrollText },
  { to: '/configuracoes', label: 'Configurações', text: 'Conexão com o Hub, agente e senha', Icon: Cog },
];

export default function More() {
  const { user, logout } = useAuth();
  return (
    <div>
      <PageHeader title="Mais" subtitle={user?.email} />
      <div className="card divide-y divide-[#eef2f7]">
        {LINKS.map(({ to, label, text, Icon }) => (
          <Link key={to} to={to} className="flex min-h-[64px] items-center gap-3 px-4 py-3 active:bg-[#f8fafc]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{label}</p>
              <p className="truncate text-sm text-[#64748b]">{text}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#94a3b8]" />
          </Link>
        ))}
      </div>
      <button onClick={logout} className="btn-outline mt-4 w-full text-[#b91c1c]">
        <LogOut className="h-5 w-5" /> Sair
      </button>
    </div>
  );
}
