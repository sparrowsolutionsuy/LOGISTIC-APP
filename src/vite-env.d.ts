/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEET_URL?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_DRIVE_FOLDER_REMITOS?: string;
  readonly VITE_DRIVE_FOLDER_FACTURAS?: string;
  /** Opcional: reporte de rendimiento con Anthropic. */
  readonly VITE_ANTHROPIC_API_KEY?: string;
  /** Solo DEV/tests: permite mock aunque falte VITE_SHEET_URL. */
  readonly VITE_ALLOW_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
