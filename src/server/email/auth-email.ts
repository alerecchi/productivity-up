import { waitUntil } from 'cloudflare:workers'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { EmailDeliveryError, sendAuthEmail } from '@/server/email/sender'
import type { EmailProviderErrorCode } from '@/server/email/sender'

export type AuthEmailKind = 'email_verification' | 'password_reset'

export type AuthEmail = {
  actionUrl: string
  kind: AuthEmailKind
  recipient: string
  recipientName?: string | null
}

/** One record per send attempt. Never contains the recipient, name, link, email body, or raw errors. */
export type AuthEmailSendRecord = {
  deploymentVersion: string
  kind: AuthEmailKind
  operation: 'auth_email.send'
  outcome: 'failed' | 'sent'
  providerErrorCode?: EmailProviderErrorCode
  /** Opaque Resend message ID, for correlating with the provider dashboard. */
  providerMessageId?: string
  requestId: string
  thirdPartyDurationMs: number
}

export type AuthEmailDispatcherDependencies = {
  deploymentVersion: string
  emit: (record: AuthEmailSendRecord) => void
  /** Keeps work running after the response (Cloudflare `waitUntil`); throws when no request context is available. */
  schedule: (work: Promise<unknown>) => void
  send: (email: AuthEmail) => Promise<{ providerMessageId: string }>
}

/**
 * Creates Better Auth's email callback. Each call sends one email after the response when possible, otherwise inline,
 * and emits one sanitized record. Delivery is best-effort: the callback never rejects, and failures are not retried.
 */
export function createAuthEmailDispatcher(
  dependencies: AuthEmailDispatcherDependencies = defaultDispatcherDependencies(),
) {
  return async (email: AuthEmail, requestId: string) => {
    const work = sendAndRecord(email, requestId, dependencies)

    try {
      dependencies.schedule(work)
    } catch {
      await work
    }
  }
}

async function sendAndRecord(email: AuthEmail, requestId: string, dependencies: AuthEmailDispatcherDependencies) {
  const record = {
    deploymentVersion: dependencies.deploymentVersion,
    kind: email.kind,
    operation: 'auth_email.send',
    requestId,
  } as const
  const startedAt = performance.now()

  try {
    const { providerMessageId } = await dependencies.send(email)
    dependencies.emit({
      ...record,
      outcome: 'sent',
      providerMessageId,
      thirdPartyDurationMs: performance.now() - startedAt,
    })
  } catch (error) {
    dependencies.emit({
      ...record,
      outcome: 'failed',
      providerErrorCode: error instanceof EmailDeliveryError ? error.providerErrorCode : 'provider_error',
      thirdPartyDurationMs: performance.now() - startedAt,
    })
  }
}

function defaultDispatcherDependencies(): AuthEmailDispatcherDependencies {
  return {
    deploymentVersion: getRuntimeEnvironment().version,
    emit: (record) => (record.outcome === 'sent' ? console.info(record) : console.error(record)),
    schedule: waitUntil,
    send: (email) => sendAuthEmail(email),
  }
}
