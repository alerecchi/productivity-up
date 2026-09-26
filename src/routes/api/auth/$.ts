import { createFileRoute } from '@tanstack/react-router'

import { createAuth, handleAuthRequest } from '@/server/auth'
import { withDatabase } from '@/server/db/client'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return await withDatabase((db) => handleAuthRequest(request, createAuth(db)))
      },
      POST: async ({ request }) => {
        return await withDatabase((db) => handleAuthRequest(request, createAuth(db)))
      },
    },
  },
})
