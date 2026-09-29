import type { QueryClient } from '@tanstack/react-query'

import { getClientInstanceId } from '@/features/board/realtime'

/** The headers a mutation must send so the server can skip realtime hints for the QueryClient that made it. */
export function realtimeOriginHeaders(queryClient: QueryClient) {
  return { 'X-Client-Instance-Id': getClientInstanceId(queryClient) }
}
