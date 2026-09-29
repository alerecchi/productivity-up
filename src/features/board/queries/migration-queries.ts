import { queryOptions } from '@tanstack/react-query'

import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import { getMigrationStep } from '@/server/functions/board'

export const getMigrationStepQueryOptions = (sourceBucketId: number) =>
  queryOptions({
    queryKey: boardCacheKeys.migrationStep(sourceBucketId),
    queryFn: () => getMigrationStep({ data: { sourceBucketId } }),
  })
