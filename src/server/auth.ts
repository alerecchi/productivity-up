import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { AUTH_USER_FIELDS, UserTimeZoneSchema } from '@/lib/auth-user-fields'
import { createBoardRepository } from '@/server/db/board-repository'
import type { Database } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { sendEmailConfirmation, sendResetPassword } from '@/server/email/sender'
import { provisionInitialBoard } from '@/server/functions/board/operations'

export type AuthRuntimeConfiguration = {
  baseUrl: string
  secret: string
}

export function createAuth(
  db: Database,
  configuration: AuthRuntimeConfiguration = getRuntimeEnvironment().authentication,
) {
  const provisionBoardForUser = async (user: { id: string } & Record<string, unknown>) => {
    const timeZone = UserTimeZoneSchema.parse(user.timeZone)

    await provisionInitialBoard({
      repository: createBoardRepository(db),
      timeZone,
      userId: user.id,
    })
  }

  return betterAuth({
    baseURL: configuration.baseUrl,
    secret: configuration.secret,
    advanced: {
      database: {
        joins: true,
      },
    },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      usePlural: true,
    }),
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            try {
              await provisionBoardForUser(user)
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
      sendResetPassword: async ({ user, url }) => {
        await sendResetPassword({
          to: user.email,
          userName: user.name,
          url,
        })
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 15 * 60, // cache for 5 minutes
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
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmailConfirmation({ to: user.email, userName: user.name, url })
      },
    },
    plugins: [tanstackStartCookies()],
  })
}
// TODO: from better auth docs: Avoid awaiting the email sending to prevent timing attacks. On serverless platforms, use waitUntil or similar to ensure the email is sent.
