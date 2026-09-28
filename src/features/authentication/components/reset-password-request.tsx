import { useAppForm } from '@shared/components/form'
import { FieldGroup, FieldSet } from '@shared/components/ui/field'
import { Mail } from 'lucide-react'
import z from 'zod'

import { formatWait } from '@/features/authentication/hooks/use-cooldown'
import type { Cooldown } from '@/features/authentication/hooks/use-cooldown'
import { cooldownFeedback, requestPasswordResetEmail } from '@/features/authentication/lib/auth-email-requests'

type ResetPasswordRequestProps = {
  defaultEmail: string
  /** Shared with the request-again action, so both wait for the same accepted request or retry guidance. */
  cooldown: Cooldown
  onRequested: (email: string) => void
  tokenError: boolean
}

export default function ResetPasswordRequest({
  defaultEmail,
  cooldown,
  onRequested,
  tokenError,
}: ResetPasswordRequestProps) {
  const form = useAppForm({
    defaultValues: {
      email: defaultEmail,
    },
    // A server error must not block retrying once the cooldown ends; submit validators still check the address.
    canSubmitWhenInvalid: true,
    validators: {
      onSubmitAsync: async ({ value }) => cooldownFeedback(await requestPasswordResetEmail(value.email), cooldown),
    },
    onSubmit: ({ value }) => onRequested(value.email),
  })

  const formId = 'reset-password-request'
  const emailValidator = z.email('Please enter a valid email address').trim()

  if (tokenError) {
    form.setErrorMap({ onSubmit: { form: 'Your token is expired, please try again' } })
  }
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <FieldSet>
        <FieldGroup className='gap-4'>
          <form.AppField
            name='email'
            validators={{
              onBlur: emailValidator,
              onSubmit: emailValidator,
            }}
            children={(field) => (
              <field.AuthTextInput label='Email Address' placeholder='email@example.com' type='email' icon={<Mail />} />
            )}
          />
          <form.AppForm>
            <form.FormErrorAlert />
          </form.AppForm>
          <form.AppForm>
            <form.SubmitButton
              text={
                cooldown.remainingSeconds > 0
                  ? `Send password reset link in ${formatWait(cooldown.remainingSeconds)}`
                  : 'Send password reset link'
              }
              formId={formId}
              disabled={cooldown.remainingSeconds > 0}
            />
          </form.AppForm>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
