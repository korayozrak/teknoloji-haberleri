/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Haber akışı uç noktası. Bkz. src/config.ts */
  readonly VITE_NEWS_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
