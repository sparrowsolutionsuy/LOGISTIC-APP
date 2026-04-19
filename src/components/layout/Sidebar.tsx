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
import { Button } from '../ui/Button';

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
  { view: 'dashboard', label: ROUTE_NAMES.dashboard, icon: <LayoutDashboard size={18} /> },
  {
    view: 'trips',
    label: ROUTE_NAMES.trips,
    icon: <Truck size={18} />,
    showPendingBadge: true,
  },
  { view: 'map', label: ROUTE_NAMES.map, icon: <MapIcon size={18} /> },
];

const FINANCIAL_NAV: NavDef[] = [
  { view: 'costs', label: ROUTE_NAMES.costs, icon: <Wallet size={18} />, roles: ['admin'] },
  {
    view: 'financial',
    label: ROUTE_NAMES.financial,
    icon: <LineChart size={18} />,
    roles: ['admin'],
  },
  { view: 'billing', label: ROUTE_NAMES.billing, icon: <Receipt size={18} />, roles: ['admin'] },
];

const ADMIN_NAV: NavDef[] = [
  { view: 'clients', label: ROUTE_NAMES.clients, icon: <Users size={18} />, roles: ['admin'] },
  { view: 'newClient', label: ROUTE_NAMES.newClient, icon: <UserPlus size={18} />, roles: ['admin'] },
];

function filterByRole(items: NavDef[], role: UserRole): NavDef[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

interface NavButtonProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badgeCount?: number;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({
  active,
  icon,
  label,
  badgeCount = 0,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 ease-out ${
      active
        ? 'border-[color-mix(in_srgb,var(--accent-blue)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent-blue)_18%,transparent)] text-[var(--text-primary)]'
        : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-white/5 hover:text-[var(--text-primary)]'
    }`}
  >
    <span
      className={`text-[var(--text-muted)] transition-colors duration-150 group-hover:text-[var(--accent-blue)] ${
        active ? 'text-[var(--accent-blue)]' : ''
      }`}
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
    {badgeCount > 0 ? (
      <span
        className="shrink-0 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-200"
        title="Viajes pendientes"
      >
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    ) : null}
  </button>
);

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-surface)]">
      <div className="border-b border-[var(--border)] px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          GDC Logistics
        </div>
        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Plataforma</div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div>
          <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Operativo
          </div>
          <div className="space-y-1">
            {OPERATIVE_NAV.map((item) => (
              <NavButton
                key={item.view}
                active={currentView === item.view}
                icon={item.icon}
                label={item.label}
                badgeCount={item.showPendingBadge ? pendingTripsCount : 0}
                onClick={() => go(item.view)}
              />
            ))}
          </div>
        </div>

        {user.role === 'admin' && financial.length > 0 ? (
          <div>
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Financiero
            </div>
            <div className="space-y-1">
              {financial.map((item) => (
                <NavButton
                  key={item.view}
                  active={currentView === item.view}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => go(item.view)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {user.role === 'admin' && adminOnly.length > 0 ? (
          <div>
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Administración
            </div>
            <div className="space-y-1">
              {adminOnly.map((item) => (
                <NavButton
                  key={item.view}
                  active={currentView === item.view}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => go(item.view)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{user.nombre}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-blue)]">
                {user.role}
              </p>
            </div>
            <span
              className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                offline ? 'bg-[var(--accent-red)]' : 'bg-[var(--accent-emerald)]'
              }`}
              title={offline ? 'Sin conexión a datos' : 'Conectado'}
              aria-label={offline ? 'Sin conexión' : 'Conectado'}
            />
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-muted)]">
            {offline ? 'Modo offline (datos locales)' : 'Sincronización activa'}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-[var(--text-secondary)] hover:text-[var(--accent-red)]"
          onClick={onLogout}
          icon={<LogOut size={16} />}
        >
          Salir
        </Button>
      </div>
    </div>
  );
};
