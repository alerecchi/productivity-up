import type { z } from 'zod'

import { STALE_TODO_POSITIONS_MESSAGE } from '@/lib/todo-error-messages'
import type { CategoryDisplay } from '@/lib/types/Category'
import type { TagDisplay } from '@/lib/types/Tag'
import type { Todo } from '@/lib/types/Todo'
import { errorResponse } from '@/server/core/errors'
import { requireNoPendingMigrationBuckets } from '@/server/core/pending-migration-gate'
import type { BucketDb, TodoDbSelect } from '@/server/db/types'
import type {
  CreateTodoInput,
  DeleteTodoInput,
  GetTodosInput,
  MoveTodoInput,
  UpdateTodoInput,
} from '@/server/functions/todos/schemas'

export const TODO_POSITION_GAP = 1024
export { STALE_TODO_POSITIONS_MESSAGE } from '@/lib/todo-error-messages'

export type TodoPositionPatch = Pick<Todo, 'bucketId' | 'id' | 'position'>

/** An owned Todo with the status of its current Bucket and its display data. */
export type TodoForCommand = TodoDbSelect & {
  bucketStatus: BucketDb['status']
  category: CategoryDisplay | null
  tags: Array<TagDisplay>
}

export type CreateTodoCommand = {
  bucketId: number
  categoryId: number | null
  createdAt: Date
  description: string
  tagIds: Array<number>
  title: string
  userId: string
}

export type UpdateTodoCommand = {
  changes: Partial<Pick<TodoDbSelect, 'categoryId' | 'completed' | 'description' | 'title'>>
  /** Moves the Todo to the end of another Bucket, guarded by the Bucket it was read from. */
  destination?: { bucketId: number; expectedBucketId: number }
  /** Replaces the full Tag set when present. */
  tagIds?: Array<number>
  todoId: number
  userId: string
}

export type GuardedTodoMove = {
  expectedTargetTodos: Array<TodoPositionPatch>
  position: number
  source: { bucketId: number; position: number }
  targetBucketId: number
  todoId: number
  userId: string
} & (
  | { kind: 'insert' }
  | { expectedTargetTodos: Array<TodoPositionPatch>; kind: 'rebalance'; rebalanced: Array<TodoPositionPatch> }
)

/**
 * User-scoped Todo persistence. Reads classify errors and plan commands; every write re-checks the preconditions its
 * result depends on and returns `undefined` (or `'stale'`) without writing when they no longer hold. Writes that touch
 * several rows commit atomically.
 */
export type TodoRepository = {
  /** Appends the Todo to the end of an owned active Bucket together with its Todo-Tags. */
  createTodo: (command: CreateTodoCommand) => Promise<TodoDbSelect | undefined>
  deleteTodo: (userId: string, todoId: number) => Promise<{ previousBucketId: number; todoId: number } | undefined>
  findActiveBucket: (userId: string, bucketId: number) => Promise<{ id: number } | undefined>
  findCategory: (userId: string, categoryId: number) => Promise<CategoryDisplay | undefined>
  /** Returns only the owned subset of the requested Tags. */
  findTags: (userId: string, tagIds: Array<number>) => Promise<Array<TagDisplay>>
  findTodo: (userId: string, todoId: number) => Promise<TodoForCommand | undefined>
  hasPendingMigrationBuckets: (userId: string) => Promise<boolean>
  /** Todo positions of a Bucket in canonical position, then Todo ID order. */
  listPositions: (userId: string, bucketId: number) => Promise<Array<TodoPositionPatch>>
  /** Canonical Todos of a Bucket in position, then Todo ID order. */
  listTodos: (userId: string, bucketId: number) => Promise<Array<Todo>>
  moveTodo: (move: GuardedTodoMove) => Promise<TodoDbSelect | 'stale'>
  updateTodo: (command: UpdateTodoCommand) => Promise<{ previousBucketId: number; todo: TodoDbSelect } | undefined>
}

export type MovedTodo = {
  affectedBucketIds: Array<number>
  /** Every Todo Position the move changed, including the moved Todo's own. */
  positions: Array<TodoPositionPatch>
  sourceBucketId: number
  todo: Todo
}

export type UpdatedTodo = {
  previousBucketId: number
  todo: Todo
}

type OperationDependencies = {
  repository: TodoRepository
  userId: string
}

export async function createTodoForUser({
  data,
  now = () => new Date(),
  repository,
  userId,
}: OperationDependencies & { data: z.output<typeof CreateTodoInput>; now?: () => Date }): Promise<Todo> {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  await requireActiveBucket(repository, userId, data.bucketId)
  await requireCategory(repository, userId, data.categoryId ?? null)
  const tagIds = data.tagIds ?? []
  await requireTags(repository, userId, tagIds)

  const todo = await repository.createTodo({
    bucketId: data.bucketId,
    categoryId: data.categoryId ?? null,
    createdAt: now(),
    description: data.description?.trim() ?? '',
    tagIds,
    title: data.title,
    userId,
  })

  if (!todo) {
    throw notFound()
  }

  const canonicalTodo = await requireTodo(repository, userId, todo.id)
  return toTodo(canonicalTodo)
}

export async function getTodosForUser({
  data,
  repository,
  userId,
}: OperationDependencies & { data: z.output<typeof GetTodosInput> }): Promise<Array<Todo>> {
  await requireActiveBucket(repository, userId, data.bucketId)

  return repository.listTodos(userId, data.bucketId)
}

export async function updateTodoForUser({
  data,
  repository,
  userId,
}: OperationDependencies & { data: z.output<typeof UpdateTodoInput> }): Promise<UpdatedTodo> {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  const existingTodo = await requireTodoInActiveBucket(repository, userId, data.id)
  if (data.categoryId !== undefined) {
    await requireCategory(repository, userId, data.categoryId)
  }
  if (data.tagIds !== undefined) {
    await requireTags(repository, userId, data.tagIds)
  }
  const destination =
    data.bucketId === undefined || data.bucketId === existingTodo.bucketId
      ? undefined
      : { bucketId: data.bucketId, expectedBucketId: existingTodo.bucketId }

  if (destination) {
    await requireActiveBucket(repository, userId, destination.bucketId)
  }

  const result = await repository.updateTodo({
    changes: removeUndefinedValues({
      categoryId: data.categoryId,
      completed: data.completed,
      description: data.description?.trim(),
      title: data.title,
    }),
    destination,
    tagIds: data.tagIds,
    todoId: data.id,
    userId,
  })

  if (!result) {
    throw destination ? staleTodoPositions() : notFound()
  }

  const canonicalTodo = await requireTodo(repository, userId, result.todo.id)
  return {
    previousBucketId: result.previousBucketId,
    todo: toTodo(canonicalTodo),
  }
}

export async function moveTodoForUser({
  data,
  repository,
  userId,
}: OperationDependencies & { data: z.output<typeof MoveTodoInput> }): Promise<MovedTodo> {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  const existingTodo = await requireTodoInActiveBucket(repository, userId, data.id)
  await requireActiveBucket(repository, userId, data.targetBucketId)

  const targetTodos = (await repository.listPositions(userId, data.targetBucketId)).filter(
    (todo) => todo.id !== data.id,
  )
  const plan = planMove({
    afterTodoId: data.afterTodoId,
    beforeTodoId: data.beforeTodoId,
    targetBucketId: data.targetBucketId,
    targetTodos,
  })
  const movedTodo = await repository.moveTodo({
    ...plan,
    source: { bucketId: existingTodo.bucketId, position: existingTodo.position },
    targetBucketId: data.targetBucketId,
    todoId: data.id,
    userId,
  })

  if (movedTodo === 'stale') {
    throw staleTodoPositions()
  }

  const canonicalTodo = await requireTodo(repository, userId, movedTodo.id)
  return {
    affectedBucketIds: [...new Set([existingTodo.bucketId, data.targetBucketId])],
    positions: [
      ...(plan.kind === 'rebalance' ? plan.rebalanced : []),
      { bucketId: movedTodo.bucketId, id: movedTodo.id, position: movedTodo.position },
    ],
    sourceBucketId: existingTodo.bucketId,
    todo: toTodo(canonicalTodo),
  }
}

export async function deleteTodoForUser({
  data,
  repository,
  userId,
}: OperationDependencies & { data: z.output<typeof DeleteTodoInput> }) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Todos')
  await requireTodoInActiveBucket(repository, userId, data.id)
  const deletedTodo = await repository.deleteTodo(userId, data.id)

  if (!deletedTodo) {
    throw notFound()
  }

  return deletedTodo
}

async function requireActiveBucket(repository: TodoRepository, userId: string, bucketId: number) {
  if (!(await repository.findActiveBucket(userId, bucketId))) {
    throw notFound()
  }
}

async function requireTodo(repository: TodoRepository, userId: string, todoId: number) {
  const todo = await repository.findTodo(userId, todoId)

  if (!todo) {
    throw notFound()
  }

  return todo
}

async function requireTodoInActiveBucket(repository: TodoRepository, userId: string, todoId: number) {
  const todo = await requireTodo(repository, userId, todoId)

  if (todo.bucketStatus !== 'active') {
    throw errorResponse(409, 'Todos in archived Buckets cannot change')
  }

  return todo
}

async function requireCategory(repository: TodoRepository, userId: string, categoryId: number | null) {
  if (categoryId === null) {
    return null
  }

  const category = await repository.findCategory(userId, categoryId)

  if (!category) {
    throw notFound()
  }

  return category
}

async function requireTags(repository: TodoRepository, userId: string, tagIds: Array<number>) {
  if (tagIds.length === 0) {
    return []
  }

  const tags = await repository.findTags(userId, tagIds)

  if (tags.length !== tagIds.length) {
    throw notFound()
  }

  return sortTags(tags)
}

// The single stale-movement conflict; clients refetch the affected Buckets and let the User retry.
function staleTodoPositions() {
  return errorResponse(409, STALE_TODO_POSITIONS_MESSAGE)
}

// Missing, foreign, and inactive resources share one error so responses never reveal another User's identifiers.
function notFound() {
  return errorResponse(404, 'Resource not found')
}

function sortTags(tags: Array<TagDisplay>) {
  return tags.toSorted((left, right) => left.name.localeCompare(right.name) || left.id - right.id)
}

function toTodo(todo: TodoForCommand): Todo {
  const { userId: _userId, bucketStatus: _bucketStatus, ...canonicalTodo } = todo
  return canonicalTodo
}

type MovePlan =
  | { expectedTargetTodos: Array<TodoPositionPatch>; kind: 'insert'; position: number }
  | {
      expectedTargetTodos: Array<TodoPositionPatch>
      kind: 'rebalance'
      position: number
      rebalanced: Array<TodoPositionPatch>
    }

/**
 * Places the moved Todo between the client's anchors in the target Bucket's canonical order. Uses the sparse midpoint
 * when a gap exists, otherwise rebalances the whole Bucket. Anchors that are missing or no longer adjacent are stale.
 */
function planMove({
  afterTodoId,
  beforeTodoId,
  targetBucketId,
  targetTodos,
}: {
  afterTodoId: number | undefined
  beforeTodoId: number | undefined
  targetBucketId: number
  targetTodos: Array<TodoPositionPatch>
}): MovePlan {
  const beforeIndex = beforeTodoId === undefined ? undefined : targetTodos.findIndex(({ id }) => id === beforeTodoId)
  const afterIndex = afterTodoId === undefined ? undefined : targetTodos.findIndex(({ id }) => id === afterTodoId)
  const lastIndex = targetTodos.length - 1
  const isStale =
    beforeIndex === -1 ||
    afterIndex === -1 ||
    (beforeIndex !== undefined && afterIndex !== undefined && afterIndex !== beforeIndex + 1) ||
    (beforeIndex !== undefined && afterIndex === undefined && beforeIndex !== lastIndex) ||
    (beforeIndex === undefined && afterIndex !== undefined && afterIndex !== 0)

  if (isStale) {
    throw staleTodoPositions()
  }

  const insertionIndex = beforeIndex === undefined ? (afterIndex ?? targetTodos.length) : beforeIndex + 1
  const before = insertionIndex > 0 ? targetTodos[insertionIndex - 1] : undefined
  const after = insertionIndex < targetTodos.length ? targetTodos[insertionIndex] : undefined
  const lowerBound = before?.position ?? 0

  if (!after) {
    return { expectedTargetTodos: targetTodos, kind: 'insert', position: lowerBound + TODO_POSITION_GAP }
  }

  const position = Math.floor((lowerBound + after.position) / 2)

  if (position > lowerBound && position < after.position) {
    return { expectedTargetTodos: targetTodos, kind: 'insert', position }
  }

  return rebalance(targetTodos, insertionIndex, targetBucketId)
}

function rebalance(targetTodos: Array<TodoPositionPatch>, insertionIndex: number, targetBucketId: number): MovePlan {
  const rebalanced = targetTodos
    .map((todo, index) => ({
      bucketId: targetBucketId,
      id: todo.id,
      position: (index < insertionIndex ? index + 1 : index + 2) * TODO_POSITION_GAP,
    }))
    .filter((todo, index) => todo.position !== targetTodos[index].position)

  return {
    expectedTargetTodos: targetTodos,
    kind: 'rebalance',
    position: (insertionIndex + 1) * TODO_POSITION_GAP,
    rebalanced,
  }
}

function removeUndefinedValues<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>
}
