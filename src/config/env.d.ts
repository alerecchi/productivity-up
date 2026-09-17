declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly DATABASE_URL?: string
    }
  }
}

interface ImportMetaEnv {
  // Client-side environment variables
  readonly VITE_APP_NAME: string
  readonly VITE_SERVER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export {}
