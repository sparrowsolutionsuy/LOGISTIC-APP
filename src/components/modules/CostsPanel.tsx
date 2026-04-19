import React from 'react';
import type { Cost, CostCategory } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export interface CostsPanelProps {
  costs: Cost[];
  registradoPor: string;
  onAddCost: (cost: Cost) => void | Promise<void>;
  onUpdateCost: (cost: Cost) => void | Promise<void>;
  onDeleteCost: (costId: string) => void | Promise<void>;
}

export const CostsPanel: React.FC<CostsPanelProps> = ({
  costs,
  registradoPor,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
}) => {
  const addDemo = () => {
    void (async () => {
      const categoria: CostCategory = 'Otros';
      await onAddCost({
        id: `K${Date.now()}`,
        fecha: new Date().toISOString().slice(0, 10),
        tripId: null,
        categoria,
        descripcion: 'Costo de prueba (local)',
        monto: 150,
        registradoPor,
      });
    })();
  };

  return (
    <Card title="Costos operativos" padding="lg">
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        Listado en memoria. Los cambios se sincronizarán con Sheets cuando el módulo esté conectado.
      </p>
      <ul className="space-y-2 text-sm">
        {costs.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] py-2 text-[var(--text-secondary)]"
          >
            <div className="min-w-0">
              <span className="font-medium text-[var(--text-primary)]">{c.descripcion}</span>
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {c.categoria} · USD {c.monto.toLocaleString('es-UY')}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onUpdateCost({ ...c, monto: c.monto + 10 })}
              >
                +10
              </Button>
              <Button variant="danger" size="sm" onClick={() => void onDeleteCost(c.id)}>
                Borrar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" className="mt-4" onClick={addDemo}>
        Agregar costo demo
      </Button>
    </Card>
  );
};
