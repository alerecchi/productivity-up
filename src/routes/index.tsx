import { Button } from '@shared/components/ui/button'
import { createFileRoute } from '@tanstack/react-router'

import { authClient } from '@/features/authentication/auth-client'
import { redirectIfAuthenticated } from '@/features/authentication/utils/redirects'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    redirectIfAuthenticated(context.user)
  },
  component: App,
})

function App() {
  return (
    <div>
      {/* <BucketList /> */}
      <Button
        onClick={() => {
          authClient.signOut()
        }}
      >
        Sign out
      </Button>
    </div>
  )
}
