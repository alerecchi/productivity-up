declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly DATABASE_URL?: string
      readonly BETTER_AUTH_SECRET: string
      readonly BETTER_AUTH_URL: string
      readonly RESEND_API_KEY: string
      readonly EMAIL_FROM: string
      readonly APP_NAME: string
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
