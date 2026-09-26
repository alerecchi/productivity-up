import ResetPasswordChange from '@features/authentication/components/reset-password-change'
import ResetPasswordRequest from '@features/authentication/components/reset-password-request'
import { Button } from '@shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/components/ui/card'
import { useState } from 'react'
import type { ReactNode } from 'react'

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
  const [formSubmitted, setFormSubmitted] = useState(false)
  const { title, subtitle, content } = getCardContent(
    userEmail,
    emailVerified,
    formSubmitted,
    setFormSubmitted,
    token,
    tokenError,
  )

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

function getCardContent(
  userEmail: string,
  emailVerified: boolean,
  formSubmitted: boolean,
  setFormSubmitted: React.Dispatch<React.SetStateAction<boolean>>,
  token: string | undefined,
  tokenError: boolean,
): CardData {
  let cardTitle: string, cardSubtitle: string, cardContent: ReactNode
  if (!formSubmitted && !token) {
    cardTitle = 'Reset your password'
    cardSubtitle = "Enter your account's verified email address and we will send you a password reset link."
    cardContent = (
      <ResetPasswordRequest
        userEmail={userEmail}
        emailVerified={emailVerified}
        setFormSubmitted={setFormSubmitted}
        tokenError={tokenError}
      />
    )
  } else if (formSubmitted && !token) {
    // There should be no token when the form is submitted
    cardTitle = 'Password reset link sent!'
    cardSubtitle =
      "If this email exists in our system, check your email for the reset link. If it doesn't appear within a few minutes, check your spam folder."
    cardContent = (
      <Button className='w-full' onClick={() => setFormSubmitted(false)} type='button' variant='outline'>
        Request another reset link
      </Button>
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
