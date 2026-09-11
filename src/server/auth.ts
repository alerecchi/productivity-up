import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import type { Database } from '@/server/db/client'
import * as schema from '@/server/db/schema'
import { sendEmailConfirmation, sendResetPassword } from '@/server/email/sender'

export function createAuth(db: Database) {
  return betterAuth({
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
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        console.log('in auth')
        await sendEmailConfirmation({ to: user.email, userName: user.name, url: url })
      },
    },
    plugins: [tanstackStartCookies()],
  })
}
// TODO: from better auth docs: Avoid awaiting the email sending to prevent timing attacks. On serverless platforms, use waitUntil or similar to ensure the email is sent.
