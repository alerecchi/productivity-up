import { Resend } from 'resend'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { renderEmailVerificationTemplate } from '@/server/email/templates/email-verification'
import { renderResetPasswordTemplate } from '@/server/email/templates/reset-password'

export type SendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
}

export type EmailRuntimeConfiguration = {
  apiKey: string
  appName: string
  from: string
}

// TODO: change the implementation with SES in production, remove resend dependency
export async function sendEmail(
  input: SendEmailInput,
  configuration: EmailRuntimeConfiguration = emailRuntimeConfiguration(),
) {
  const resend = new Resend(configuration.apiKey)
  let result

  try {
    result = await resend.emails.send({
      from: configuration.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })
  } catch {
    throw new Error('Email delivery failed')
  }

  if (result.error) {
    throw new Error('Email delivery failed')
  }
}

export async function sendEmailConfirmation(
  input: { to: string; userName?: string | null; url: string },
  configuration: EmailRuntimeConfiguration = emailRuntimeConfiguration(),
) {
  const email = renderEmailVerificationTemplate({
    appName: configuration.appName,
    userName: input.userName,
    verificationUrl: input.url,
  })
  await sendEmail(
    {
      to: input.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    },
    configuration,
  )
}

export async function sendResetPassword(
  input: { to: string; userName?: string | null; url: string },
  configuration: EmailRuntimeConfiguration = emailRuntimeConfiguration(),
) {
  const email = renderResetPasswordTemplate({
    appName: configuration.appName,
    userName: input.userName,
    resetUrl: input.url,
  })

  await sendEmail(
    {
      to: input.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    },
    configuration,
  )
}

function emailRuntimeConfiguration(): EmailRuntimeConfiguration {
  const environment = getRuntimeEnvironment()

  return {
    apiKey: environment.email.apiKey,
    appName: environment.application.name,
    from: environment.email.from,
  }
}
