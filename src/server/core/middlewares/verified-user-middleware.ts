import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { createAuth } from '@/server/auth'
import { authenticationRequired, emailVerificationRequired } from '@/server/core/errors'
import { databaseMiddleware } from '@/server/core/middlewares/database-middleware'
import type { Database } from '@/server/db/client'

export type VerifiedUser = {
  id: string
}

export type VerifiedUserMiddlewareDependencies = {
  getRequest: () => Request
  getSession: (db: Database, headers: Headers) => Promise<{ user?: { emailVerified: boolean; id: string } } | null>
}

const getDefaultDependencies = createServerOnlyFn(
  (): VerifiedUserMiddlewareDependencies => ({
    getRequest,
    getSession: async (db, headers) => createAuth(db).api.getSession({ headers }),
  }),
)

/** Rejects signed-out (401) and unverified (403) requests, and gives the operation the verified User. */
export function createRequireVerifiedUserMiddleware(providedDependencies?: VerifiedUserMiddlewareDependencies) {
  return createMiddleware({ type: 'function' })
    .middleware([databaseMiddleware])
    .server(async ({ context, next }) => {
      const dependencies = providedDependencies ?? getDefaultDependencies()
      const session = await dependencies.getSession(context.db, dependencies.getRequest().headers)

      if (!session?.user) {
        throw authenticationRequired()
      }

      if (!session.user.emailVerified) {
        throw emailVerificationRequired()
      }

      return next({ context: { user: { id: session.user.id } satisfies VerifiedUser } })
    })
}

export const requireVerifiedUserMiddleware = createRequireVerifiedUserMiddleware()
