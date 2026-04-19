import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  AlertTriangle,
  Box,
  Inbox,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { KPICard } from '../components/ui/KPICard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { useToast } from '../hooks/useToast';
import type { TripStatus } from '../types';

export function DevRoute(): React.ReactElement {
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }
  return <DevPlayground />;
}

const STATUSES: TripStatus[] = ['Pendiente', 'En Tránsito', 'Completado', 'Cerrado'];

export const DevPlayground: React.FC = () => {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [dept, setDept] = useState('ops');

  return (
    <div className="min-h-screen bg-[var(--bg-base)] p-4 text-[var(--text-primary)] lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Dev UI / Design System</h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Vista temporal para validar componentes atómicos (solo desarrollo).
            </p>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Volver a la app
          </Link>
        </div>

        <Card title="Badge" padding="lg">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Badge key={s} status={s} />
            ))}
          </div>
        </Card>

        <Card title="Button" padding="lg">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" size="sm" icon={<Sparkles size={14} />}>
              Con icono
            </Button>
            <Button variant="primary" loading>
              Cargando
            </Button>
          </div>
        </Card>

        <Card title="Toast (useToast)" padding="lg">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => showToast('Operación exitosa', 'success')}>
              success
            </Button>
            <Button variant="secondary" onClick={() => showToast('Algo salió mal', 'error')}>
              error
            </Button>
            <Button variant="secondary" onClick={() => showToast('Información útil', 'info')}>
              info
            </Button>
            <Button variant="secondary" onClick={() => showToast('Atención requerida', 'warning')}>
              warning
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <KPICard
            label="Ingresos MTD"
            value="USD 128.400"
            sub="vs. mes anterior"
            trend="up"
            icon={<LayoutDashboard size={18} />}
          />
          <KPICard
            label="Costos operativos"
            value="USD 41.200"
            sub="combustible + peajes"
            trend="down"
            icon={<Box size={18} />}
            accentColor="var(--accent-amber)"
          />
        </div>

        <Card
          title="Card con acción"
          padding="lg"
          action={
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Abrir modal
            </Button>
          }
        >
          <p className="text-sm text-[var(--text-secondary)]">
            Contenedor de sección con borde sutil y superficie slate.
          </p>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Input / Select" padding="lg">
            <div className="space-y-3">
              <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Campo con error" value="" error="Este campo es obligatorio" readOnly />
              <Select
                label="Área"
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                options={[
                  { value: 'ops', label: 'Operaciones' },
                  { value: 'fin', label: 'Finanzas' },
                ]}
              />
            </div>
          </Card>

          <Card title="Estados" padding="lg">
            <div className="space-y-4">
              <EmptyState
                icon={<Inbox className="h-10 w-10" />}
                title="Sin datos"
                description="No hay registros para mostrar en este período."
                action={<Button variant="primary">Crear registro</Button>}
              />
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner size="lg" label="Sincronizando…" />
              </div>
            </div>
          </Card>
        </div>

        <Card title="Alerta" padding="lg">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="font-semibold">Amber (alertas)</p>
              <p className="mt-1 text-xs text-amber-100/80">
                Uso reservado para advertencias operativas (restricciones, SLA, riesgos).
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Modal de ejemplo" size="md">
        <p className="text-sm text-[var(--text-secondary)]">
          Modal genérico con portal, overlay y cierre accesible.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Confirmar
          </Button>
        </div>
      </Modal>
    </div>
  );
};
