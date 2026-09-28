import { useAppForm } from '@shared/components/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card'
import { FieldGroup, FieldSet } from '@shared/components/ui/field'
import { Mail } from 'lucide-react'
import { useState } from 'react'
import z from 'zod'

import { formatWait, useCooldown } from '@/features/authentication/hooks/use-cooldown'
import {
  AUTH_EMAIL_COOLDOWN_SECONDS,
  cooldownFeedback,
  requestVerificationEmail,
} from '@/features/authentication/lib/auth-email-requests'

type EmailConfirmationProps = {
  /** The address the initial verification email was sent to, if known. */
  email?: string
  /** When the initial verification email was requested (epoch ms); starts the resend cooldown. */
  emailSentAt?: number
}

export default function EmailConfirmation({ email = '', emailSentAt }: EmailConfirmationProps) {
  const [resent, setResent] = useState(false)
  const cooldown = useCooldown(emailSentAt === undefined ? 0 : emailSentAt + AUTH_EMAIL_COOLDOWN_SECONDS * 1000)
  const form = useAppForm({
    defaultValues: { email },
    // A server error must not block retrying once the cooldown ends; submit validators still check the address.
    canSubmitWhenInvalid: true,
    validators: {
      onSubmitAsync: async ({ value }) => cooldownFeedback(await requestVerificationEmail(value.email), cooldown),
    },
    onSubmit: () => setResent(true),
  })
  const formId = 'resend-verification-email'
  const emailValidator = z.email('Please enter a valid email address').trim()

  return (
    <Card className='p-6 shadow-xl sm:p-8'>
      <CardHeader className='text-center'>
        <CardTitle className='mb-2 text-2xl font-bold'>Check your email</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          If your account needs verification, check your inbox for a confirmation link. If it doesn't arrive within a
          few minutes, check your spam folder or request another one below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            form.handleSubmit()
          }}
        >
          <FieldSet>
            <FieldGroup className='gap-4'>
              <form.AppField
                name='email'
                validators={{ onBlur: emailValidator, onSubmit: emailValidator }}
                children={(field) => (
                  <field.AuthTextInput
                    label='Email Address'
                    placeholder='email@example.com'
                    type='email'
                    icon={<Mail />}
                  />
                )}
              />
              <form.AppForm>
                <form.FormErrorAlert />
              </form.AppForm>
              {resent && (
                <p aria-live='polite' className='text-sm text-muted-foreground'>
                  If this account needs verification, a new link is on its way.
                </p>
              )}
              <form.AppForm>
                <form.SubmitButton
                  text={
                    cooldown.remainingSeconds > 0
                      ? `Resend in ${formatWait(cooldown.remainingSeconds)}`
                      : 'Resend verification email'
                  }
                  formId={formId}
                  disabled={cooldown.remainingSeconds > 0}
                />
              </form.AppForm>
            </FieldGroup>
          </FieldSet>
        </form>
      </CardContent>
    </Card>
  )
}
