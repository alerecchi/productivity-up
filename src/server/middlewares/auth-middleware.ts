import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { createAuth } from '@/server/auth'
import { databaseMiddleware } from '@/server/middlewares/database-middleware'

export const authRequiredMiddleware = createMiddleware({ type: 'function' })
  .middleware([databaseMiddleware])
  .server(async ({ context, next }) => {
    const request = getRequest()
    const session = await createAuth(context.db).api.getSession({ headers: request.headers })
    if (!session?.user) {
      throw new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return next({ context: { db: context.db, session } })
  })
