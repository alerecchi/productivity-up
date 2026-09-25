import { queryOptions } from '@tanstack/react-query'

import { BOARD_QUERY_KEY, BUCKETS_QUERY_KEY, TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import { getBoard, getBuckets } from '@/server/functions/board'
import { getTodos } from '@/server/functions/todos'

export const getBoardQueryOptions = queryOptions({
  queryKey: [BOARD_QUERY_KEY],
  queryFn: () => getBoard(),
})

export const getBucketsQueryOptions = queryOptions({
  queryKey: [BUCKETS_QUERY_KEY],
  queryFn: () => getBuckets(),
})

export const getTodosQueryOptions = (bucketId: number) =>
  queryOptions({
    queryKey: [TODOS_QUERY_KEY, bucketId],
    queryFn: () => getTodos({ data: { bucketId: bucketId } }),
  })
