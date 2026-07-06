import { errorResponse } from '@/server/utils'

export type PendingMigrationGateRepository = {
  hasPendingMigrationBuckets: (userId: string) => Promise<boolean>
}

export async function requireNoPendingMigrationBuckets(
  repository: PendingMigrationGateRepository,
  userId: string,
  resourceName: string,
) {
  if (await repository.hasPendingMigrationBuckets(userId)) {
    throw errorResponse(409, `Migration is required before changing ${resourceName}`)
  }
}
