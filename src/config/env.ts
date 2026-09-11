import { z } from 'zod'

const clientEnvSchema = z.object({
  VITE_APP_NAME: z.string(),
  VITE_SERVER_URL: z.url(),
})

// Validate client environment
export const clientEnv = clientEnvSchema.parse(import.meta.env)
