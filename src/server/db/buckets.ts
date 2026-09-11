import { and, eq } from 'drizzle-orm'

import type { Database } from '@/server/db/client'
import { buckets } from '@/server/db/schema/schema'

export async function hasPendingMigrationBuckets(db: Database, userId: string) {
  const pendingBuckets = await db
    .select({ id: buckets.id })
    .from(buckets)
    .where(and(eq(buckets.userId, userId), eq(buckets.status, 'pending_migration')))
    .limit(1)

  return pendingBuckets.length > 0
}
