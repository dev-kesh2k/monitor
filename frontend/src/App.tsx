import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Bot, Boxes, Cog, LayoutDashboard, LogOut, Menu, ScrollText, Server, SquareTerminal } from 'lucide-react';
import { useAuth } from './auth';
import { Spinner } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Containers from './pages/Containers';
import Services from './pages/Services';
import Logs from './pages/Logs';
import Terminal from './pages/Terminal';
import Agent from './pages/Agent';
import Settings from './pages/Settings';
import More from './pages/More';

const NAV = [
  { to: '/', label: 'Painel', Icon: LayoutDashboard, mobile: true },
  { to: '/containers', label: 'Containers', Icon: Boxes, mobile: true },
  { to: '/agente', label: 'Agente', Icon: Bot, mobile: true },
  { to: '/terminal', label: 'Terminal', Icon: SquareTerminal, mobile: true },
  { to: '/servicos', label: 'Serviços', Icon: Server },
  { to: '/logs', label: 'Logs', Icon: ScrollText },
  { to: '/configuracoes', label: 'Configurações', Icon: Cog },
];

function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-[#e8ecf4] bg-white px-3 py-5 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
          <Activity className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold">Monitor</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition ${
                isActive ? 'bg-brand-light text-brand' : 'text-[#475569] hover:bg-[#f4f6fb]'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 border-t border-[#eef2f7] pt-4">
        <p className="truncate px-3 text-sm font-semibold">{user?.name}</p>
        <p className="truncate px-3 text-xs text-[#64748b]">{user?.email}</p>
        <button onClick={logout} className="mt-2 flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-[#475569] hover:bg-[#f4f6fb]">
          <LogOut className="h-5 w-5" /> Sair
        </button>
      </div>
    </aside>
  );
}

function BottomNav() {
  const loc = useLocation();
  const moreActive = ['/servicos', '/logs', '/configuracoes', '/mais'].some((p) => loc.pathname.startsWith(p));
  const items = [...NAV.filter((n) => n.mobile), { to: '/mais', label: 'Mais', Icon: Menu }];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8ecf4] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                isActive || (to === '/mais' && moreActive) ? 'text-brand' : 'text-[#64748b]'
              }`
            }
          >
            <Icon className="h-6 w-6" />
            <span className="max-w-full truncate px-1">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner className="min-h-[100dvh] items-center" />;
  if (!user) return <Login />;
  const isAgent = loc.pathname.startsWith('/agente');
  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar />
      <main
        className={`min-w-0 flex-1 px-[max(1rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pt-8 ${
          isAgent ? 'pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0' : 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10'
        }`}
      >
        <div className="mx-auto w-full max-w-6xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/containers" element={<Containers />} />
            <Route path="/servicos" element={<Services />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/terminal" element={<Terminal />} />
            <Route path="/agente" element={<Agent />} />
            <Route path="/agente/:id" element={<Agent />} />
            <Route path="/configuracoes" element={<Settings />} />
            <Route path="/mais" element={<More />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
