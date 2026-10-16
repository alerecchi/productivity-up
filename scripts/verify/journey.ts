import type { Page } from '@playwright/test'

/** What `pnpm verify drive` passes to a journey's default export, already signed in unless `--user none`. */
export type JourneyContext = {
  baseUrl: string
  /** Directory where this run's evidence is written. */
  evidenceDir: string
  /** Resolves once React has hydrated the current document. Call after every `goto`/`reload` before interacting. */
  hydrated: () => Promise<void>
  page: Page
  /** Saves a full-page screenshot as `<NN>-<name>.png` in the evidence dir. */
  shot: (name: string) => Promise<void>
  /** Read-only query against the instance DB; rows are also appended to the evidence log. */
  sql: (query: string, params?: Array<unknown>) => Promise<Array<Record<string, unknown>>>
  /** Records a human-readable step in the evidence log. */
  step: (description: string) => void
}

export type Journey = (context: JourneyContext) => Promise<void>
