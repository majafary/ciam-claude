/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CIAM_BACKEND_URL: string
  readonly VITE_ACCOUNT_SERVICING_URL: string
  readonly VITE_DEBUG_CIAM: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}