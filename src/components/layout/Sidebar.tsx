import React from 'react';
import {
  LayoutDashboard,
  Map as MapIcon,
  Truck,
  Users,
  Receipt,
  UserPlus,
  LogOut,
  Wallet,
  LineChart,
} from 'lucide-react';
import type { ActiveTab, User, UserRole } from '../../types';
import { ROUTE_NAMES } from '../../constants';
import ThemeToggle from '../ui/ThemeToggle';

export interface SidebarProps {
  user: User;
  currentView: ActiveTab;
  onNavigate: (view: ActiveTab) => void;
  offline: boolean;
  pendingTripsCount: number;
  onRequestClose?: () => void;
  onLogout: () => void;
}

interface NavDef {
  view: ActiveTab;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
  showPendingBadge?: boolean;
}

const OPERATIVE_NAV: NavDef[] = [
  { view: 'dashboard', label: ROUTE_NAMES.dashboard, icon: <LayoutDashboard size={20} aria-hidden /> },
  {
    view: 'trips',
    label: ROUTE_NAMES.trips,
    icon: <Truck size={20} aria-hidden />,
    showPendingBadge: true,
  },
  { view: 'map', label: ROUTE_NAMES.map, icon: <MapIcon size={20} aria-hidden /> },
];

const FINANCIAL_NAV: NavDef[] = [
  { view: 'costs', label: ROUTE_NAMES.costs, icon: <Wallet size={20} aria-hidden />, roles: ['admin'] },
  {
    view: 'financial',
    label: ROUTE_NAMES.financial,
    icon: <LineChart size={20} aria-hidden />,
    roles: ['admin'],
  },
  { view: 'billing', label: ROUTE_NAMES.billing, icon: <Receipt size={20} aria-hidden />, roles: ['admin'] },
];

const ADMIN_NAV: NavDef[] = [
  { view: 'clients', label: ROUTE_NAMES.clients, icon: <Users size={20} aria-hidden />, roles: ['admin'] },
  { view: 'newClient', label: ROUTE_NAMES.newClient, icon: <UserPlus size={20} aria-hidden />, roles: ['admin'] },
];

function filterByRole(items: NavDef[], role: UserRole): NavDef[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  onNavigate,
  offline,
  pendingTripsCount,
  onRequestClose,
  onLogout,
}) => {
  const go = (view: ActiveTab) => {
    onNavigate(view);
    onRequestClose?.();
  };

  const financial = filterByRole(FINANCIAL_NAV, user.role);
  const adminOnly = filterByRole(ADMIN_NAV, user.role);

  const navBtnClass =
    'flex h-auto w-full items-center justify-start gap-4 rounded-lg border px-4 py-2 text-left text-sm font-medium transition-colors duration-150';

  return (
    <aside className="flex h-full min-h-0 flex-col" style={{ backgroundColor: 'var(--bg-surface)' }}>
      <div className="border-b border-[var(--border)] px-4 py-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          GDC Logistics
        </div>
        <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Plataforma</div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
        <div>
          <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Operativo
          </div>
          <div className="space-y-2">
            {OPERATIVE_NAV.map((item) => {
              const active = currentView === item.view;
              const badgeCount = item.showPendingBadge ? pendingTripsCount : 0;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => go(item.view)}
                  style={{
                    backgroundColor: active ? 'var(--accent-blue)' : 'transparent',
                    color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    borderColor: active ? 'var(--accent-blue)' : 'transparent',
                  }}
                  className={`${navBtnClass} border hover:bg-[var(--bg-elevated)]`}
                >
                  <span className={active ? 'text-[var(--text-inverse)]' : 'text-[var(--text-muted)]'}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {badgeCount > 0 ? (
                    <span
                      className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--accent-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_15%,transparent)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--accent-amber)]"
                      title="Viajes pendientes"
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {user.role === 'admin' && financial.length > 0 ? (
          <div>
            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Financiero
            </div>
            <div className="space-y-2">
              {financial.map((item) => {
                const active = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => go(item.view)}
                    style={{
                      backgroundColor: active ? 'var(--accent-blue)' : 'transparent',
                      color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
                      borderColor: active ? 'var(--accent-blue)' : 'transparent',
                    }}
                    className={`${navBtnClass} border hover:bg-[var(--bg-elevated)]`}
                  >
                    <span className={active ? 'text-[var(--text-inverse)]' : 'text-[var(--text-muted)]'}>
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {user.role === 'admin' && adminOnly.length > 0 ? (
          <div>
            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Administración
            </div>
            <div className="space-y-2">
              {adminOnly.map((item) => {
                const active = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => go(item.view)}
                    style={{
                      backgroundColor: active ? 'var(--accent-blue)' : 'transparent',
                      color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
                      borderColor: active ? 'var(--accent-blue)' : 'transparent',
                    }}
                    className={`${navBtnClass} border hover:bg-[var(--bg-elevated)]`}
                  >
                    <span className={active ? 'text-[var(--text-inverse)]' : 'text-[var(--text-muted)]'}>
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-[var(--border)] px-4 py-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{user.nombre}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent-blue)]">
                {user.role}
              </p>
            </div>
            <span
              className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                offline ? 'bg-[var(--accent-amber)]' : 'bg-[var(--accent-emerald)]'
              }`}
              title={offline ? 'Modo demo / sin hoja remota' : 'Sincronización esperada'}
              aria-label={offline ? 'Modo demo' : 'Conectado'}
            />
          </div>
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            {offline ? 'Modo demo — los cambios son locales' : 'Sincronización activa'}
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <ThemeToggle />
        </div>

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-red)]"
          onClick={onLogout}
        >
          <LogOut size={16} aria-hidden />
          Salir
        </button>
      </div>
    </aside>
  );
};
