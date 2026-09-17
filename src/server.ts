import handler from '@tanstack/react-start/server-entry'

import { parseCloudflareRuntimeEnvironment } from '@/config/runtime-environment'

export { UserRealtimeDurableObject } from '@/server/realtime/user-realtime-durable-object'

type QueueBatch = {
  retryAll: () => void
}

export default {
  async fetch(request: Request, environment: Cloudflare.Env) {
    parseCloudflareRuntimeEnvironment(environment)
    return await handler.fetch(request)
  },
  queue(batch: QueueBatch, environment: Cloudflare.Env) {
    parseCloudflareRuntimeEnvironment(environment)
    batch.retryAll()
  },
}
