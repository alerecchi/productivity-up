import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useBoardCache } from '@/features/board/cache'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'
import { getBrowserTimeZone } from '@/lib/auth-user-fields'
import { reconcileLifecycle } from '@/server/functions/board'

export type ReconciledBoard = NonNullable<ReturnType<typeof useReconciledBoard>['board']>

/**
 * Reads the board and runs Lifecycle Reconciliation whenever the server reports it is required.
 * `board` is `null` until the reconciled board has been read back.
 */
export function useReconciledBoard() {
  const { data } = useSuspenseQuery(getBoardQueryOptions)
  const cache = useBoardCache()
  const { isError, isPending, mutate } = useMutation({
    mutationFn: () => reconcileLifecycle({ data: { timeZone: getBrowserTimeZone() } }),
    onError: (error) => {
      void cache.recover(error, { type: 'board' })
    },
    onSuccess: async (board) => {
      await cache.apply({ board, type: 'lifecycle-committed' })
    },
  })
  const isInitializing = data.status === 'initialization_required'
  const isReconciliationRequired = isInitializing || data.status === 'reconciliation_required'

  useEffect(() => {
    if (isReconciliationRequired && !isPending && !isError) {
      mutate()
    }
  }, [isError, isPending, isReconciliationRequired, mutate])

  return {
    board: isReconciliationRequired ? null : data,
    reconciliation: { isFailed: isError, isInitializing, retry: () => mutate() },
  }
}
