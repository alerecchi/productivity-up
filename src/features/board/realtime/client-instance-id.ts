import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { CLIENT_INSTANCE_ID_HEADER } from '@/lib/realtime'

const clientInstanceIds = new WeakMap<QueryClient, string>()

/**
 * Identifies one running QueryClient as a realtime connection origin, so the server can skip hints for
 * changes that client already reconciled. It says nothing about the User.
 */
export function getClientInstanceId(queryClient: QueryClient) {
  let clientInstanceId = clientInstanceIds.get(queryClient)

  if (!clientInstanceId) {
    clientInstanceId = crypto.randomUUID()
    clientInstanceIds.set(queryClient, clientInstanceId)
  }

  return clientInstanceId
}

/** Request headers that name this QueryClient as a mutation's origin, so the realtime hints it causes skip it. */
export function useRealtimeOriginHeaders() {
  return { [CLIENT_INSTANCE_ID_HEADER]: getClientInstanceId(useQueryClient()) }
}
