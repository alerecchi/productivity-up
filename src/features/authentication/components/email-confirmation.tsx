import { useAppForm } from '@shared/components/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card'
import { FieldGroup, FieldSet } from '@shared/components/ui/field'
import { Mail } from 'lucide-react'
import { useState } from 'react'
import z from 'zod'

import { authClient } from '@/features/authentication/auth-client'
import { EMAIL_VERIFICATION_CALLBACK_PATH } from '@/features/authentication/utils/verification'

export default function EmailConfirmation() {
  const [requested, setRequested] = useState(false)
  const form = useAppForm({
    defaultValues: { email: '' },
    validators: {
      onSubmitAsync: async ({ value }) => {
        const response = await authClient.sendVerificationEmail({
          callbackURL: EMAIL_VERIFICATION_CALLBACK_PATH,
          email: value.email,
        })
        if (response.error) {
          return { form: 'We could not process your request. Please try again.' }
        }
        return undefined
      },
    },
    onSubmit: () => setRequested(true),
  })
  const formId = 'resend-verification-email'
  const emailValidator = z.email('Please enter a valid email address').trim()

  return (
    <Card className='p-6 shadow-xl sm:p-8'>
      <CardHeader className='text-center'>
        <CardTitle className='mb-2 text-2xl font-bold'>Check your email</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          If your account needs verification, check your inbox for a confirmation link. If it does not arrive, request
          another one below.
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
              {requested && (
                <p aria-live='polite' className='text-sm text-muted-foreground'>
                  If this account needs verification, a new link is on its way. You can request another link here.
                </p>
              )}
              <form.AppForm>
                <form.SubmitButton text='Send another verification link' formId={formId} />
              </form.AppForm>
            </FieldGroup>
          </FieldSet>
        </form>
      </CardContent>
    </Card>
  )
}
