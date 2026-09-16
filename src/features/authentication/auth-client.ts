import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { AUTH_USER_FIELDS } from '@/lib/auth-user-fields'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL,
  plugins: [inferAdditionalFields({ user: AUTH_USER_FIELDS })],
})
