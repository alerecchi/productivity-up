import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { createBoardCache } from '@/features/board/cache'
import { getClientInstanceId } from '@/features/board/realtime/client-instance-id'
import { createRealtimeConnection } from '@/features/board/realtime/realtime-connection'
import { REALTIME_PATH } from '@/lib/realtime'

/**
 * Keeps the verified User's realtime connection open for the app's QueryClient. Pass `undefined` while
 * signed out or unverified. Any later session resynchronizes, because the cache may hold another session's state.
 */
export function RealtimeSync({ userId }: { userId: string | undefined }) {
  const queryClient = useQueryClient()
  const hasConnectedRef = useRef(false)

  useEffect(() => {
    if (!userId) {
      return
    }

    const cache = createBoardCache(queryClient)
    const connection = createRealtimeConnection({
      cache,
      clientInstanceId: getClientInstanceId(queryClient),
      url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${REALTIME_PATH}`,
    })

    if (hasConnectedRef.current) {
      void cache.sync({ type: 'all' })
    }

    hasConnectedRef.current = true
    connection.start()

    return () => connection.stop()
  }, [queryClient, userId])

  return null
}
