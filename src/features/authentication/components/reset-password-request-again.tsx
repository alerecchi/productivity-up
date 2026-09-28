import { useAppForm } from '@shared/components/form'
import { Button } from '@shared/components/ui/button'
import { FieldGroup } from '@shared/components/ui/field'

import { formatWait } from '@/features/authentication/hooks/use-cooldown'
import type { Cooldown } from '@/features/authentication/hooks/use-cooldown'
import { cooldownFeedback, requestPasswordResetEmail } from '@/features/authentication/lib/auth-email-requests'

type ResetPasswordRequestAgainProps = {
  /** The address the previous reset link was requested for. */
  email: string
  cooldown: Cooldown
  onUseDifferentEmail: () => void
}

/** Requests another reset link for the same address, or returns to the request form to change it. */
export default function ResetPasswordRequestAgain({
  email,
  cooldown,
  onUseDifferentEmail,
}: ResetPasswordRequestAgainProps) {
  const form = useAppForm({
    // A server error must not block retrying once the cooldown ends.
    canSubmitWhenInvalid: true,
    validators: {
      onSubmitAsync: async () => cooldownFeedback(await requestPasswordResetEmail(email), cooldown),
    },
  })
  const formId = 'reset-password-request-again'

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <FieldGroup className='gap-4'>
        <form.AppForm>
          <form.FormErrorAlert />
        </form.AppForm>
        <form.AppForm>
          <form.SubmitButton
            text={
              cooldown.remainingSeconds > 0
                ? `Send another link in ${formatWait(cooldown.remainingSeconds)}`
                : 'Send another link'
            }
            formId={formId}
            disabled={cooldown.remainingSeconds > 0}
          />
        </form.AppForm>
        <Button className='cursor-pointer' onClick={onUseDifferentEmail} type='button' variant='ghost'>
          Use a different email
        </Button>
      </FieldGroup>
    </form>
  )
}
