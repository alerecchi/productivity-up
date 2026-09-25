import { z } from 'zod'

import { CategoryDisplaySchema } from '@/lib/types/Category'
import { TagDisplaySchema } from '@/lib/types/Tag'
import {
  PositiveIdSchema,
  TODO_DESCRIPTION_MAX_LENGTH,
  TODO_TAGS_MAX_COUNT,
  TODO_TITLE_MAX_LENGTH,
  boundedUniqueIds,
  strictInput,
} from '@/server/core/validation'

const titleSchema = z.string().trim().min(1).max(TODO_TITLE_MAX_LENGTH)
const descriptionSchema = z.string().max(TODO_DESCRIPTION_MAX_LENGTH)
const tagIdsSchema = boundedUniqueIds(TODO_TAGS_MAX_COUNT)

export const CreateTodoInput = strictInput({
  bucketId: PositiveIdSchema,
  categoryId: PositiveIdSchema.nullable().optional(),
  description: descriptionSchema.optional(),
  tagIds: tagIdsSchema.optional(),
  title: titleSchema,
})

export const GetTodosInput = strictInput({ bucketId: PositiveIdSchema })

export const UpdateTodoInput = strictInput({
  bucketId: PositiveIdSchema.optional(),
  categoryId: PositiveIdSchema.nullable().optional(),
  completed: z.boolean().optional(),
  description: descriptionSchema.optional(),
  id: PositiveIdSchema,
  tagIds: tagIdsSchema.optional(),
  title: titleSchema.optional(),
})

export const MoveTodoInput = strictInput({
  afterTodoId: PositiveIdSchema.optional(),
  beforeTodoId: PositiveIdSchema.optional(),
  id: PositiveIdSchema,
  targetBucketId: PositiveIdSchema,
})

export const DeleteTodoInput = strictInput({ id: PositiveIdSchema })

export const TodoResponse = z.object({
  bucketId: PositiveIdSchema,
  category: CategoryDisplaySchema.nullable(),
  categoryId: PositiveIdSchema.nullable(),
  completed: z.boolean(),
  createdAt: z.date(),
  description: z.string(),
  id: PositiveIdSchema,
  position: z.int(),
  tags: z.array(TagDisplaySchema),
  title: z.string(),
})

export const TodosResponse = z.array(TodoResponse)
export const UpdateTodoResponse = z.object({ previousBucketId: PositiveIdSchema, todo: TodoResponse })
export const DeleteTodoResponse = z.object({ previousBucketId: PositiveIdSchema, todoId: PositiveIdSchema })
export const TodoPositionResponse = z.object({
  bucketId: PositiveIdSchema,
  id: PositiveIdSchema,
  position: z.int(),
})
export const MoveTodoResponse = z.object({
  affectedBucketIds: z.array(PositiveIdSchema),
  positions: z.array(TodoPositionResponse),
  sourceBucketId: PositiveIdSchema,
  todo: TodoResponse,
})
