import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  FlaskConical,
  Image,
  KeyRound,
  LayoutList,
  LogOut,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Briefcase,
  SquarePen,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useBranding } from '../lib/branding';
import { readLocal, writeLocal } from '../lib/storage';
import { Avatar } from './identity';
import { cx, IconButton, MenuItem, Popover } from './ui';

const NAV: { group: string; items: { to: string; label: string; icon: LucideIcon; ownerOnly?: boolean }[] }[] = [
  {
    group: 'Yayın',
    items: [
      { to: '/calendar', label: 'Takvim', icon: CalendarDays },
      { to: '/posts', label: 'Gönderiler', icon: LayoutList },
      { to: '/media', label: 'Medya', icon: Image },
    ],
  },
  {
    group: 'Ayarlar',
    items: [
      { to: '/accounts', label: 'Hesaplar', icon: Plug },
      { to: '/clients', label: 'Müşteriler', icon: Briefcase },
      { to: '/settings/apps', label: 'Platform uygulamaları', icon: KeyRound },
      { to: '/settings/branding', label: 'Marka', icon: Palette, ownerOnly: true },
    ],
  },
];

/** Kurulumun logosu: yüklenmişse o görsel, yoksa ana renkte varsayılan işaret */
export function Logo({ size = 28 }: { size?: number }) {
  const { logoUrl } = useBranding();
  if (logoUrl) return <img src={logoUrl} alt="" className="shrink-0 rounded-control object-contain" style={{ width: size, height: size }} aria-hidden />;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-control bg-brand-600" style={{ width: size, height: size }} aria-hidden>
      <span className="rounded-full bg-surface" style={{ width: size * 0.36, height: size * 0.36 }} />
    </span>
  );
}

const COLLAPSE_KEY = 'oneclick.sidebar.collapsed';

export function Layout() {
  const [collapsed, setCollapsed] = useState(() => readLocal(COLLAPSE_KEY, false));
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { appName } = useBranding();

  useEffect(() => setDrawer(false), [location.pathname]);
  const toggle = () => {
    setCollapsed((c) => {
      writeLocal(COLLAPSE_KEY, !c);
      return !c;
    });
  };

  return (
    <div className="flex min-h-full">
      {/* Masaüstü kenar çubuğu: ekran kenarına yapışmayan, yüzen kart */}
      <div className="sticky top-0 z-20 hidden h-dvh shrink-0 p-3 pr-0 md:block">
        <aside
          className={cx(
            'flex h-full flex-col rounded-card border border-line bg-surface shadow-sm transition-[width] duration-150',
            collapsed ? 'w-16' : 'w-60',
          )}
        >
          <SidebarBody collapsed={collapsed} onToggle={toggle} />
        </aside>
      </div>

      {/* Mobil üst çubuk ve çekmece */}
      <div className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 md:hidden">
        <IconButton icon={Menu} label="Menüyü aç" onClick={() => setDrawer(true)} />
        <Logo size={24} />
        <span className="flex-1 truncate text-heading font-semibold tracking-tight">{appName}</span>
        <IconButton icon={Plus} label="Gönderi oluştur" primary onClick={() => navigate('/compose')} />
      </div>
      {drawer && (
        <div className="fixed inset-0 z-50 animate-fade-in bg-ink/40 md:hidden" onClick={() => setDrawer(false)}>
          <aside className="flex h-full w-72 flex-col bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end px-2 pt-2">
              <IconButton icon={X} label="Menüyü kapat" onClick={() => setDrawer(false)} />
            </div>
            <SidebarBody collapsed={false} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pt-20 pb-10 md:px-8 md:pt-7">
        <DemoBanner />
        <Outlet />
      </main>
    </div>
  );
}

/** Demo çalışma alanında kalıcı bilgi şeridi */
function DemoBanner() {
  const { workspace } = useAuth();
  if (!workspace?.demoExpiresAt) return null;
  const hours = Math.max(0, Math.ceil((new Date(workspace.demoExpiresAt).getTime() - Date.now()) / 3600_000));
  return (
    <div className="mx-auto mb-5 flex max-w-300 flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-small text-brand-700">
      <FlaskConical className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="font-semibold">Demo hesabındasınız.</span>
      <span className="text-ink-2">
        Hesaplar ve gönderiler örnektir; yayınlar gerçek platformlara gitmez. Bu çalışma alanı {hours > 1 ? `yaklaşık ${hours} saat` : '1 saatten kısa süre'} sonra silinir.
      </span>
    </div>
  );
}

function SidebarBody({ collapsed, onToggle }: { collapsed: boolean; onToggle?(): void }) {
  const { user, workspace, workspaces, selectWorkspace, logout } = useAuth();
  const navigate = useNavigate();
  const { appName } = useBranding();

  return (
    <>
      {/* Çalışma alanı seçici */}
      <div className={cx('px-3 pt-3 pb-2', collapsed && 'px-2')}>
        <Popover
          wrapperClassName="flex"
          className="w-60"
          trigger={({ toggle }) => (
            <button
              onClick={workspaces.length > 1 ? toggle : undefined}
              className={cx(
                'flex h-11 w-full items-center gap-2.5 rounded-control px-2 text-left',
                workspaces.length > 1 && 'hover:bg-subtle',
                collapsed && 'justify-center px-0',
              )}
              title={workspace?.name}
            >
              <Logo />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-semibold">{appName}</span>
                    <span className="block truncate text-caption text-muted">{workspace?.name}</span>
                  </span>
                  {workspaces.length > 1 && <ChevronsUpDown className="size-4 text-faint" />}
                </>
              )}
            </button>
          )}
        >
          {(close) => (
            <div role="menu">
              <p className="px-2.5 pt-1 pb-1.5 text-micro font-medium text-faint">Çalışma alanları</p>
              {workspaces.map((w) => (
                <MenuItem
                  key={w.id}
                  onClick={() => {
                    selectWorkspace(w.id);
                    close();
                  }}
                >
                  <Avatar name={w.name} size={20} square />
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === workspace?.id && <Check className="size-4 text-brand-600" />}
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>
      </div>

      <div className={cx('px-3 pb-4', collapsed && 'px-2')}>
        <button
          onClick={() => navigate('/compose')}
          className={cx(
            'flex h-9 w-full items-center justify-center gap-2 rounded-control bg-brand-600 text-body font-medium text-white transition-colors hover:bg-brand-700',
          )}
          title="Gönderi oluştur"
        >
          <SquarePen className="size-4" strokeWidth={1.75} />
          {!collapsed && 'Gönderi oluştur'}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {NAV.map((g) => (
          <div key={g.group} className={cx('mb-4 px-3', collapsed && 'px-2')}>
            {!collapsed && <p className="mb-1 px-2.5 text-micro font-medium text-faint">{g.group}</p>}
            {g.items.filter((i) => !i.ownerOnly || workspace?.role === 'OWNER').map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cx(
                    'mb-0.5 flex h-9 items-center gap-2.5 rounded-control px-2.5 text-body transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-muted hover:bg-subtle hover:text-ink',
                  )
                }
              >
                <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
                {!collapsed && label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={cx('flex items-center gap-1 border-t border-line p-2', collapsed && 'flex-col')}>
        <Popover
          wrapperClassName="flex min-w-0 flex-1"
          side="top"
          className="w-56"
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className={cx('flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control px-2 text-left hover:bg-subtle', collapsed && 'justify-center px-0')}
              title={user?.name}
            >
              <Avatar name={user?.name ?? '?'} size={28} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium">{user?.name}</span>
                  <span className="block truncate text-caption text-muted">{user?.email}</span>
                </span>
              )}
            </button>
          )}
        >
          <MenuItem icon={LogOut} onClick={logout}>
            Çıkış yap
          </MenuItem>
        </Popover>
        {onToggle && (
          <IconButton
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            label={collapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
            size="sm"
            onClick={onToggle}
          />
        )}
      </div>
    </>
  );
}
