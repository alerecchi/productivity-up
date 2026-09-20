import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'

// Compatibility exports for callers migrated by issues #96 through #98.
export const BOARD_QUERY_KEY = boardCacheKeys.board()[0]
export const BUCKETS_QUERY_KEY = boardCacheKeys.buckets()[0]
export const CATEGORIES_QUERY_KEY = boardCacheKeys.categories()[0]
export const MIGRATION_STEP_QUERY_KEY = boardCacheKeys.migrationStep()[0]
export const TAGS_QUERY_KEY = boardCacheKeys.tags()[0]
export const TODOS_QUERY_KEY = boardCacheKeys.todosRoot()[0]
