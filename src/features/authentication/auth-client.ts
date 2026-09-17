import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { clientEnv } from '@/config/env'
import { AUTH_USER_FIELDS } from '@/lib/auth-user-fields'

export const authClient = createAuthClient({
  baseURL: clientEnv.VITE_SERVER_URL,
  plugins: [inferAdditionalFields({ user: AUTH_USER_FIELDS })],
})
