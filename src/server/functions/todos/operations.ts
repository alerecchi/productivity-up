import type { z } from 'zod'

import type { CategoryDisplay } from '@/lib/types/Category'
import type { TagDisplay } from '@/lib/types/Tag'
import { errorResponse } from '@/server/core/errors'
import { requireNoPendingMigrationBuckets } from '@/server/core/pending-migration-gate'
import type { BucketDb, CategoryDbSelect, TagDbSelect, TodoDbInsert, TodoDbSelect } from '@/server/db/types'
import type {
  CreateTodoInput,
  DeleteTodoInput,
  GetTodosInput,
  MoveTodoInput,
  UpdateTodoInput,
} from '@/server/functions/todos/schemas'

const TODO_POSITION_GAP = 1024

type TodoWithBucket = TodoDbSelect & {
  bucket: BucketDb
  category: CategoryDbSelect | null
  tags: Array<TagDisplay>
}

export type DeletedTodo = {
  bucketId: number
  todoId: number
}

export type TodoWithCategoryDisplay = TodoDbSelect & {
  category: CategoryDisplay | null
  tags: Array<TagDisplay>
}

export type TodoPositionPatch = Pick<TodoDbSelect, 'bucketId' | 'id' | 'position'>

export type MovedTodo = {
  affectedBucketIds: Array<number>
  affectedTodoPositions: Array<TodoPositionPatch>
  todo: TodoWithCategoryDisplay
}

export type MoveTodoResult = { status: 'conflict' } | { status: 'moved'; todo: TodoDbSelect } | { status: 'not_found' }

export type TodoRepository = {
  createTodo: (todo: TodoDbInsert) => Promise<TodoDbSelect>
  deleteTodo: (todoId: number, userId: string) => Promise<DeletedTodo | undefined>
  findOwnedActiveBucket: (userId: string, bucketId: number) => Promise<BucketDb | undefined>
  findOwnedCategory: (userId: string, categoryId: number) => Promise<CategoryDbSelect | undefined>
  findOwnedTags: (userId: string, tagIds: Array<number>) => Promise<Array<TagDbSelect>>
  findOwnedTodoWithBucket: (userId: string, todoId: number) => Promise<TodoWithBucket | undefined>
  getMaxTodoPosition: (userId: string, bucketId: number) => Promise<number | null>
  // Returns Todos in persisted Todo Position order for the requested Bucket.
  getTodosByBucketForUser: (userId: string, bucketId: number) => Promise<Array<TodoWithCategoryDisplay>>
  hasPendingMigrationBuckets: (userId: string) => Promise<boolean>
  moveTodo: (
    todoId: number,
    userId: string,
    move: {
      bucketId: number
      expectedMovedTodoPosition: number
      expectedSourceBucketId: number
      expectedTargetTodoPositions: Array<TodoPositionPatch>
      position: number
      rebalancedTodoPositions: Array<TodoPositionPatch>
    },
  ) => Promise<MoveTodoResult>
  replaceTodoTags: (todoId: number, userId: string, tagIds: Array<number>) => Promise<void>
  updateTodo: (todoId: number, userId: string, updates: Partial<TodoDbInsert>) => Promise<TodoDbSelect | undefined>
}

type OperationDependencies = {
  repository: TodoRepository
  userId: string
}

type CreateTodoDependencies = OperationDependencies & {
  data: z.output<typeof CreateTodoInput>
  now?: () => Date
}

type GetTodosDependencies = OperationDependencies & {
  data: z.output<typeof GetTodosInput>
}

type UpdateTodoDependencies = OperationDependencies & {
  data: z.output<typeof UpdateTodoInput>
}

type MoveTodoDependencies = OperationDependencies & {
  data: z.output<typeof MoveTodoInput>
}

type DeleteTodoDependencies = OperationDependencies & {
  data: z.output<typeof DeleteTodoInput>
}

export async function createTodoForUser({ data, now = () => new Date(), repository, userId }: CreateTodoDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  await requireOwnedActiveBucket(repository, userId, data.bucketId)
  const category = await requireOwnedCategoryIfPresent(repository, userId, data.categoryId)
  const tagIds = getUniqueTagIds(data.tagIds ?? [])
  const tags = await requireOwnedTags(repository, userId, tagIds)
  const maxPosition = await repository.getMaxTodoPosition(userId, data.bucketId)

  const todo = await repository.createTodo({
    bucketId: data.bucketId,
    categoryId: data.categoryId ?? null,
    completed: false,
    createdAt: now(),
    description: data.description?.trim() ?? '',
    position: getNextTodoPosition(maxPosition),
    title: data.title,
    userId,
  })
  await repository.replaceTodoTags(todo.id, userId, tagIds)

  return withDisplayData(todo, category, tags)
}

export async function getTodosForUser({ data, repository, userId }: GetTodosDependencies) {
  await requireOwnedActiveBucket(repository, userId, data.bucketId)

  return repository.getTodosByBucketForUser(userId, data.bucketId)
}

export async function updateTodoForUser({ data, repository, userId }: UpdateTodoDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  const existingTodo = await repository.findOwnedTodoWithBucket(userId, data.id)

  if (!existingTodo) {
    throw errorResponse(404, 'Todo not found or unauthorized')
  }

  if (existingTodo.bucket.status === 'archived') {
    throw errorResponse(409, 'Cannot update a Todo in an archived Bucket')
  }

  const destinationBucketId =
    data.bucketId !== undefined && data.bucketId !== existingTodo.bucketId ? data.bucketId : undefined

  if (destinationBucketId !== undefined) {
    await requireOwnedActiveBucket(repository, userId, destinationBucketId)
  }
  const category =
    data.categoryId === undefined
      ? toCategoryDisplay(existingTodo.category)
      : await requireOwnedCategoryIfPresent(repository, userId, data.categoryId)
  const tags =
    data.tagIds === undefined
      ? existingTodo.tags.map(toTagDisplay)
      : await requireOwnedTags(repository, userId, getUniqueTagIds(data.tagIds))
  const position =
    destinationBucketId === undefined
      ? undefined
      : getNextTodoPosition(await repository.getMaxTodoPosition(userId, destinationBucketId))

  const updates = {
    bucketId: data.bucketId,
    categoryId: data.categoryId,
    completed: data.completed,
    description: data.description?.trim(),
    position,
    title: data.title,
  }
  const updatedTodo = await repository.updateTodo(data.id, userId, removeUndefinedValues(updates))

  if (!updatedTodo) {
    throw errorResponse(404, 'Todo not found or unauthorized')
  }

  if (data.tagIds !== undefined) {
    await repository.replaceTodoTags(data.id, userId, getUniqueTagIds(data.tagIds))
  }

  return withDisplayData(updatedTodo, category, tags)
}

export async function moveTodoForUser({ data, repository, userId }: MoveTodoDependencies): Promise<MovedTodo> {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  const existingTodo = await repository.findOwnedTodoWithBucket(userId, data.id)

  if (!existingTodo) {
    throw errorResponse(404, 'Todo not found or unauthorized')
  }

  if (existingTodo.bucket.status === 'archived') {
    throw errorResponse(409, 'Cannot move a Todo from an archived Bucket')
  }

  await requireOwnedActiveBucket(repository, userId, data.targetBucketId)

  const targetTodos = (await repository.getTodosByBucketForUser(userId, data.targetBucketId)).filter(
    (todo) => todo.id !== data.id,
  )
  const { position, rebalancedTodoPositions } = getMovePositionFromAnchors({
    afterTodoId: data.afterTodoId,
    beforeTodoId: data.beforeTodoId,
    targetBucketId: data.targetBucketId,
    targetTodos,
  })
  const moveResult = await repository.moveTodo(data.id, userId, {
    bucketId: data.targetBucketId,
    expectedMovedTodoPosition: existingTodo.position,
    expectedSourceBucketId: existingTodo.bucketId,
    expectedTargetTodoPositions: targetTodos.map(toTodoPositionPatch),
    position,
    rebalancedTodoPositions,
  })

  if (moveResult.status === 'conflict') {
    throw errorResponse(409, 'Todo move conflict; refresh and retry')
  }

  if (moveResult.status === 'not_found') {
    throw errorResponse(404, 'Todo not found or unauthorized')
  }

  const movedTodo = withDisplayData(
    moveResult.todo,
    toCategoryDisplay(existingTodo.category),
    existingTodo.tags.map(toTagDisplay),
  )

  return {
    affectedBucketIds: getUniqueBucketIds([existingTodo.bucketId, data.targetBucketId]),
    affectedTodoPositions: [
      ...rebalancedTodoPositions,
      {
        bucketId: movedTodo.bucketId,
        id: movedTodo.id,
        position: movedTodo.position,
      },
    ],
    todo: movedTodo,
  }
}

export async function deleteTodoForUser({ data, repository, userId }: DeleteTodoDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  const existingTodo = await repository.findOwnedTodoWithBucket(userId, data.id)

  if (!existingTodo) {
    throw errorResponse(404, 'Todo not found or unauthorized')
  }

  if (existingTodo.bucket.status !== 'active') {
    throw errorResponse(409, 'Cannot delete a Todo from an archived or pending migration Bucket')
  }

  const deletedTodo = await repository.deleteTodo(data.id, userId)

  if (!deletedTodo) {
    throw errorResponse(404, 'Todo not found or unauthorized')
  }

  return deletedTodo
}

async function requireOwnedActiveBucket(repository: TodoRepository, userId: string, bucketId: number) {
  const bucket = await repository.findOwnedActiveBucket(userId, bucketId)

  if (!bucket) {
    throw errorResponse(404, 'Bucket not found, archived, or unauthorized')
  }

  return bucket
}

async function requireOwnedCategoryIfPresent(
  repository: TodoRepository,
  userId: string,
  categoryId: number | null | undefined,
) {
  if (categoryId === undefined || categoryId === null) {
    return null
  }

  const category = await repository.findOwnedCategory(userId, categoryId)

  if (!category) {
    throw errorResponse(404, 'Category not found or unauthorized')
  }

  return toCategoryDisplay(category)
}

async function requireOwnedTags(repository: TodoRepository, userId: string, tagIds: Array<number>) {
  if (tagIds.length === 0) {
    return []
  }

  const tags = await repository.findOwnedTags(userId, tagIds)

  if (tags.length !== tagIds.length) {
    throw errorResponse(404, 'Tag not found or unauthorized')
  }

  const tagsById = new Map(tags.map((tag) => [tag.id, tag]))

  return tagIds.map((tagId) => toTagDisplay(tagsById.get(tagId)!))
}

function withDisplayData(
  todo: TodoDbSelect,
  category: CategoryDisplay | null,
  tags: Array<TagDisplay>,
): TodoWithCategoryDisplay {
  return {
    ...todo,
    category,
    tags,
  }
}

function toCategoryDisplay(category: CategoryDbSelect | null): CategoryDisplay | null {
  if (!category) {
    return null
  }

  return {
    colorKey: category.colorKey,
    id: category.id,
    name: category.name,
  }
}

function toTagDisplay(tag: TagDisplay): TagDisplay {
  return {
    colorKey: tag.colorKey,
    id: tag.id,
    name: tag.name,
  }
}

function removeUndefinedValues<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>
}

function getUniqueTagIds(tagIds: Array<number>) {
  return [...new Set(tagIds)]
}

function getNextTodoPosition(maxPosition: number | null) {
  return (maxPosition ?? 0) + TODO_POSITION_GAP
}

function getMovePositionFromAnchors({
  afterTodoId,
  beforeTodoId,
  targetBucketId,
  targetTodos,
}: {
  afterTodoId: number | undefined
  beforeTodoId: number | undefined
  targetBucketId: number
  targetTodos: Array<TodoWithCategoryDisplay>
}) {
  const beforeTodo = beforeTodoId === undefined ? undefined : targetTodos.find((todo) => todo.id === beforeTodoId)
  const afterTodo = afterTodoId === undefined ? undefined : targetTodos.find((todo) => todo.id === afterTodoId)

  if (beforeTodoId !== undefined && !beforeTodo) {
    throw errorResponse(409, 'Before Todo anchor is stale, invalid, or unauthorized')
  }

  if (afterTodoId !== undefined && !afterTodo) {
    throw errorResponse(409, 'After Todo anchor is stale, invalid, or unauthorized')
  }

  if (!beforeTodo && !afterTodo) {
    return {
      position: getNextTodoPosition(targetTodos.at(-1)?.position ?? null),
      rebalancedTodoPositions: [],
    }
  }

  if (beforeTodo && afterTodo) {
    const beforeIndex = targetTodos.findIndex((todo) => todo.id === beforeTodo.id)
    const afterIndex = targetTodos.findIndex((todo) => todo.id === afterTodo.id)

    if (afterIndex !== beforeIndex + 1) {
      throw errorResponse(409, 'Todo anchors are not adjacent in the target Bucket')
    }

    const position = Math.floor((beforeTodo.position + afterTodo.position) / 2)

    if (position > beforeTodo.position && position < afterTodo.position) {
      return {
        position,
        rebalancedTodoPositions: [],
      }
    }

    return rebalancePositionsForMove({
      insertionIndex: beforeIndex + 1,
      targetBucketId,
      targetTodos,
    })
  }

  if (beforeTodo) {
    const beforeIndex = targetTodos.findIndex((todo) => todo.id === beforeTodo.id)

    if (beforeIndex !== targetTodos.length - 1) {
      throw errorResponse(409, 'Before Todo anchor is not the last Todo in the target Bucket')
    }

    return {
      position: beforeTodo.position + TODO_POSITION_GAP,
      rebalancedTodoPositions: [],
    }
  }

  const afterIndex = targetTodos.findIndex((todo) => todo.id === afterTodo!.id)

  if (afterIndex !== 0) {
    throw errorResponse(409, 'After Todo anchor is not the first Todo in the target Bucket')
  }

  const position = Math.floor(afterTodo!.position / 2)

  if (position > 0 && position < afterTodo!.position) {
    return {
      position,
      rebalancedTodoPositions: [],
    }
  }

  return rebalancePositionsForMove({
    insertionIndex: 0,
    targetBucketId,
    targetTodos,
  })
}

function getUniqueBucketIds(bucketIds: Array<number>) {
  return [...new Set(bucketIds)]
}

function toTodoPositionPatch(todo: TodoWithCategoryDisplay): TodoPositionPatch {
  return {
    bucketId: todo.bucketId,
    id: todo.id,
    position: todo.position,
  }
}

function rebalancePositionsForMove({
  insertionIndex,
  targetBucketId,
  targetTodos,
}: {
  insertionIndex: number
  targetBucketId: number
  targetTodos: Array<TodoWithCategoryDisplay>
}) {
  let position = TODO_POSITION_GAP
  const rebalancedTodoPositions: Array<TodoPositionPatch> = []

  for (let index = 0; index <= targetTodos.length; index += 1) {
    const nextPosition = (index + 1) * TODO_POSITION_GAP

    if (index === insertionIndex) {
      position = nextPosition
      continue
    }

    const todoIndex = index < insertionIndex ? index : index - 1
    const todo = targetTodos[todoIndex]

    if (todo.position !== nextPosition) {
      rebalancedTodoPositions.push({
        bucketId: targetBucketId,
        id: todo.id,
        position: nextPosition,
      })
    }
  }

  return {
    position,
    rebalancedTodoPositions,
  }
}
