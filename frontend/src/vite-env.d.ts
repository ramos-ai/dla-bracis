/// <reference types="vite/client" />

interface Window {
  APP_CONFIG?: { apiUrl?: string };
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
