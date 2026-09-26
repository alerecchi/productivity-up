type AccountSession = { user: { emailVerified: boolean } } | null

export type AccountOperationAccess = 'allow' | 'authentication-required' | 'email-verification-required'

/**
 * Better Auth endpoints open to signed-out and unverified callers: identity, session read, sign-out,
 * verification, and account recovery. Every other endpoint requires a verified User.
 */
export const UNVERIFIED_AUTH_PATHS: ReadonlySet<string> = new Set([
  '/get-session',
  '/sign-out',
  '/sign-in/email',
  '/sign-in/social',
  '/sign-up/email',
  '/send-verification-email',
  '/verify-email',
  '/request-password-reset',
  '/reset-password',
  '/reset-password/:token',
  '/callback/:id',
  '/ok',
  '/error',
])

/**
 * Decides whether a Better Auth endpoint may run for the caller.
 * `path` is the endpoint's route template, as Better Auth passes it to hooks. `loadSession` must
 * read the session from the database, bypassing the cookie cache; it runs only for gated paths.
 */
export async function authorizeAccountOperation(
  path: string,
  loadSession: () => Promise<AccountSession>,
): Promise<AccountOperationAccess> {
  if (UNVERIFIED_AUTH_PATHS.has(path)) {
    return 'allow'
  }

  const session = await loadSession()

  if (!session) {
    return 'authentication-required'
  }

  return session.user.emailVerified ? 'allow' : 'email-verification-required'
}
