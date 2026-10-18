import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { waitUntil } from 'cloudflare:workers'
import { z } from 'zod'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { CLIENT_INSTANCE_ID_HEADER } from '@/lib/realtime'
import type { RealtimeHint } from '@/lib/realtime'
import { requireVerifiedUserMiddleware } from '@/server/core/middlewares/verified-user-middleware'
import type { PublishOptions } from '@/server/realtime/user-realtime-durable-object'

export type RealtimeHintsMiddlewareDependencies = {
  getRequest: () => Request
  /** Delivers hints to the User's realtime connections without delaying the response; failures only lose hints. */
  publish: (userId: string, hints: Array<RealtimeHint>, options: PublishOptions) => void
}

export type RealtimeHintsMiddlewareOptions<TResult> = {
  /**
   * The realtime hints of a committed command, derived from its validated response. They are published as one list
   * only after the operation succeeds, and skip the requesting client, whose own response reconciles every hinted
   * scope. Declare hints only for commands whose response fully reconciles the requesting client's cache.
   */
  hints?: (result: TResult) => Array<RealtimeHint>
}

const ClientInstanceIdSchema = z.uuid()

const getDefaultDependencies = createServerOnlyFn(
  (): RealtimeHintsMiddlewareDependencies => ({
    getRequest,
    publish: (userId, hints, options) => {
      const delivery = getRuntimeEnvironment().realtime.userRealtime.getByName(userId).publish(hints, options)
      waitUntil(delivery.catch(() => undefined))
    },
  }),
)

/**
 * Publishes a successful command's hints to the verified User's other clients. It must wrap the response middleware,
 * so hints are derived from the validated response DTO.
 */
export function createRealtimeHintsMiddleware<TResult>(
  { hints }: RealtimeHintsMiddlewareOptions<TResult>,
  providedDependencies?: RealtimeHintsMiddlewareDependencies,
) {
  return createMiddleware({ type: 'function' })
    .middleware([requireVerifiedUserMiddleware])
    .server(async ({ context, next }) => {
      const result = await next()

      if (hints) {
        publishHints(providedDependencies ?? getDefaultDependencies(), context.user.id, () =>
          hints(Reflect.get(result, 'result') as TResult),
        )
      }

      return result
    })
}

function publishHints(
  dependencies: RealtimeHintsMiddlewareDependencies,
  userId: string,
  getHints: () => Array<RealtimeHint>,
) {
  try {
    // An unidentifiable origin only costs that client a redundant refetch.
    const originClientInstanceId = ClientInstanceIdSchema.safeParse(
      dependencies.getRequest().headers.get(CLIENT_INSTANCE_ID_HEADER),
    )

    dependencies.publish(userId, getHints(), {
      originClientInstanceId: originClientInstanceId.success ? originClientInstanceId.data : undefined,
    })
  } catch {
    // The command already committed; clients that miss the hint recover on their next resynchronization.
  }
}
