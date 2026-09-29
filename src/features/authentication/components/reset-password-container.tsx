import ResetPasswordChange from '@features/authentication/components/reset-password-change'
import ResetPasswordRequest from '@features/authentication/components/reset-password-request'
import ResetPasswordRequestAgain from '@features/authentication/components/reset-password-request-again'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { useCooldown } from '@/features/authentication/hooks/use-cooldown'
import type { Cooldown } from '@/features/authentication/hooks/use-cooldown'

type ResetPasswordRequestProps = {
  userEmail?: string
  emailVerified?: boolean
  token?: string
  tokenError: boolean
}
// TODO: extract logic?
export default function ResetPasswordContainer({
  userEmail = '',
  emailVerified = false,
  token,
  tokenError,
}: ResetPasswordRequestProps) {
  // The address of the last accepted request; also prefills the form when the user wants to change it.
  const [requestedEmail, setRequestedEmail] = useState<string>()
  const [showRequestForm, setShowRequestForm] = useState(true)
  const cooldown = useCooldown()
  const { title, subtitle, content } = getCardContent({
    cooldown,
    defaultEmail: requestedEmail ?? (emailVerified ? userEmail : ''),
    onRequested: (email) => {
      setRequestedEmail(email)
      setShowRequestForm(false)
    },
    onUseDifferentEmail: () => setShowRequestForm(true),
    requestedEmail: showRequestForm ? undefined : requestedEmail,
    token,
    tokenError,
  })

  return (
    <Card className='p-6 shadow-xl sm:p-8'>
      <CardHeader className='text-center'>
        <CardTitle className='mb-2 text-2xl font-bold'>{title}</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>{subtitle} </CardDescription>
      </CardHeader>
      {content && <CardContent>{content}</CardContent>}
    </Card>
  )
}

type CardData = {
  title: string
  subtitle: string
  content: ReactNode | null
}

type CardState = {
  cooldown: Cooldown
  defaultEmail: string
  onRequested: (email: string) => void
  onUseDifferentEmail: () => void
  /** Set while the request-again view is shown. */
  requestedEmail: string | undefined
  token: string | undefined
  tokenError: boolean
}

function getCardContent({
  cooldown,
  defaultEmail,
  onRequested,
  onUseDifferentEmail,
  requestedEmail,
  token,
  tokenError,
}: CardState): CardData {
  let cardTitle: string, cardSubtitle: string, cardContent: ReactNode
  if (requestedEmail === undefined && !token) {
    cardTitle = 'Reset your password'
    cardSubtitle = "Enter your account's verified email address and we will send you a password reset link."
    cardContent = (
      <ResetPasswordRequest
        cooldown={cooldown}
        defaultEmail={defaultEmail}
        onRequested={onRequested}
        tokenError={tokenError}
      />
    )
  } else if (requestedEmail !== undefined && !token) {
    // There should be no token when the form is submitted
    cardTitle = 'Password reset link sent!'
    cardSubtitle =
      "If this email exists in our system, check your email for the reset link. If it doesn't appear within a few minutes, check your spam folder."
    cardContent = (
      <ResetPasswordRequestAgain cooldown={cooldown} email={requestedEmail} onUseDifferentEmail={onUseDifferentEmail} />
    )
  } else if (token) {
    cardTitle = 'Change your password'
    cardSubtitle = 'Please enter your new password to regain access to your account'
    cardContent = <ResetPasswordChange token={token} />
  } else {
    throw Error('Inconsistent state in password reset')
  }

  return { title: cardTitle, subtitle: cardSubtitle, content: cardContent }
}
