import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'

import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import { db } from '@/server/db/client'
import { tags } from '@/server/db/schema/schema'
import type { TagDbInsert } from '@/server/db/types'
import type { TagRepository } from '@/server/functions/tags.core'
import {
  CreateTagInput,
  DeleteTagInput,
  TagNameConflictError,
  UpdateTagInput,
  createTagForUser,
  deleteTagForUser,
  listTagsForUser,
  updateTagForUser,
} from '@/server/functions/tags.core'
import { authRequiredMiddleware } from '@/server/middlewares/auth-middleware'

export const createTag = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(CreateTagInput)
  .handler(async ({ data, context }) => {
    return createTagForUser({
      data,
      repository: tagRepository,
      userId: context.session.user.id,
    })
  })

export const listTags = createServerFn()
  .middleware([authRequiredMiddleware])
  .handler(async ({ context }) => {
    return listTagsForUser({
      repository: tagRepository,
      userId: context.session.user.id,
    })
  })

export const updateTag = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(UpdateTagInput)
  .handler(async ({ data, context }) => {
    return updateTagForUser({
      data,
      repository: tagRepository,
      userId: context.session.user.id,
    })
  })

export const deleteTag = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(DeleteTagInput)
  .handler(async ({ data, context }) => {
    return deleteTagForUser({
      data,
      repository: tagRepository,
      userId: context.session.user.id,
    })
  })

const tagRepository: TagRepository = {
  async createTag(tagToAdd: TagDbInsert) {
    const [tag] = await db
      .insert(tags)
      .values(tagToAdd)
      .returning()
      .catch((error: unknown) => {
        if (isTagNameUniqueViolation(error)) {
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
  hasPendingMigrationBuckets,
  async updateTag(tagId, userId, updates) {
    const [tag] = await db
      .update(tags)
      .set(updates)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning()
      .catch((error: unknown) => {
        if (isTagNameUniqueViolation(error)) {
          throw new TagNameConflictError()
        }

        throw error
      })

    return tag
  },
}

function isTagNameUniqueViolation(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeDatabaseError = error as {
    code?: unknown
    constraint?: unknown
    constraint_name?: unknown
  }

  if (maybeDatabaseError.code !== '23505') {
    return false
  }

  return (
    maybeDatabaseError.constraint === undefined ||
    maybeDatabaseError.constraint === 'tags_user_id_name_unique' ||
    maybeDatabaseError.constraint_name === 'tags_user_id_name_unique'
  )
}
