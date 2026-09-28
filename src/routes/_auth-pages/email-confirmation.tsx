import EmailConfirmation from '@features/authentication/components/email-confirmation'
import { createFileRoute, redirect, useRouterState } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth-pages/email-confirmation')({
  beforeLoad: ({ context }) => {
    if (context.user?.emailVerified) {
      throw redirect({ to: '/board' })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { verificationEmail, verificationEmailSentAt } = useRouterState({ select: (state) => state.location.state })
  return <EmailConfirmation email={verificationEmail} emailSentAt={verificationEmailSentAt} />
}
