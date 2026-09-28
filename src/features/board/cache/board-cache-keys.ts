export const boardCacheKeys = {
  board: () => ['board'] as const,
  buckets: () => ['buckets'] as const,
  categories: () => ['categories'] as const,
  migrationStep: (sourceBucketId: number) => ['migration-step', sourceBucketId] as const,
  migrationStepRoot: () => ['migration-step'] as const,
  tags: () => ['tags'] as const,
  todos: (bucketId: number) => ['todos', bucketId] as const,
  todosRoot: () => ['todos'] as const,
}
