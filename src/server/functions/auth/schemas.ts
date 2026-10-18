import { z } from 'zod'

import { EmptyInputSchema } from '@/server/core/validation'

export const GetUserSessionInput = EmptyInputSchema

// Only what routing and navigation read; the Better Auth session, including its token, stays on the server.
export const UserSessionResponse = z
  .object({
    user: z.object({
      email: z.string(),
      emailVerified: z.boolean(),
      id: z.string(),
      image: z.string().nullish(),
      name: z.string(),
    }),
  })
  .nullable()
