import { useAppForm } from '@shared/components/form'
import { FieldGroup, FieldSet } from '@shared/components/ui/field'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Mail, User } from 'lucide-react'
import z from 'zod'

import { authClient } from '@/features/authentication/auth-client'
import { userSessionQuery } from '@/features/authentication/queries/user-session'
import { EMAIL_VERIFICATION_CALLBACK_PATH } from '@/features/authentication/utils/verification'

type RegistrationInput = {
  name: string
  email: string
  password: string
}

// TODO: extract this somewhere else or simplify if it's only used here
// Customize the libraries error (including multi-language): https://better-auth.com/docs/concepts/client#error-codes
export type AuthErrorTypes = Partial<
  Record<
    keyof typeof authClient.$ERROR_CODES,
    {
      message: string
      field: string
    }
  >
>
// TODO: extract this somewhere else
const signupErrorTypes = {
  USER_ALREADY_EXISTS: {
    message: 'User already exists',
    field: 'email',
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    message: 'Email already exists',
    field: 'email',
  },
  PASSWORD_TOO_LONG: {
    message: 'Password is too long',
    field: 'password',
  },
  PASSWORD_TOO_SHORT: {
    message: 'Password is too short',
    field: 'password',
  },
} satisfies AuthErrorTypes

// TODO: extract this somewhere else
export function getBetterAuthErrorMessage(
  code: string | undefined,
  authErrorMessages: AuthErrorTypes,
  defaultMessage: string,
) {
  const error = authErrorMessages[code as keyof typeof authErrorMessages]
  if (error) {
    return {
      fields: {
        [error.field]: error.message,
      },
    }
  }
  return { form: defaultMessage }
}

export function SignUpForm() {
  const router = useRouter()

  /* TODO: evaluate this: I'm keeping this mutation for now because it automatically
    says to the cache that I'm changing this key, but I could technically clear the 
    cache manually as well in the onSubmit (and save the extra indirection). It would
    make more sense if there was some extra logic */
  // TODO: do I need a manual resetQueries like in the login form?
  const { mutateAsync: registerMutation } = useMutation({
    mutationKey: userSessionQuery.key,
    mutationFn: async (data: RegistrationInput) =>
      await authClient.signUp.email({
        ...data,
        callbackURL: EMAIL_VERIFICATION_CALLBACK_PATH,
      }),
  })

  const form = useAppForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirm_password: '',
    },
    /* A weird behavior from Tanstack Form on how to manage errors from the server (e.g. user already exist) is
    to check them in a validator instead of in the onSubmit function. The onSubmit then becames just the happy 
    path https://github.com/TanStack/form/discussions/623  */
    validators: {
      onSubmitAsync: async ({ value: data }) => {
        const result = await registerMutation({ name: data.name, email: data.email, password: data.password })
        if (result.error) {
          return getBetterAuthErrorMessage(
            result.error.code,
            signupErrorTypes,
            'There was a problem with your account creation, please refresh the page and try again',
          )
        }
        return undefined // Everything went well and the user is registered
      },
    },
    onSubmit: () => {
      router.navigate({ to: '/email-confirmation', search: { from: 'signup' } })
    },
  })
  const formId = 'sign-up-form'

  const nameValidator = z.string().min(1, 'Name is required')
  const emailValidator = z.email('Please enter a valid email address').trim()
  const passwordValidator = z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters')
  const confirmPasswordValidator = ({ value, fieldApi }: { value: string; fieldApi: any }) => {
    const password = fieldApi.form.getFieldValue('password')
    if (value !== password) {
      return 'Passwords do not match'
    }
    return undefined
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldSet>
        <FieldGroup className='gap-4'>
          <form.AppField
            name='name'
            validators={{
              onBlur: nameValidator,
              onSubmit: nameValidator,
            }}
            children={(field) => (
              <field.AuthTextInput label='Name' placeholder='John Doe' type='text' icon={<User />} />
            )}
          />
          <form.AppField
            name='email'
            validators={{
              onBlur: emailValidator,
              onSubmit: emailValidator,
            }}
            children={(field) => (
              <field.AuthTextInput label='Email Address' placeholder='name@example.com' type='email' icon={<Mail />} />
            )}
          />
          <form.AppField
            name='password'
            validators={{
              onBlur: passwordValidator,
              onSubmit: passwordValidator,
            }}
            children={(field) => <field.PasswordInput label='Password' />}
          />
          <form.AppField
            name='confirm_password'
            validators={{
              onBlur: confirmPasswordValidator,
              onSubmit: confirmPasswordValidator,
              onChangeListenTo: ['password'],
              onChange: confirmPasswordValidator,
            }}
            children={(field) => <field.PasswordInput label='Confirm Your Password' />}
          />
          <form.AppForm>
            <form.FormErrorAlert />
          </form.AppForm>
          <form.AppForm>
            <form.SubmitButton text='Create Account' formId={formId} />
          </form.AppForm>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
