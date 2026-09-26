import type { QueryClient } from '@tanstack/react-query'

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
