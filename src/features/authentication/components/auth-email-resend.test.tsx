import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import EmailConfirmation from '@/features/authentication/components/email-confirmation'
import ResetPasswordContainer from '@/features/authentication/components/reset-password-container'
import { EMAIL_VERIFICATION_CALLBACK_PATH } from '@/features/authentication/utils/verification'
import { render } from '@/test'

// Better Auth's client captures `fetch` and the server URL when its module loads.
const fetchMock = vi.hoisted(() => {
  vi.stubEnv('VITE_APP_NAME', 'Productivity Up')
  vi.stubEnv('VITE_SERVER_URL', 'http://localhost:3000')
  const mock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', mock)
  return mock
})

const SEND_VERIFICATION_URL = 'http://localhost:3000/api/auth/send-verification-email'
const REQUEST_PASSWORD_RESET_URL = 'http://localhost:3000/api/auth/request-password-reset'

type Handler = (body: unknown) => Response

/** Answers POSTs to `url` through the global fetch and records their JSON bodies. */
function interceptAuthEmailRequests(url: string, respond: Handler = () => Response.json({ status: true })) {
  const bodies: Array<unknown> = []
  fetchMock.mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    if (request.method !== 'POST' || request.url !== url) {
      return new Response(null, { status: 404 })
    }

    const body: unknown = await request.json()
    bodies.push(body)
    return respond(body)
  })
  return bodies
}

function rateLimited(retryAfterSeconds: number) {
  return Response.json(
    { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }, requestId: 'request-1' },
    { headers: { 'Retry-After': String(retryAfterSeconds) }, status: 429 },
  )
}

async function advanceSeconds(seconds: number) {
  await act(() => vi.advanceTimersByTimeAsync(seconds * 1000))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('verification email resend', () => {
  it('reuses the address from the initial send and waits a minute before allowing a resend', async () => {
    render(<EmailConfirmation email='person@example.test' emailSentAt={Date.now()} />)

    expect(screen.getByLabelText('Email Address')).toHaveValue('person@example.test')
    expect(screen.getByRole('button', { name: 'Resend in 1:00' })).toBeDisabled()

    await advanceSeconds(60)

    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled()
  })

  it('requests another link with generic feedback and starts the cooldown', async () => {
    const bodies = interceptAuthEmailRequests(SEND_VERIFICATION_URL)
    render(<EmailConfirmation />)

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))

    expect(await screen.findByText(/If this account needs verification, a new link is on its way/)).toBeInTheDocument()
    expect(bodies).toEqual([{ callbackURL: EMAIL_VERIFICATION_CALLBACK_PATH, email: 'person@example.test' }])
    expect(screen.getByRole('button', { name: /^Resend in 1:00|^Resend in 0:59/ })).toBeDisabled()

    await advanceSeconds(60)
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))

    await waitFor(() => expect(bodies).toHaveLength(2))
  })

  it('waits for the server retry guidance when it is longer than the cooldown', async () => {
    interceptAuthEmailRequests(SEND_VERIFICATION_URL, () => rateLimited(300))
    render(<EmailConfirmation />)

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))

    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Resend in (5:00|4:59)$/ })).toBeDisabled()

    await advanceSeconds(240)
    expect(screen.getByRole('button', { name: /^Resend in (1:00|0:59)$/ })).toBeDisabled()

    await advanceSeconds(60)
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled()
  })

  it('shows a safe error when the request fails', async () => {
    interceptAuthEmailRequests(SEND_VERIFICATION_URL, () =>
      Response.json({ error: { code: 'INTERNAL_ERROR' }, requestId: 'request-1' }, { status: 500 }),
    )
    render(<EmailConfirmation />)

    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))

    expect(await screen.findByText('We could not send the email. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled()
  })
})

describe('password reset request again', () => {
  async function requestResetLink() {
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send password reset link' }))
    await screen.findByText('Password reset link sent!')
  }

  it('sends another link to the same address after the cooldown', async () => {
    const bodies = interceptAuthEmailRequests(REQUEST_PASSWORD_RESET_URL)
    render(<ResetPasswordContainer tokenError={false} />)

    await requestResetLink()

    expect(screen.getByRole('button', { name: /^Send another link in (1:00|0:59)$/ })).toBeDisabled()

    await advanceSeconds(60)
    fireEvent.click(screen.getByRole('button', { name: 'Send another link' }))

    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual({ email: 'person@example.test', redirectTo: '/reset-password' })
    expect(await screen.findByRole('button', { name: /^Send another link in (1:00|0:59)$/ })).toBeDisabled()
  })

  it('waits for the server retry guidance after a throttled request again', async () => {
    let requests = 0
    interceptAuthEmailRequests(REQUEST_PASSWORD_RESET_URL, () => {
      requests += 1
      return requests === 1 ? Response.json({ status: true }) : rateLimited(600)
    })
    render(<ResetPasswordContainer tokenError={false} />)

    await requestResetLink()
    await advanceSeconds(60)
    fireEvent.click(screen.getByRole('button', { name: 'Send another link' }))

    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Send another link in (10:00|9:59)$/ })).toBeDisabled()
  })

  it('returns to the form with the entered address to use a different one', async () => {
    interceptAuthEmailRequests(REQUEST_PASSWORD_RESET_URL)
    render(<ResetPasswordContainer tokenError={false} />)

    await requestResetLink()
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))

    expect(screen.getByLabelText('Email Address')).toHaveValue('person@example.test')
    expect(screen.getByRole('button', { name: /^Send password reset link in (1:00|0:59)$/ })).toBeDisabled()
  })
})
