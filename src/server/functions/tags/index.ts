import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { createPrivateOperation, validateInput } from '@/server/core'
import { createTagRepository } from '@/server/db/tag-repository'
import {
  createTagForUser,
  deleteTagForUser,
  listTagsForUser,
  updateTagForUser,
} from '@/server/functions/tags/operations'
import {
  CreateTagInput,
  DeleteTagInput,
  DeleteTagResponse,
  ListTagsInput,
  TagResponse,
  TagsResponse,
  UpdateTagInput,
} from '@/server/functions/tags/schemas'

export const createTag = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'tags.create', response: TagResponse })])
  .validator(validateInput(CreateTagInput))
  .handler(async ({ data, context }): Promise<z.output<typeof TagResponse>> => {
    return createTagForUser({ data, repository: createTagRepository(context.db), userId: context.user.id })
  })

export const listTags = createServerFn({ method: 'GET' })
  .middleware([createPrivateOperation({ operation: 'tags.list', response: TagsResponse })])
  .validator(validateInput(ListTagsInput))
  .handler(async ({ context }): Promise<z.output<typeof TagsResponse>> => {
    return listTagsForUser({ repository: createTagRepository(context.db), userId: context.user.id })
  })

export const updateTag = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'tags.update', response: TagResponse })])
  .validator(validateInput(UpdateTagInput))
  .handler(async ({ data, context }): Promise<z.output<typeof TagResponse>> => {
    return updateTagForUser({ data, repository: createTagRepository(context.db), userId: context.user.id })
  })

export const deleteTag = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'tags.delete', response: DeleteTagResponse })])
  .validator(validateInput(DeleteTagInput))
  .handler(async ({ data, context }): Promise<z.output<typeof DeleteTagResponse>> => {
    return deleteTagForUser({ data, repository: createTagRepository(context.db), userId: context.user.id })
  })
