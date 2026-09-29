import { useAppForm } from '@shared/components/form'
import { FieldGroup, FieldSet } from '@shared/components/ui/field'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Mail } from 'lucide-react'
import z from 'zod'

import { authClient } from '@/features/authentication/auth-client'
import { userSessionQuery } from '@/features/authentication/queries/user-session'

// TODO: extract logic
export default function Login() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { mutateAsync: signInMutation } = useMutation({
    mutationKey: userSessionQuery.key,
    mutationFn: async (data: { email: string; password: string }) =>
      await authClient.signIn.email({
        email: data.email,
        password: data.password,
      }),
    onSuccess: () => {
      // TODO: see if I need this considering that I'm already saying that the auth cache changes (maybe that already triggers enough refreshes)
      queryClient.resetQueries()
    },
  })

  // TODO: Block disposable (“throwaway”) email providers (e.g. mailinator.com, 10minutemail.com).
  const form = useAppForm({
    defaultValues: {
      email: '',
      password: '',
    },
    /* A weird behavior from Tanstack Form on how to manage errors from the server (e.g. user already exist) is
    to check them in a validator instead of in the onSubmit function. The onSubmit then becames just the happy 
    path https://github.com/TanStack/form/discussions/623  */
    validators: {
      onSubmitAsync: async ({ value: data }) => {
        const result = await signInMutation(data)
        console.log(result)
        if (result.error) {
          if (result.error.code === 'INVALID_EMAIL_OR_PASSWORD') {
            return { form: 'Invalid Email or Password' }
          } else if (result.error.code === 'EMAIL_NOT_VERIFIED') {
            // Since I have the page I'm using it, also a simple error would have been enough
            // Signing in to an unverified account sends a new verification email.
            throw navigate({
              to: '/email-confirmation',
              state: { verificationEmail: data.email, verificationEmailSentAt: Date.now() },
            })
          }
          return { form: 'There was a problem with your login, please refresh the page and try again' }
        }
        return undefined // Everything went well and the user is logged in
      },
    },
    onSubmit: () => {
      navigate({ to: '/board' })
      // TODO: navigate based on redirect param
    },
  })

  const formId = 'login-form'

  // TODO: extract validators (maybe when moving to feature based arch)
  const emailValidator = z.email('Please enter a valid email address').trim()
  const passwordValidator = z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters')

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
          <form.AppField
            name='password'
            validators={{
              onBlur: passwordValidator,
              onSubmit: passwordValidator,
            }}
            children={(field) => <field.PasswordInput label='Password' forgotLink />}
          />
          <form.AppForm>
            <form.FormErrorAlert />
          </form.AppForm>
          <form.AppForm>
            <form.SubmitButton text='Login' formId={formId} />
          </form.AppForm>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
