import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { AUTH_USER_FIELDS, UserTimeZoneSchema } from '@/lib/auth-user-fields'
import { authorizeAccountOperation } from '@/server/auth-operation-access'
import { AUTH_RATE_LIMIT_RULES, createAuthRateLimitStorage, createNeonRateLimitCounter } from '@/server/auth/rate-limit'
import type { AuthRateLimitStorage } from '@/server/auth/rate-limit'
import { createBoardRepository } from '@/server/db/board-repository'
import type { Database } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { enqueueAuthEmail } from '@/server/email/queue'
import type { AuthEmailMessage } from '@/server/email/queue'
import { provisionInitialBoard } from '@/server/functions/board/lifecycle'

export type AuthRuntimeConfiguration = {
  baseUrl: string
  secret: string
}

export type AuthDependencies = {
  /** Better Auth persistence; production uses Drizzle over the invocation's database connection. */
  database: NonNullable<BetterAuthOptions['database']>
  /** Creates the initial board state for a newly created User. */
  provisionInitialBoard: (user: { id: string; timeZone: string }) => Promise<void>
  /** Rate-limit state shared by every Worker isolate. */
  rateLimitStorage: AuthRateLimitStorage
  /** Durably queues verification and password-reset email for delivery. */
  enqueueAuthEmail: (message: AuthEmailMessage) => Promise<void>
}

export type Auth = ReturnType<typeof buildAuth>

/** Creates the production Better Auth instance for one invocation's database connection. */
export function createAuth(
  db: Database,
  configuration: AuthRuntimeConfiguration = getRuntimeEnvironment().authentication,
) {
  return buildAuth(
    {
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
        usePlural: true,
      }),
      provisionInitialBoard: async ({ id, timeZone }) => {
        await provisionInitialBoard({
          repository: createBoardRepository(db),
          timeZone,
          userId: id,
        })
      },
      enqueueAuthEmail,
      rateLimitStorage: createAuthRateLimitStorage(createNeonRateLimitCounter(db)),
    },
    configuration,
  )
}

/** Creates a Better Auth instance from explicit dependencies. */
export function buildAuth(dependencies: AuthDependencies, configuration: AuthRuntimeConfiguration) {
  return betterAuth({
    baseURL: configuration.baseUrl,
    secret: configuration.secret,
    advanced: {
      database: {
        joins: true,
      },
      // Explicit so Better Auth never relaxes origin and CSRF checks based on the runtime environment.
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },
    database: dependencies.database,
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            try {
              await dependencies.provisionInitialBoard({
                id: user.id,
                timeZone: UserTimeZoneSchema.parse(user.timeZone),
              })
            } catch (error) {
              context?.context.logger.error('Failed to provision initial board after User creation', error)
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => {
        return dependencies.enqueueAuthEmail({ to: user.email, type: 'password-reset', url, userName: user.name })
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    user: {
      additionalFields: {
        timeZone: {
          ...AUTH_USER_FIELDS.timeZone,
          validator: {
            input: UserTimeZoneSchema,
          },
        },
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => {
        return dependencies.enqueueAuthEmail({ to: user.email, type: 'verification', url, userName: user.name })
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        const access = await authorizeAccountOperation(context.path, () =>
          getSessionFromCtx(context, { disableCookieCache: true }),
        )

        if (access === 'authentication-required') {
          throw new APIError('UNAUTHORIZED', {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          })
        }

        if (access === 'email-verification-required') {
          throw new APIError('FORBIDDEN', {
            code: 'EMAIL_VERIFICATION_REQUIRED',
            message: 'Email verification is required',
          })
        }
      }),
    },
    plugins: [tanstackStartCookies()],
    rateLimit: {
      customRules: AUTH_RATE_LIMIT_RULES,
      customStorage: dependencies.rateLimitStorage,
      enabled: true,
    },
  })
}
