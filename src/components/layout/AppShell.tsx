import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { ActiveTab, User } from '../../types';
import { ROUTE_NAMES } from '../../constants';
import { Sidebar } from './Sidebar';
import { Button } from '../ui/Button';

export interface AppShellProps {
  user: User;
  currentView: ActiveTab;
  onNavigate: (view: ActiveTab) => void;
  offline: boolean;
  pendingTripsCount: number;
  onLogout: () => void;
  headerBadge?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  user,
  currentView,
  onNavigate,
  offline,
  pendingTripsCount,
  onLogout,
  headerBadge,
  children,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen max-h-screen min-h-0 flex-col overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-surface)_92%,transparent)] px-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="!px-2"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            icon={<Menu size={18} />}
          />
          <nav
            className="flex min-w-0 items-center gap-1 truncate text-xs text-[var(--text-muted)]"
            aria-label="Ruta actual"
          >
            <span className="shrink-0 font-semibold tracking-tight text-[var(--text-secondary)]">GDC</span>
            <span className="shrink-0 text-[var(--text-muted)]">›</span>
            <span className="truncate font-medium text-[var(--text-primary)]">
              {ROUTE_NAMES[currentView]}
            </span>
          </nav>
        </div>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[min(88vw,320px)] border-r border-[var(--border)] shadow-xl">
            <div className="flex items-center justify-end border-b border-[var(--border)] px-2 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="!px-2"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar"
                icon={<X size={18} />}
              />
            </div>
            <div className="h-[calc(100%-44px)]">
              <Sidebar
                user={user}
                currentView={currentView}
                onNavigate={onNavigate}
                offline={offline}
                pendingTripsCount={pendingTripsCount}
                onRequestClose={() => setDrawerOpen(false)}
                onLogout={() => {
                  setDrawerOpen(false);
                  onLogout();
                }}
              />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] lg:block">
          <Sidebar
            user={user}
            currentView={currentView}
            onNavigate={onNavigate}
            offline={offline}
            pendingTripsCount={pendingTripsCount}
            onLogout={onLogout}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="hidden h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-surface)] px-6 lg:flex">
            <div className="flex items-center gap-2">
              <nav className="flex items-center gap-1 text-sm text-[var(--text-muted)]" aria-label="Ruta">
                <span>GDC</span>
                <span>›</span>
                <h1 className="font-semibold text-[var(--text-primary)]">{ROUTE_NAMES[currentView]}</h1>
              </nav>
              {headerBadge}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-semibold text-[var(--text-primary)]">{user.nombre}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent-blue)]">
                  {user.role}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-primary)]">
                {user.nombre.charAt(0)}
              </div>
            </div>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            <div
              key={currentView}
              className="motion-safe:animate-[gdcTab_0.18s_ease-out_both]"
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
