import { and, asc, eq } from 'drizzle-orm'

import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import type { Database } from '@/server/db/client'
import { isUniqueConstraintViolation } from '@/server/db/postgres-errors'
import { tags } from '@/server/db/schema/schema'
import type { TagDbInsert } from '@/server/db/types'
import { TagNameConflictError } from '@/server/functions/tags/operations'
import type { TagRepository } from '@/server/functions/tags/operations'

const tagDisplay = { colorKey: tags.colorKey, id: tags.id, name: tags.name }

/** Production Tag repository. Every write is one owner-scoped statement returning only display data. */
export function createTagRepository(db: Database): TagRepository {
  return {
    async createTag(tagToAdd: TagDbInsert) {
      const [tag] = await db.insert(tags).values(tagToAdd).returning(tagDisplay).catch(mapNameConflict)

      return tag
    },
    async deleteTag(tagId, userId) {
      const [tag] = await db
        .delete(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
        .returning({ tagId: tags.id })

      return tag
    },
    hasPendingMigrationBuckets(userId) {
      return hasPendingMigrationBuckets(db, userId)
    },
    listTagsForUser(userId: string) {
      return db.select(tagDisplay).from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.name))
    },
    async updateTag(tagId, userId, updates) {
      const [tag] = await db
        .update(tags)
        .set(updates)
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
        .returning(tagDisplay)
        .catch(mapNameConflict)

      return tag
    },
  }
}

function mapNameConflict(error: unknown): never {
  if (isUniqueConstraintViolation(error, 'tags_user_id_name_unique')) {
    throw new TagNameConflictError()
  }

  throw error
}
