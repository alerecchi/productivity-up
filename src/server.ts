import handler from '@tanstack/react-start/server-entry'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { REALTIME_PATH, createRealtimeGatewayDependencies, handleRealtimeRequest } from '@/server/realtime/gateway'

export { UserRealtimeDurableObject } from '@/server/realtime/user-realtime-durable-object'

type QueueBatch = {
  retryAll: () => void
}

export default {
  async fetch(request: Request) {
    const environment = getRuntimeEnvironment()

    // Handled before TanStack Start so the Durable Object's WebSocket upgrade response reaches the client as-is.
    if (new URL(request.url).pathname === REALTIME_PATH) {
      return await handleRealtimeRequest(request, createRealtimeGatewayDependencies(environment))
    }

    return await handler.fetch(request)
  },
  queue(batch: QueueBatch) {
    getRuntimeEnvironment()
    batch.retryAll()
  },
}
