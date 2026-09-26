import type { z } from 'zod'

import type { TagDisplay } from '@/lib/types/Tag'
import { errorResponse } from '@/server/core/errors'
import { requireNoPendingMigrationBuckets } from '@/server/core/pending-migration-gate'
import type { TagDbInsert } from '@/server/db/types'
import type { CreateTagInput, DeleteTagInput, UpdateTagInput } from '@/server/functions/tags/schemas'

export class TagNameConflictError extends Error {
  constructor() {
    super('Tag name already exists')
  }
}

export type DeletedTag = {
  tagId: number
}

/**
 * User-scoped Tag persistence. Updates and deletes resolve `undefined` for missing and foreign Tags alike; creates and
 * updates reject with `TagNameConflictError` when the (User, name) uniqueness constraint fails.
 */
export type TagRepository = {
  createTag: (tag: TagDbInsert) => Promise<TagDisplay>
  deleteTag: (tagId: number, userId: string) => Promise<DeletedTag | undefined>
  hasPendingMigrationBuckets: (userId: string) => Promise<boolean>
  listTagsForUser: (userId: string) => Promise<Array<TagDisplay>>
  updateTag: (
    tagId: number,
    userId: string,
    updates: Pick<TagDbInsert, 'colorKey' | 'name'>,
  ) => Promise<TagDisplay | undefined>
}

type CreateTagDependencies = {
  data: z.output<typeof CreateTagInput>
  repository: TagRepository
  userId: string
}

type ListTagsDependencies = {
  repository: TagRepository
  userId: string
}

type UpdateTagDependencies = {
  data: z.output<typeof UpdateTagInput>
  repository: TagRepository
  userId: string
}

type DeleteTagDependencies = {
  data: z.output<typeof DeleteTagInput>
  repository: TagRepository
  userId: string
}

export async function createTagForUser({ data, repository, userId }: CreateTagDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Tags')
  return repository
    .createTag({
      colorKey: data.colorKey,
      name: data.name,
      userId,
    })
    .catch(mapTagNameConflict)
}

export function listTagsForUser({ repository, userId }: ListTagsDependencies) {
  return repository.listTagsForUser(userId)
}

export async function updateTagForUser({ data, repository, userId }: UpdateTagDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Tags')
  const tag = await repository
    .updateTag(data.id, userId, {
      colorKey: data.colorKey,
      name: data.name,
    })
    .catch(mapTagNameConflict)

  if (!tag) {
    throw errorResponse(404, 'Tag not found or unauthorized')
  }

  return tag
}

export async function deleteTagForUser({ data, repository, userId }: DeleteTagDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Tags')
  const deletedTag = await repository.deleteTag(data.id, userId)

  if (!deletedTag) {
    throw errorResponse(404, 'Tag not found or unauthorized')
  }

  return deletedTag
}

export function normalizeTagName(name: string) {
  return name.trim().toLowerCase()
}

function mapTagNameConflict(error: unknown): never {
  if (error instanceof TagNameConflictError) {
    throw errorResponse(409, error.message)
  }

  throw error
}
