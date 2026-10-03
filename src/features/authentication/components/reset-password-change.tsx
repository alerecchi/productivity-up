import { useAppForm } from '@shared/components/form'
import { FieldGroup, FieldSet } from '@shared/components/ui/field'
import { useNavigate } from '@tanstack/react-router'
import z from 'zod'

import { authClient } from '@/features/authentication/auth-client'

type ResetPasswordChangeProps = {
  token: string
}

// TODO: extract logic?
export default function ResetPasswordChange({ token }: ResetPasswordChangeProps) {
  const navigate = useNavigate()
  const form = useAppForm({
    defaultValues: {
      password: '',
      confirm_password: '',
    },
    validators: {
      onSubmitAsync: async ({ value: data }) => {
        const response = await authClient.resetPassword({
          newPassword: data.password,
          token: token,
        })
        if (response.error) {
          return { form: 'There was a problem with changing your password, please refresh the page and try again' }
        }
        return undefined
      },
    },
    onSubmit: () => {
      navigate({ to: '/login' })
    },
  })

  const formId = 'reset-password-change'

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
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <FieldSet>
        <FieldGroup className='gap-4'>
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
            <form.SubmitButton text='Change password' formId={formId} />
          </form.AppForm>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}
