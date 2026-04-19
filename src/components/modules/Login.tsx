import React, { useState } from 'react';
import { loginUser } from '../../services/api';
import type { User } from '../../types';
import { Truck, Lock, User as UserIcon, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const logged = await loginUser(username, password);
      if (logged) {
        onLogin(logged);
      } else {
        setError('Credenciales inválidas. Verifique usuario y contraseña.');
      }
    } catch {
      setError('Error de conexión. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] p-4 text-[var(--text-primary)]">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-xl">
        <div className="relative border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-blue)_16%,var(--bg-surface))] p-8 text-center">
          <div className="relative z-10 flex flex-col items-center">
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <Truck className="h-8 w-8 text-[var(--accent-blue)]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">GDC Logistics</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Plataforma de Gestión Segura</p>
          </div>
        </div>

        <div className="p-8 pt-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Usuario</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <UserIcon className="h-5 w-5 text-[var(--text-muted)]" />
                </div>
                <input
                  type="text"
                  required
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-shadow focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  placeholder="Ingrese su usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Contraseña</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-[var(--text-muted)]" />
                </div>
                <input
                  type="password"
                  required
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-shadow focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error ? (
              <div className="flex items-center rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">
                <AlertCircle className="mr-2 h-4 w-4 shrink-0 text-red-300" />
                {error}
              </div>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={loading}>
              {loading ? 'Verificando…' : 'Iniciar Sesión'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">© 2026 GDC SAS. Acceso restringido.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
