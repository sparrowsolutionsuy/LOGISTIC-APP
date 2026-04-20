/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEET_URL?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  /** Opcional: habilita llamada directa a Anthropic para el reporte de rendimiento. */
  readonly VITE_ANTHROPIC_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
