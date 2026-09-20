import { and, asc, eq } from 'drizzle-orm'

import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import type { Database } from '@/server/db/client'
import { isUniqueConstraintViolation } from '@/server/db/postgres-errors'
import { tags } from '@/server/db/schema/schema'
import type { TagDbInsert } from '@/server/db/types'
import { TagNameConflictError } from '@/server/functions/tags/operations'
import type { TagRepository } from '@/server/functions/tags/operations'

export function createTagRepository(db: Database): TagRepository {
  return {
    async createTag(tagToAdd: TagDbInsert) {
      const [tag] = await db
        .insert(tags)
        .values(tagToAdd)
        .returning()
        .catch((error: unknown) => {
          if (isUniqueConstraintViolation(error, 'tags_user_id_name_unique')) {
            throw new TagNameConflictError()
          }

          throw error
        })
      return tag
    },
    async deleteTag(tagId, userId) {
      const [tag] = await db
        .delete(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
        .returning({
          tagId: tags.id,
          userId: tags.userId,
        })

      return tag
    },
    listTagsForUser(userId: string) {
      return db.query.tags.findMany({
        orderBy: [asc(tags.name)],
        where: eq(tags.userId, userId),
      })
    },
    findTagByName(userId: string, name: string) {
      return db.query.tags.findFirst({
        where: and(eq(tags.userId, userId), eq(tags.name, name)),
      })
    },
    hasPendingMigrationBuckets(userId) {
      return hasPendingMigrationBuckets(db, userId)
    },
    async updateTag(tagId, userId, updates) {
      const [tag] = await db
        .update(tags)
        .set(updates)
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
        .returning()
        .catch((error: unknown) => {
          if (isUniqueConstraintViolation(error, 'tags_user_id_name_unique')) {
            throw new TagNameConflictError()
          }

          throw error
        })

      return tag
    },
  }
}
