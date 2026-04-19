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
import type { ShellView, User, UserRole } from '../../types';
import { SHELL_VIEW_TITLES } from '../../constants';
import { Button } from '../ui/Button';

export interface SidebarProps {
  user: User;
  currentView: ShellView;
  onNavigate: (view: ShellView) => void;
  offline: boolean;
  onRequestClose?: () => void;
  onLogout: () => void;
}

interface NavDef {
  view: ShellView;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
}

const OPERATIVE_NAV: NavDef[] = [
  { view: 'dashboard', label: SHELL_VIEW_TITLES.dashboard, icon: <LayoutDashboard size={18} /> },
  { view: 'trips', label: SHELL_VIEW_TITLES.trips, icon: <Truck size={18} /> },
  { view: 'map', label: SHELL_VIEW_TITLES.map, icon: <MapIcon size={18} /> },
];

const FINANCIAL_NAV: NavDef[] = [
  { view: 'costs', label: SHELL_VIEW_TITLES.costs, icon: <Wallet size={18} />, roles: ['admin'] },
  {
    view: 'financial',
    label: SHELL_VIEW_TITLES.financial,
    icon: <LineChart size={18} />,
    roles: ['admin'],
  },
  { view: 'billing', label: SHELL_VIEW_TITLES.billing, icon: <Receipt size={18} />, roles: ['admin'] },
];

const ADMIN_NAV: NavDef[] = [
  { view: 'directory', label: SHELL_VIEW_TITLES.directory, icon: <Users size={18} />, roles: ['admin'] },
  { view: 'newClient', label: SHELL_VIEW_TITLES.newClient, icon: <UserPlus size={18} />, roles: ['admin'] },
];

function filterByRole(items: NavDef[], role: UserRole): NavDef[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

interface NavButtonProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({ active, icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
      active
        ? 'border-[color-mix(in_srgb,var(--accent-blue)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent-blue)_18%,transparent)] text-[var(--text-primary)]'
        : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-white/5 hover:text-[var(--text-primary)]'
    }`}
  >
    <span
      className={`text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent-blue)] ${
        active ? 'text-[var(--accent-blue)]' : ''
      }`}
    >
      {icon}
    </span>
    <span className="truncate font-medium">{label}</span>
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentView,
  onNavigate,
  offline,
  onRequestClose,
  onLogout,
}) => {
  const go = (view: ShellView) => {
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
