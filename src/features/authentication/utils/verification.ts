export const EMAIL_VERIFICATION_CALLBACK_PATH = '/email-verified'

declare module '@tanstack/react-router' {
  // Carried in history state rather than the URL, so the address never appears in links, logs, or referrers.
  interface HistoryState {
    /** The address a verification email was just requested for. */
    verificationEmail?: string
    /** When that verification email was requested (epoch ms). */
    verificationEmailSentAt?: number
  }
}
