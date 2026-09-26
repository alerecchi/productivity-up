import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import EmailConfirmation from '@/features/authentication/components/email-confirmation'
import ResetPasswordContainer from '@/features/authentication/components/reset-password-container'
import { EMAIL_VERIFICATION_CALLBACK_PATH } from '@/features/authentication/utils/verification'

const { requestPasswordReset, sendVerificationEmail } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  sendVerificationEmail: vi.fn(),
}))

vi.mock('@/features/authentication/auth-client', () => ({
  authClient: { requestPasswordReset, sendVerificationEmail },
}))

beforeEach(() => {
  requestPasswordReset.mockResolvedValue({ error: null })
  sendVerificationEmail.mockResolvedValue({ error: null })
})

describe('authentication email resend paths', () => {
  it('lets a user request another verification link', async () => {
    render(<EmailConfirmation />)

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send another verification link' }))

    await waitFor(() =>
      expect(sendVerificationEmail).toHaveBeenCalledWith({
        callbackURL: EMAIL_VERIFICATION_CALLBACK_PATH,
        email: 'person@example.test',
      }),
    )
    expect(await screen.findByText(/If this account needs verification, a new link is on its way/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send another verification link' }))
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledTimes(2))
  })

  it('returns to the password-reset request form after a successful request', async () => {
    render(<ResetPasswordContainer tokenError={false} />)

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send password reset link' }))

    expect(await screen.findByRole('button', { name: 'Request another reset link' })).toBeInTheDocument()
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'person@example.test',
      redirectTo: '/reset-password',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Request another reset link' }))
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send password reset link' }))
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledTimes(2))
  })
})
