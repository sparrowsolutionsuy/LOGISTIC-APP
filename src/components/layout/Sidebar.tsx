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

export interface SidebarProps {
  user: User;
  currentView: ActiveTab;
  onNavigate: (view: ActiveTab) => void;
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
  { view: 'dashboard', label: ROUTE_NAMES.dashboard, icon: <LayoutDashboard size={20} strokeWidth={2} aria-hidden /> },
  {
    view: 'trips',
    label: ROUTE_NAMES.trips,
    icon: <Truck size={20} strokeWidth={2} aria-hidden />,
    showPendingBadge: true,
  },
  { view: 'map', label: ROUTE_NAMES.map, icon: <MapIcon size={20} strokeWidth={2} aria-hidden /> },
];

const FINANCIAL_NAV: NavDef[] = [
  { view: 'costs', label: ROUTE_NAMES.costs, icon: <Wallet size={20} strokeWidth={2} aria-hidden />, roles: ['admin'] },
  {
    view: 'financial',
    label: ROUTE_NAMES.financial,
    icon: <LineChart size={20} strokeWidth={2} aria-hidden />,
    roles: ['admin'],
  },
  { view: 'billing', label: ROUTE_NAMES.billing, icon: <Receipt size={20} strokeWidth={2} aria-hidden />, roles: ['admin'] },
];

const ADMIN_NAV: NavDef[] = [
  { view: 'clients', label: ROUTE_NAMES.clients, icon: <Users size={20} strokeWidth={2} aria-hidden />, roles: ['admin'] },
  { view: 'newClient', label: ROUTE_NAMES.newClient, icon: <UserPlus size={20} strokeWidth={2} aria-hidden />, roles: ['admin'] },
];

function filterByRole(items: NavDef[], role: UserRole): NavDef[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

function navButtonClass(active: boolean): string {
  const base =
    'flex min-h-11 w-full items-center justify-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm font-medium transition-[background-color,border-color,color,box-shadow] [transition-duration:var(--duration-normal)] [transition-timing-function:var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] touch-manipulation';
  if (active) {
    return `${base} border-[var(--border)] bg-[var(--accent-blue-muted)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]`;
  }
  return `${base} border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] active:scale-[0.99]`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  onNavigate,
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

  return (
    <aside className="flex h-full min-h-0 flex-col" style={{ backgroundColor: 'var(--bg-surface)' }}>
      <div className="border-b border-[var(--border)] px-5 py-6">
        <div className="pl-3" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            GDC Logistics
          </div>
          <div className="mt-1 text-sm font-semibold leading-snug text-[var(--text-primary)]">Plataforma</div>
        </div>
      </div>

      <nav className="flex-1 space-y-8 overflow-y-auto px-4 py-6" aria-label="Navegación principal">
        <div>
          <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Operativo
          </div>
          <div className="flex flex-col gap-2">
            {OPERATIVE_NAV.map((item) => {
              const active = currentView === item.view;
              const badgeCount = item.showPendingBadge ? pendingTripsCount : 0;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => go(item.view)}
                  className={`relative ${navButtonClass(active)}`}
                  style={
                    active
                      ? { boxShadow: 'inset 3px 0 0 0 var(--accent-blue), var(--shadow-xs)' }
                      : undefined
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={active ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {badgeCount > 0 ? (
                    <span
                      className="shrink-0 rounded-[var(--radius-full)] border border-[color-mix(in_srgb,var(--accent-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--accent-amber)]"
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
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Financiero
            </div>
            <div className="flex flex-col gap-2">
              {financial.map((item) => {
                const active = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => go(item.view)}
                    className={`relative ${navButtonClass(active)}`}
                    style={
                      active
                        ? { boxShadow: 'inset 3px 0 0 0 var(--accent-blue), var(--shadow-xs)' }
                        : undefined
                    }
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={active ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'}>
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
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Administración
            </div>
            <div className="flex flex-col gap-2">
              {adminOnly.map((item) => {
                const active = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => go(item.view)}
                    className={`relative ${navButtonClass(active)}`}
                    style={
                      active
                        ? { boxShadow: 'inset 3px 0 0 0 var(--accent-blue), var(--shadow-xs)' }
                        : undefined
                    }
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={active ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'}>
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

      <div className="mt-auto border-t border-[var(--border)] px-4 py-6">
        <div className="flex flex-col items-center px-1 pb-0.5">
          <img
            src="/LOGISTIC-APP/LOGO.jpeg"
            alt="Gorrión del Cielo SAS"
            className="w-full max-w-[300px] object-contain transition-opacity hover:opacity-100"
            style={{
              maxHeight: '190px',
              opacity: 0.99,
              mixBlendMode: 'normal',
              borderRadius: '12px',
              padding: '8px',
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
            draggable={false}
          />
        </div>

        <button
          type="button"
          className="mt-3 flex min-h-11 w-full items-center justify-start gap-2 rounded-[var(--radius-md)] border border-transparent px-3 py-2.5 text-sm text-[var(--text-secondary)] transition-colors [transition-duration:var(--duration-normal)] hover:border-[color-mix(in_srgb,var(--accent-red)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-red)_8%,transparent)] hover:text-[var(--accent-red)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] touch-manipulation"
          onClick={onLogout}
        >
          <LogOut size={18} strokeWidth={2} aria-hidden />
          Salir
        </button>
      </div>
    </aside>
  );
};
