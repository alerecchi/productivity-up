import { queryOptions } from '@tanstack/react-query'

import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import { getBoard } from '@/server/functions/board'
import { getTodos } from '@/server/functions/todos'

export const getBoardQueryOptions = queryOptions({
  queryKey: boardCacheKeys.board(),
  queryFn: () => getBoard(),
})

export const getTodosQueryOptions = (bucketId: number) =>
  queryOptions({
    queryKey: boardCacheKeys.todos(bucketId),
    queryFn: () => getTodos({ data: { bucketId: bucketId } }),
  })
