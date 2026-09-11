import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { createAuth } from '@/server/auth'
import { databaseMiddleware } from '@/server/middlewares/database-middleware'

export const getUserSession = createServerFn({ method: 'GET' })
  .middleware([databaseMiddleware])
  .handler(async ({ context }) => {
    const request = getRequest()
    return await createAuth(context.db).api.getSession({ headers: request.headers })
  })
