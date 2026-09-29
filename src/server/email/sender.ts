import { Resend } from 'resend'
import type { ErrorResponse } from 'resend'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import type { AuthEmail } from '@/server/email/auth-email'
import { renderEmailVerificationTemplate } from '@/server/email/templates/email-verification'
import { renderResetPasswordTemplate } from '@/server/email/templates/reset-password'

export type EmailRuntimeConfiguration = {
  apiKey: string
  appName: string
  from: string
}

// Resend error names are fixed codes, so they are safe to record; anything else is reported as `provider_error`.
const PROVIDER_ERROR_CODES = [
  'application_error',
  'concurrent_idempotent_requests',
  'daily_quota_exceeded',
  'internal_server_error',
  'invalid_access',
  'invalid_api_key',
  'invalid_attachment',
  'invalid_from_address',
  'invalid_idempotency_key',
  'invalid_idempotent_request',
  'invalid_parameter',
  'invalid_region',
  'method_not_allowed',
  'missing_api_key',
  'missing_required_field',
  'monthly_quota_exceeded',
  'not_found',
  'rate_limit_exceeded',
  'restricted_api_key',
  'security_error',
  'validation_error',
] as const satisfies ReadonlyArray<ErrorResponse['name']>

export type EmailProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number] | 'provider_error' | 'provider_unreachable'

/** A provider failure whose message and code never contain recipient, content, or provider response data. */
export class EmailDeliveryError extends Error {
  readonly providerErrorCode: EmailProviderErrorCode

  constructor(providerErrorCode: EmailProviderErrorCode) {
    super('Email delivery failed')
    this.name = 'EmailDeliveryError'
    this.providerErrorCode = providerErrorCode
  }
}

/** Renders the email for its kind and sends it to the requested recipient. Failures throw `EmailDeliveryError`. */
// TODO: change the implementation with SES in production, remove resend dependency
export async function sendAuthEmail(
  email: AuthEmail,
  configuration: EmailRuntimeConfiguration = emailRuntimeConfiguration(),
) {
  const content =
    email.kind === 'email_verification'
      ? renderEmailVerificationTemplate({
          appName: configuration.appName,
          userName: email.recipientName,
          verificationUrl: email.actionUrl,
        })
      : renderResetPasswordTemplate({
          appName: configuration.appName,
          userName: email.recipientName,
          resetUrl: email.actionUrl,
        })
  let result

  try {
    result = await new Resend(configuration.apiKey).emails.send({
      from: configuration.from,
      to: email.recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
    })
  } catch {
    throw new EmailDeliveryError('provider_unreachable')
  }

  if (result.error) {
    const name: string = result.error.name
    throw new EmailDeliveryError(PROVIDER_ERROR_CODES.find((code) => code === name) ?? 'provider_error')
  }

  return { providerMessageId: result.data.id }
}

function emailRuntimeConfiguration(): EmailRuntimeConfiguration {
  const environment = getRuntimeEnvironment()

  return {
    apiKey: environment.email.apiKey,
    appName: environment.application.name,
    from: environment.email.from,
  }
}
