import { z } from 'zod'

import type { TagDisplay } from '@/lib/types/Tag'
import { TagColorKeySchema } from '@/lib/types/Tag'
import type { TagDbInsert, TagDbSelect } from '@/server/db/types'
import { requireNoPendingMigrationBuckets } from '@/server/functions/pending-migration-gate'
import { errorResponse } from '@/server/utils'

export class TagNameConflictError extends Error {
  constructor() {
    super('Tag name already exists')
  }
}

const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((name) => normalizeTagName(name))
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/))

export const CreateTagInput = z
  .object({
    colorKey: TagColorKeySchema,
    name: tagNameSchema,
  })
  .strict()

export const UpdateTagInput = z
  .object({
    colorKey: TagColorKeySchema,
    id: z.number().int(),
    name: tagNameSchema,
  })
  .strict()

export const DeleteTagInput = z
  .object({
    id: z.number().int(),
  })
  .strict()

export type DeletedTag = {
  tagId: number
  userId: string
}

export type TagRepository = {
  createTag: (tag: TagDbInsert) => Promise<TagDbSelect>
  deleteTag: (tagId: number, userId: string) => Promise<DeletedTag | undefined>
  findTagByName: (userId: string, name: string) => Promise<TagDbSelect | undefined>
  hasPendingMigrationBuckets: (userId: string) => Promise<boolean>
  listTagsForUser: (userId: string) => Promise<Array<TagDbSelect>>
  updateTag: (
    tagId: number,
    userId: string,
    updates: Pick<TagDbInsert, 'colorKey' | 'name'>,
  ) => Promise<TagDbSelect | undefined>
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
  const tagWithName = await repository.findTagByName(userId, data.name)

  if (tagWithName) {
    throw errorResponse(409, 'Tag name already exists')
  }

  const tag = await repository
    .createTag({
      colorKey: data.colorKey,
      name: data.name,
      userId,
    })
    .catch((error: unknown) => {
      if (error instanceof TagNameConflictError) {
        throw errorResponse(409, error.message)
      }

      throw error
    })

  return toTagDisplay(tag)
}

export async function listTagsForUser({ repository, userId }: ListTagsDependencies) {
  const tags = await repository.listTagsForUser(userId)

  return tags.map(toTagDisplay)
}

export async function updateTagForUser({ data, repository, userId }: UpdateTagDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Tags')
  const tagWithName = await repository.findTagByName(userId, data.name)

  if (tagWithName && tagWithName.id !== data.id) {
    throw errorResponse(409, 'Tag name already exists')
  }

  const tag = await repository
    .updateTag(data.id, userId, {
      colorKey: data.colorKey,
      name: data.name,
    })
    .catch((error: unknown) => {
      if (error instanceof TagNameConflictError) {
        throw errorResponse(409, error.message)
      }

      throw error
    })

  if (!tag) {
    throw errorResponse(404, 'Tag not found or unauthorized')
  }

  return toTagDisplay(tag)
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

function toTagDisplay(tag: TagDbSelect): TagDisplay {
  return {
    colorKey: tag.colorKey,
    id: tag.id,
    name: tag.name,
  }
}
