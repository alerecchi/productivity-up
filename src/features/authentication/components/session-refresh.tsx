import { authClient } from '@/features/authentication/auth-client'

/** Keeps an open browser session renewable through Better Auth's GET-then-POST session flow. */
export function SessionRefresh() {
  authClient.useSession()
  return null
}
