import React, { useCallback, useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Upload,
  ExternalLink,
  Filter,
  AlertTriangle,
} from 'lucide-react';
import type { DocumentCategory, FleetDocument, User } from '../../types';
import { DOCUMENT_CATEGORIES } from '../../types';
import {
  DOCUMENT_CATEGORY_LABELS,
  countDocumentAlerts,
  documentAlert,
  filterDocuments,
  type DocumentAlert,
} from '../../utils/documents';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export interface DocumentsViewProps {
  user: User;
  documents: FleetDocument[];
  onSave: (doc: FleetDocument) => Promise<boolean>;
  onUpdate: (doc: FleetDocument) => Promise<boolean>;
  onSoftDelete: (id: string) => Promise<boolean>;
  onUpload: (
    documentId: string,
    fileData: string,
    fileName: string,
    mimeType: string
  ) => Promise<{ ok: boolean; url?: string; message?: string }>;
}

interface FormState {
  titulo: string;
  categoria: DocumentCategory;
  entidadRef: string;
  emitidoEn: string;
  venceEn: string;
  notas: string;
}

const emptyForm = (): FormState => ({
  titulo: '',
  categoria: 'camion',
  entidadRef: '',
  emitidoEn: '',
  venceEn: '',
  notas: '',
});

function alertLabel(alert: DocumentAlert): string {
  if (alert === 'overdue') return 'Vencido';
  if (alert === 'expiring') return 'Por vencer';
  if (alert === 'ok') return 'Vigente';
  return 'Sin fecha';
}

function alertClass(alert: DocumentAlert): string {
  if (alert === 'overdue') {
    return 'border-[color-mix(in_srgb,var(--accent-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-red)_12%,transparent)] text-[var(--accent-red)]';
  }
  if (alert === 'expiring') {
    return 'border-[color-mix(in_srgb,var(--accent-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] text-[var(--accent-amber)]';
  }
  if (alert === 'ok') {
    return 'border-[color-mix(in_srgb,var(--accent-emerald)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-emerald)_10%,transparent)] text-[var(--accent-emerald)]';
  }
  return 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]';
}

function readFileAsBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ base64, mime: file.type || 'application/octet-stream' });
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  user,
  documents,
  onSave,
  onUpdate,
  onSoftDelete,
  onUpload,
}) => {
  const isAdmin = user.role === 'admin';
  const [categoria, setCategoria] = useState<DocumentCategory | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FleetDocument | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadBusyId, setUploadBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const counts = useMemo(() => countDocumentAlerts(documents), [documents]);

  const filtered = useMemo(
    () =>
      filterDocuments(documents, {
        categoria,
        activo: showInactive ? 'all' : true,
        query,
      }),
    [documents, categoria, showInactive, query]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (doc: FleetDocument) => {
    setEditing(doc);
    setForm({
      titulo: doc.titulo,
      categoria: doc.categoria,
      entidadRef: doc.entidadRef,
      emitidoEn: doc.emitidoEn,
      venceEn: doc.venceEn,
      notas: doc.notas,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const titulo = form.titulo.trim();
    if (!titulo) {
      setFormError('El título es obligatorio.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      if (editing) {
        const updated: FleetDocument = {
          ...editing,
          titulo,
          categoria: form.categoria,
          entidadRef: form.entidadRef.trim(),
          emitidoEn: form.emitidoEn,
          venceEn: form.venceEn,
          notas: form.notas.trim(),
          actualizadoEn: today,
        };
        const ok = await onUpdate(updated);
        if (!ok) {
          setFormError('No se pudo actualizar el documento.');
          return;
        }
      } else {
        const created: FleetDocument = {
          id: `DOC${Date.now()}`,
          titulo,
          categoria: form.categoria,
          entidadRef: form.entidadRef.trim(),
          emitidoEn: form.emitidoEn,
          venceEn: form.venceEn,
          notas: form.notas.trim(),
          activo: true,
          creadoPor: user.username,
          creadoEn: today,
          actualizadoEn: today,
        };
        const ok = await onSave(created);
        if (!ok) {
          setFormError('No se pudo guardar el documento.');
          return;
        }
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (doc: FleetDocument) => {
    if (!isAdmin) return;
    if (!window.confirm(`¿Desactivar «${doc.titulo}»? El archivo en Drive se conserva.`)) return;
    await onSoftDelete(doc.id);
  };

  const handleUpload = useCallback(
    async (doc: FleetDocument, file: File | null) => {
      if (!isAdmin || !file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        window.alert('El archivo supera 10 MB.');
        return;
      }
      if (file.type && !ALLOWED_MIME.has(file.type)) {
        window.alert('Solo se permiten PDF o imágenes (JPEG/PNG/WebP/GIF).');
        return;
      }
      setUploadBusyId(doc.id);
      try {
        const { base64, mime } = await readFileAsBase64(file);
        const result = await onUpload(doc.id, base64, file.name, mime);
        if (!result.ok) {
          window.alert(result.message || 'No se pudo subir el archivo.');
        }
      } catch (err) {
        console.error('[DocumentsView] upload:', err);
        window.alert('Error al leer o subir el archivo.');
      } finally {
        setUploadBusyId(null);
      }
    },
    [isAdmin, onUpload]
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Documentos</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {counts.overdue} vencidos · {counts.expiring} por vencer
            {!isAdmin ? ' · Solo lectura' : ''}
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" onClick={openCreate} icon={<Plus size={18} aria-hidden />}>
            Nuevo documento
          </Button>
        ) : null}
      </header>

      {(counts.overdue > 0 || counts.expiring > 0) && (
        <div
          className={`flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm ${
            counts.overdue > 0
              ? 'border-[color-mix(in_srgb,var(--accent-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-red)_8%,transparent)] text-[var(--accent-red)]'
              : 'border-[color-mix(in_srgb,var(--accent-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_8%,transparent)] text-[var(--accent-amber)]'
          }`}
          role="status"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Hay documentos activos con alerta de vencimiento. Revisá la columna Estado.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
          Buscar
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Título, entidad, notas…"
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
          Categoría
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as DocumentCategory | 'all')}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="all">Todas</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <label className="mt-5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4"
            />
            <Filter size={14} aria-hidden />
            Incluir inactivos
          </label>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={28} aria-hidden />}
          title="Sin documentos"
          description={
            documents.length === 0
              ? isAdmin
                ? 'Creá el primer documento o subí un archivo tras el redeploy de Apps Script.'
                : 'Todavía no hay documentos cargados.'
              : 'Ningún documento coincide con los filtros.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
            <thead className="bg-[var(--bg-elevated)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Título</th>
                <th className="px-3 py-2.5 font-semibold">Categoría</th>
                <th className="px-3 py-2.5 font-semibold">Entidad</th>
                <th className="px-3 py-2.5 font-semibold">Emitido</th>
                <th className="px-3 py-2.5 font-semibold">Vence</th>
                <th className="px-3 py-2.5 font-semibold">Estado</th>
                <th className="px-3 py-2.5 font-semibold">Archivo</th>
                {isAdmin ? <th className="px-3 py-2.5 font-semibold">Acciones</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((doc) => {
                const alert = documentAlert(doc);
                return (
                  <tr
                    key={doc.id}
                    className={!doc.activo ? 'opacity-55' : undefined}
                  >
                    <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">
                      {doc.titulo}
                      {!doc.activo ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-[var(--text-muted)]">
                          Inactivo
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      {DOCUMENT_CATEGORY_LABELS[doc.categoria]}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      {doc.entidadRef || '—'}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                      {doc.emitidoEn || '—'}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                      {doc.venceEn || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-[var(--radius-full)] border px-2 py-0.5 text-xs font-semibold ${alertClass(alert)}`}
                      >
                        {alertLabel(alert)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {doc.archivoUrl ? (
                        <a
                          href={doc.archivoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--accent-blue)] hover:underline"
                        >
                          Abrir <ExternalLink size={14} aria-hidden />
                        </a>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    {isAdmin ? (
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            className="rounded-[var(--radius-md)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            aria-label="Editar"
                            onClick={() => openEdit(doc)}
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                          <label
                            className={`cursor-pointer rounded-[var(--radius-md)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] ${
                              uploadBusyId === doc.id ? 'opacity-50' : ''
                            }`}
                            title="Subir archivo"
                          >
                            <Upload size={16} aria-hidden />
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,image/jpeg,image/png,image/webp,image/gif,application/pdf"
                              disabled={uploadBusyId === doc.id || !doc.activo}
                              onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                e.target.value = '';
                                void handleUpload(doc, f);
                              }}
                            />
                          </label>
                          {doc.activo ? (
                            <button
                              type="button"
                              className="rounded-[var(--radius-md)] p-2 text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--accent-red)_10%,transparent)] hover:text-[var(--accent-red)]"
                              aria-label="Desactivar"
                              onClick={() => void handleSoftDelete(doc)}
                            >
                              <Trash2 size={16} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Editar documento' : 'Nuevo documento'}
        size="md"
      >
        <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
            Título *
            <input
              required
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
            Categoría
            <select
              value={form.categoria}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoria: e.target.value as DocumentCategory }))
              }
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)]"
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
            Entidad (placa, nombre, póliza…)
            <input
              value={form.entidadRef}
              onChange={(e) => setForm((f) => ({ ...f, entidadRef: e.target.value }))}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)]"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
              Emitido
              <input
                type="date"
                value={form.emitidoEn}
                onChange={(e) => setForm((f) => ({ ...f, emitidoEn: e.target.value }))}
                className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
              Vence
              <input
                type="date"
                value={form.venceEn}
                onChange={(e) => setForm((f) => ({ ...f, venceEn: e.target.value }))}
                className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-primary)]"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
            Notas
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              rows={3}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          {formError ? (
            <p className="text-sm text-[var(--accent-red)]" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
