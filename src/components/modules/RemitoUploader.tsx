import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileImage, X, Loader2, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { extractRemitoData } from '../../services/remitoService';
import type { RemitoExtracted, RemitoConfidenceLevel, Trip } from '../../types';

type RemitoFormFieldKey = 'fecha' | 'origen' | 'destino' | 'contenido' | 'pesoKg';

interface ExtractedField {
  key: RemitoFormFieldKey;
  label: string;
  formField: keyof Trip;
}

const FIELD_MAP: ExtractedField[] = [
  { key: 'fecha', label: 'Fecha de carga', formField: 'fecha' },
  { key: 'origen', label: 'Origen', formField: 'origen' },
  { key: 'destino', label: 'Destino', formField: 'destino' },
  { key: 'contenido', label: 'Contenido', formField: 'contenido' },
  { key: 'pesoKg', label: 'Peso (kg)', formField: 'pesoKg' },
];

const CONFIDENCE_CONFIG: Record<
  RemitoConfidenceLevel,
  { label: string; className: string; icon: React.ReactNode }
> = {
  high: {
    label: 'Alta',
    className: 'text-[var(--accent-emerald)]',
    icon: <CheckCircle size={12} aria-hidden />,
  },
  medium: {
    label: 'Media',
    className: 'text-[var(--accent-amber)]',
    icon: <Info size={12} aria-hidden />,
  },
  low: {
    label: 'Baja',
    className: 'text-[var(--accent-red)]',
    icon: <AlertTriangle size={12} aria-hidden />,
  },
};

type RemitoMime = 'image/jpeg' | 'image/png' | 'image/webp';

interface Props {
  onDataExtracted: (
    fields: Partial<Trip>,
    imageBase64: string,
    imageName: string,
    imageMime: string
  ) => void;
  onClose: () => void;
}

export default function RemitoUploader({ onDataExtracted, onClose }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageMime, setImageMime] = useState<RemitoMime>('image/jpeg');
  const [imageB64, setImageB64] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [extracted, setExtracted] = useState<RemitoExtracted | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(FIELD_MAP.map((f) => f.key)));

  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const validTypes: RemitoMime[] = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type as RemitoMime)) {
      setErrorMsg('Formato no soportado. Usá JPG, PNG o WEBP.');
      setStatus('error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('La imagen es muy grande. Máximo 5 MB.');
      setStatus('error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        setErrorMsg('No se pudo leer la imagen.');
        setStatus('error');
        return;
      }
      setPreview(dataUrl);
      setImageB64(base64);
      setImageName(file.name);
      setImageMime(file.type as RemitoMime);
      setStatus('idle');
      setErrorMsg('');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleExtract = async () => {
    if (!imageB64) {
      return;
    }
    setStatus('loading');
    setExtracted(null);
    setErrorMsg('');

    const result = await extractRemitoData(imageB64, imageMime);

    if (result.success) {
      setExtracted(result.data);
      setStatus('done');
    } else {
      setErrorMsg(result.error);
      setStatus('error');
    }
  };

  const handleApply = () => {
    if (!extracted) {
      return;
    }

    const partial: Partial<Trip> = {};

    FIELD_MAP.forEach(({ key, formField }) => {
      if (!selected.has(key)) {
        return;
      }
      const field = extracted[key];
      if (field.value == null) {
        return;
      }
      if (formField === 'pesoKg') {
        partial.pesoKg = Number(field.value);
      } else {
        (partial as Record<string, string>)[formField] = String(field.value);
      }
    });

    onDataExtracted(partial, imageB64, imageName, imageMime);
    onClose();
  };

  const toggleKey = (key: string, hasValue: boolean) => {
    if (!hasValue) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {!preview && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            cursor-pointer rounded-xl border-2 border-dashed p-8 text-center
            transition-all duration-200
            ${
              dragOver
                ? 'border-[var(--accent-blue)] bg-[color-mix(in_srgb,var(--accent-blue)_12%,transparent)]'
                : 'border-[var(--border)] hover:border-[var(--accent-blue)] hover:bg-[var(--bg-elevated)]'
            }
          `}
        >
          <FileImage size={40} className="mx-auto mb-3 text-[var(--text-muted)]" aria-hidden />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Arrastrá el remito aquí o hacé click para seleccionar
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">JPG, PNG, WEBP — máx. 5 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) {
                processFile(f);
              }
            }}
          />
        </div>
      )}

      {preview && status !== 'done' && (
        <div className="relative">
          <img
            src={preview}
            alt="Vista previa del remito"
            className="max-h-64 w-full rounded-xl border border-[var(--border)] object-contain"
          />
          <button
            type="button"
            aria-label="Quitar imagen"
            onClick={() => {
              setPreview(null);
              setImageB64('');
              setStatus('idle');
              setErrorMsg('');
            }}
            className="absolute right-2 top-2 rounded-full bg-[var(--accent-red)] p-1 text-white transition-colors hover:opacity-90"
          >
            <X size={14} aria-hidden />
          </button>
          <p className="mt-1 text-center text-xs text-[var(--text-muted)]">{imageName}</p>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 size={32} className="animate-spin text-[var(--accent-blue)]" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">Analizando remito con IA…</p>
          <p className="text-xs text-[var(--text-muted)]">Esto puede tardar unos segundos</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-red)_10%,var(--bg-surface))] p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--accent-red)]" aria-hidden />
          <div>
            <p className="text-sm font-medium text-[var(--accent-red)]">Error en la extracción</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{errorMsg}</p>
          </div>
        </div>
      )}

      {status === 'done' && extracted && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-[var(--accent-emerald)]" aria-hidden />
            <p className="text-sm font-semibold text-[var(--text-primary)]">Datos extraídos del remito</p>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Seleccioná qué campos querés copiar al formulario. Verificá los datos antes de aplicar.
          </p>

          {extracted.numeroRemito.value && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
              <span className="text-xs text-[var(--text-muted)]">N° Remito: </span>
              <span className="font-mono text-xs font-bold text-[var(--accent-blue)]">
                {extracted.numeroRemito.value}
              </span>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            {FIELD_MAP.map(({ key, label }) => {
              const field = extracted[key];
              const conf = CONFIDENCE_CONFIG[field.confidence];
              const isSelected = selected.has(key);
              const hasValue = field.value != null;

              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={hasValue ? 0 : -1}
                  onKeyDown={(e) => {
                    if (!hasValue) {
                      return;
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleKey(key, hasValue);
                    }
                  }}
                  onClick={() => toggleKey(key, hasValue)}
                  className={`
                    flex cursor-pointer items-center gap-3 border-b border-[var(--border)] px-4 py-3 transition-colors last:border-0
                    ${
                      hasValue
                        ? isSelected
                          ? 'bg-[color-mix(in_srgb,var(--accent-blue)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-blue)_14%,transparent)]'
                          : 'bg-[var(--bg-table-row)] hover:bg-[var(--bg-table-hover)]'
                        : 'cursor-not-allowed bg-[var(--bg-table-alt)] opacity-50'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected && hasValue}
                    disabled={!hasValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleKey(key, hasValue)}
                    className="h-4 w-4 cursor-pointer accent-[var(--accent-blue)]"
                  />
                  <span className="w-24 shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
                  <span
                    className={`flex-1 text-sm font-medium ${
                      hasValue ? 'text-[var(--text-primary)]' : 'italic text-[var(--text-muted)]'
                    }`}
                  >
                    {hasValue ? String(field.value) : 'No detectado'}
                  </span>
                  {hasValue && (
                    <span className={`flex shrink-0 items-center gap-1 text-xs ${conf.className}`}>
                      {conf.icon}
                      <span className="hidden sm:inline">{conf.label}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {extracted.proveedor.value && (
            <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Info size={12} aria-hidden />
              Proveedor detectado:{' '}
              <strong className="text-[var(--text-secondary)]">{extracted.proveedor.value}</strong>
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {!preview && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
        )}

        {preview && status === 'idle' && (
          <>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setImageB64('');
                setErrorMsg('');
              }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
            >
              Cambiar imagen
            </button>
            <button
              type="button"
              onClick={() => void handleExtract()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-[var(--text-inverse)] transition-opacity hover:opacity-90"
            >
              <Upload size={15} aria-hidden />
              Analizar con IA
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setErrorMsg('');
              }}
              className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-primary)] transition-opacity hover:opacity-90"
            >
              Ingresar manualmente
            </button>
          </>
        )}

        {status === 'done' && (
          <>
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setExtracted(null);
              }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
            >
              Cambiar imagen
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selected.size === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent-emerald)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-40"
            >
              <CheckCircle size={15} aria-hidden />
              Aplicar {selected.size} campo{selected.size !== 1 ? 's' : ''} al formulario
            </button>
          </>
        )}
      </div>
    </div>
  );
}
