import { CalendarDays, Image, LayoutList, LogOut, Plug, SquarePen } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cx } from './ui';

const NAV = [
  { to: '/calendar', label: 'Takvim', icon: CalendarDays },
  { to: '/posts', label: 'Gönderiler', icon: LayoutList },
  { to: '/media', label: 'Medya', icon: Image },
  { to: '/accounts', label: 'Hesaplar', icon: Plug },
];

export function Layout() {
  const { user, workspace, workspaces, selectWorkspace, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-white md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="flex size-7 items-center justify-center rounded-lg bg-ink">
            <span className="size-2.5 rounded-full bg-cyan-400" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">OneClick</span>
        </div>

        {workspaces.length > 1 ? (
          <div className="px-3 pb-3">
            <select
              className="h-9 w-full rounded-lg border border-line bg-white px-2 text-sm"
              value={workspace?.id}
              onChange={(e) => selectWorkspace(e.target.value)}
              aria-label="Çalışma alanı"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="truncate px-5 pb-3 text-xs text-muted">{workspace?.name}</p>
        )}

        <div className="px-3 pb-3">
          <button
            onClick={() => navigate('/compose')}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-white hover:bg-black"
          >
            <SquarePen className="size-4" /> Gönderi oluştur
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm',
                  isActive ? 'bg-gray-100 font-medium text-ink' : 'text-muted hover:bg-gray-50 hover:text-ink',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-line px-4 py-3 md:block">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
          <button onClick={logout} className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-ink">
            <LogOut className="size-3.5" /> Çıkış yap
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
