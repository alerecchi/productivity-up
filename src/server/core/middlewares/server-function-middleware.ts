import { createMiddleware } from '@tanstack/react-start'
import type { z } from 'zod'

import { databaseMiddleware } from '@/server/core/middlewares/database-middleware'
import { createOperationRecordMiddleware } from '@/server/core/middlewares/operation-record-middleware'
import { createRealtimeHintsMiddleware } from '@/server/core/middlewares/realtime-hints-middleware'
import type { RealtimeHintsMiddlewareOptions } from '@/server/core/middlewares/realtime-hints-middleware'
import { createResponseMiddleware } from '@/server/core/middlewares/response-middleware'
import { requireVerifiedUserMiddleware } from '@/server/core/middlewares/verified-user-middleware'

// Every server function uses exactly one of these presets. Each one fixes the order of its parts: the operation record
// wraps everything so every failure is mapped and recorded, and the response DTO is parsed closest to the handler.

type OperationOptions<TResponse extends z.ZodType> = {
  /** The stable operation name reported in the completion record. */
  operation: string
  response: TResponse
}

/**
 * For a server function anyone may call, signed in or not: the backend contract (request ID, standard error DTO,
 * one completion record), a database connection, and the response DTO.
 */
export function createPublicMiddleware<TResponse extends z.ZodType>({
  operation,
  response,
}: OperationOptions<TResponse>) {
  return createMiddleware({ type: 'function' }).middleware([
    createOperationRecordMiddleware({ operation }),
    databaseMiddleware,
    createResponseMiddleware({ response }),
  ])
}

/**
 * For a private product-data server function: everything `createPublicMiddleware` provides, plus a signed-in,
 * email-verified User in context and the command's realtime hints.
 */
export function createVerifiedUserMiddleware<TResponse extends z.ZodType>({
  hints,
  operation,
  response,
}: OperationOptions<TResponse> & RealtimeHintsMiddlewareOptions<z.output<TResponse>>) {
  return createMiddleware({ type: 'function' }).middleware([
    createOperationRecordMiddleware({ operation }),
    requireVerifiedUserMiddleware,
    createRealtimeHintsMiddleware({ hints }),
    createResponseMiddleware({ response }),
  ])
}
