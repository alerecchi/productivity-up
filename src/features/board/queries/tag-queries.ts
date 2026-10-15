import { queryOptions } from '@tanstack/react-query'

import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import { listTags } from '@/server/functions/tags'

export const getTagsQueryOptions = queryOptions({
  queryKey: boardCacheKeys.tags(),
  queryFn: () => listTags(),
})
