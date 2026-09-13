import { Resend } from 'resend'

import { renderEmailVerificationTemplate } from '@/server/email/templates/email-verification'
import { renderResetPasswordTemplate } from '@/server/email/templates/reset-password'

export type SendEmailInput = {
  to: string
  subject: string
  text: string
  html: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const resend = new Resend(requiredEnv('RESEND_API_KEY'))
const from = requiredEnv('EMAIL_FROM')
const appName = requiredEnv('APP_NAME')

// TODO: change the implementation with SES in production, remove resend dependency
export async function sendEmail(input: SendEmailInput) {
  let result

  try {
    result = await resend.emails.send({
      from,
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

export async function sendEmailConfirmation(input: { to: string; userName?: string | null; url: string }) {
  const email = renderEmailVerificationTemplate({
    appName,
    userName: input.userName,
    verificationUrl: input.url,
  })
  await sendEmail({
    to: input.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
}

export async function sendResetPassword(input: { to: string; userName?: string | null; url: string }) {
  const email = renderResetPasswordTemplate({
    appName,
    userName: input.userName,
    resetUrl: input.url,
  })

  await sendEmail({
    to: input.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
}
