import { getRuntimeEnvironment } from '@/config/runtime-env'
import { sendEmailConfirmation, sendResetPassword } from '@/server/email/sender'

export type AuthEmailMessage =
  | { to: string; type: 'verification'; url: string; userName?: string | null }
  | { to: string; type: 'password-reset'; url: string; userName?: string | null }

type QueueMessage = {
  ack: () => void
  body: AuthEmailMessage
  retry: () => void
}

export type AuthEmailBatch = {
  messages: Array<QueueMessage>
}

/** Persists auth email in Cloudflare Queues before Better Auth completes the request. */
export async function enqueueAuthEmail(message: AuthEmailMessage) {
  const environment = getRuntimeEnvironment()

  if (environment.deployment === 'development') {
    return deliverAuthEmail(message)
  }

  await environment.bindings.authEmailQueue.send(message)
}

/** Delivers queued messages and asks Cloudflare to retry failed provider calls. */
export async function handleAuthEmailBatch(batch: AuthEmailBatch) {
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await deliverAuthEmail(message.body)
        message.ack()
      } catch {
        message.retry()
      }
    }),
  )
}

async function deliverAuthEmail(message: AuthEmailMessage) {
  if (message.type === 'verification') {
    return sendEmailConfirmation(message)
  }

  return sendResetPassword(message)
}
