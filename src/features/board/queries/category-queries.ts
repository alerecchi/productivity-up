import { queryOptions } from '@tanstack/react-query'

import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import { listCategories } from '@/server/functions/categories'

export const getCategoriesQueryOptions = queryOptions({
  queryKey: boardCacheKeys.categories(),
  queryFn: () => listCategories(),
})
