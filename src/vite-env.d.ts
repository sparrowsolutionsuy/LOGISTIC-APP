/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEET_URL?: string;
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
