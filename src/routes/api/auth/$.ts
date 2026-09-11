import { createFileRoute } from '@tanstack/react-router'

import { createAuth } from '@/server/auth'
import { withDatabase } from '@/server/db/client'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return await handleAuthRequest(request)
      },
      POST: async ({ request }) => {
        return await handleAuthRequest(request)
      },
    },
  },
})

function handleAuthRequest(request: Request) {
  return withDatabase((db) => createAuth(db).handler(request))
}
