import { authClient } from '@/features/authentication/auth-client'
import type { Cooldown } from '@/features/authentication/hooks/use-cooldown'
import { EMAIL_VERIFICATION_CALLBACK_PATH } from '@/features/authentication/utils/verification'

/** How long a request action stays disabled after the server accepts it. User feedback only; the server limit rules. */
export const AUTH_EMAIL_COOLDOWN_SECONDS = 60

export type AuthEmailRequestResult =
  | { status: 'accepted' }
  | { status: 'failed' }
  | { retryAfterSeconds: number; status: 'rate-limited' }

type AuthEmailResponse = { error: { status: number } | null }

/** Asks for another verification email. The response is generic whether or not the account exists. */
export function requestVerificationEmail(email: string) {
  return requestAuthEmail((onError) =>
    authClient.sendVerificationEmail({
      callbackURL: EMAIL_VERIFICATION_CALLBACK_PATH,
      email,
      fetchOptions: { onError },
    }),
  )
}

/** Asks for a password-reset email. The response is generic whether or not the account exists. */
export function requestPasswordResetEmail(email: string) {
  return requestAuthEmail((onError) =>
    authClient.requestPasswordReset({ email, fetchOptions: { onError }, redirectTo: '/reset-password' }),
  )
}

async function requestAuthEmail(
  send: (onError: (context: { response: Response }) => void) => Promise<AuthEmailResponse>,
): Promise<AuthEmailRequestResult> {
  let retryAfterSeconds: number | undefined

  try {
    const { error } = await send(({ response }) => {
      const retryAfter = Number(response.headers.get('Retry-After'))
      retryAfterSeconds = Number.isInteger(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    })

    if (!error) {
      return { status: 'accepted' }
    }

    if (error.status === 429) {
      return { retryAfterSeconds: retryAfterSeconds ?? AUTH_EMAIL_COOLDOWN_SECONDS, status: 'rate-limited' }
    }
  } catch {
    // Network failures are reported like any other failed request.
  }

  return { status: 'failed' }
}

/**
 * Starts the cooldown a request result calls for and returns the form error to show, if any: accepted requests wait
 * the standard cooldown, and throttled requests wait for the server's retry guidance.
 */
export function cooldownFeedback(result: AuthEmailRequestResult, cooldown: Cooldown) {
  if (result.status === 'accepted') {
    cooldown.extend(AUTH_EMAIL_COOLDOWN_SECONDS)
    return undefined
  }

  if (result.status === 'rate-limited') {
    cooldown.extend(result.retryAfterSeconds)
    return { form: 'Too many requests. Please wait before requesting another email.' }
  }

  return { form: 'We could not send the email. Please try again.' }
}
