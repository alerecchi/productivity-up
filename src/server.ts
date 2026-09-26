import handler from '@tanstack/react-start/server-entry'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { handleAuthEmailBatch } from '@/server/email/queue'
import type { AuthEmailBatch } from '@/server/email/queue'
import { REALTIME_PATH, createRealtimeGatewayDependencies, handleRealtimeRequest } from '@/server/realtime/gateway'

export { UserRealtimeDurableObject } from '@/server/realtime/user-realtime-durable-object'

export default {
  async fetch(request: Request) {
    const environment = getRuntimeEnvironment()

    // Handled before TanStack Start so the Durable Object's WebSocket upgrade response reaches the client as-is.
    if (new URL(request.url).pathname === REALTIME_PATH) {
      return await handleRealtimeRequest(request, createRealtimeGatewayDependencies(environment))
    }

    return await handler.fetch(request)
  },
  queue(batch: AuthEmailBatch) {
    getRuntimeEnvironment()
    return handleAuthEmailBatch(batch)
  },
}
