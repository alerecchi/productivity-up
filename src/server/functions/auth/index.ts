import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import type { z } from 'zod'

import { createAuth } from '@/server/auth'
import { createPublicMiddleware, validateInput } from '@/server/core'
import { GetUserSessionInput, UserSessionResponse } from '@/server/functions/auth/schemas'

export const getUserSession = createServerFn({ method: 'GET' })
  .middleware([createPublicMiddleware({ operation: 'auth.getSession', response: UserSessionResponse })])
  .validator(validateInput(GetUserSessionInput))
  .handler(async ({ context }): Promise<z.output<typeof UserSessionResponse>> => {
    return await createAuth(context.db).api.getSession({ headers: getRequest().headers })
  })
