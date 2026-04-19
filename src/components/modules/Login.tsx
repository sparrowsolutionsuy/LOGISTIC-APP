import React, { useState } from 'react';
import { loginUser } from '../../services/api';
import type { User } from '../../types';
import { Truck, Lock, User as UserIcon, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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
      const logged = await loginUser(username.trim(), password);
      if (logged) {
        onLogin(logged);
      } else {
        setError('Credenciales incorrectas. Verifique usuario y contraseña.');
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
        <div className="relative border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-blue)_14%,var(--bg-surface))] px-8 py-10 text-center">
          <div className="relative z-10 mx-auto flex max-w-xs flex-col items-center">
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <Truck className="h-9 w-9 text-[var(--accent-blue)]" aria-hidden />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">GDC Logistics</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Plataforma de gestión de carga — Uruguay</p>
          </div>
        </div>

        <div className="p-8 pt-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Usuario"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej. admin o operativo"
              startAdornment={<UserIcon className="h-4 w-4" />}
              required
            />

            <Input
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              startAdornment={<Lock className="h-4 w-4" />}
              required
            />

            {error ? (
              <div className="flex items-center rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">
                <AlertCircle className="mr-2 h-4 w-4 shrink-0 text-red-300" aria-hidden />
                {error}
              </div>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={loading}>
              {loading ? 'Verificando…' : 'Iniciar sesión'}
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-xs text-[var(--text-muted)]">© 2026 GDC SAS. Acceso restringido.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
