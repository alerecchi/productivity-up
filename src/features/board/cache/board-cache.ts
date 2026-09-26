import type { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import { TodoSchema } from '@/lib/types/Todo'
import type { Todo } from '@/lib/types/Todo'

type OptimisticTodoEdit = {
  bucketId: number
  changes: Partial<Pick<Todo, 'category' | 'categoryId' | 'completed' | 'description' | 'tags' | 'title'>>
  todoId: number
  type: 'todo-edited'
}

type OptimisticTodoMove = {
  afterTodoId?: number
  beforeTodoId?: number
  sourceBucketId: number
  targetBucketId: number
  todoId: number
  type: 'todo-moved'
}

export type OptimisticBoardChange = OptimisticTodoEdit | OptimisticTodoMove

type TodoCreated = {
  todo: Todo
  type: 'todo-created'
}

type TodoDeleted = {
  previousBucketId: number
  todoId: number
  type: 'todo-deleted'
}

type TodoUpdated = {
  previousBucketId: number
  todo: Todo
  type: 'todo-updated'
}

type TodoMoved = {
  affectedBucketIds: Array<number>
  positions: Array<Pick<Todo, 'bucketId' | 'id' | 'position'>>
  sourceBucketId: number
  todo: Todo
  type: 'todo-moved'
}

export type CommittedBoardChange = TodoCreated | TodoDeleted | TodoMoved | TodoUpdated

const CommittedBoardChangeSchema = z.discriminatedUnion('type', [
  z.object({ todo: TodoSchema, type: z.literal('todo-created') }).strict(),
  z.object({ previousBucketId: z.int(), todoId: z.int(), type: z.literal('todo-deleted') }).strict(),
  z
    .object({
      affectedBucketIds: z.array(z.int()),
      positions: z.array(TodoSchema.pick({ bucketId: true, id: true, position: true })),
      sourceBucketId: z.int(),
      todo: TodoSchema,
      type: z.literal('todo-moved'),
    })
    .strict()
    .superRefine((change, context) => {
      const affectedBucketIds = new Set(change.affectedBucketIds)

      for (const requiredBucketId of [change.sourceBucketId, change.todo.bucketId]) {
        if (!affectedBucketIds.has(requiredBucketId)) {
          context.addIssue({
            code: 'custom',
            message: `Missing affected Bucket ${requiredBucketId}`,
            path: ['affectedBucketIds'],
          })
        }
      }

      for (const position of change.positions) {
        if (!affectedBucketIds.has(position.bucketId)) {
          context.addIssue({
            code: 'custom',
            message: `Position patch names unaffected Bucket ${position.bucketId}`,
            path: ['positions'],
          })
        }
      }
    }),
  z.object({ previousBucketId: z.int(), todo: TodoSchema, type: z.literal('todo-updated') }).strict(),
])

export type BoardCacheScope =
  | { bucketIds: Array<number>; type: 'todos' }
  | { type: 'all' }
  | { type: 'board' }
  | { type: 'buckets' }
  | { type: 'categories' }
  | { type: 'migration-step' }
  | { type: 'tags' }

const BoardCacheScopeSchema: z.ZodType<BoardCacheScope> = z.discriminatedUnion('type', [
  z.object({ bucketIds: z.array(z.int()), type: z.literal('todos') }).strict(),
  z.object({ type: z.enum(['all', 'board', 'buckets', 'categories', 'migration-step', 'tags']) }).strict(),
])

/**
 * How a failed mutation relates to durable state: `rejected` left it untouched, `conflict` means the
 * cached view is stale, and `uncertain` means the write may or may not have committed.
 */
export type MutationFailure = 'conflict' | 'rejected' | 'uncertain'

const REJECTED_STATUSES = new Set([400, 401, 403, 429])
const CONFLICT_STATUSES = new Set([404, 409])

function getMutationFailure(error: unknown): MutationFailure {
  if (error === undefined || (error instanceof Response && REJECTED_STATUSES.has(error.status))) {
    return 'rejected'
  }

  if (error instanceof Response && CONFLICT_STATUSES.has(error.status)) {
    return 'conflict'
  }

  return 'uncertain'
}

type PendingOptimisticChange = {
  bucketIds: Array<number>
  change: OptimisticBoardChange
}

type OptimisticState = {
  /** Buckets touched by optimistic changes that were in flight together; refetched once none remain pending. */
  overlappedBucketIds: Set<number>
  pendingChanges: Set<PendingOptimisticChange>
}

// Shared by every cache instance of one QueryClient, since `useBoardCache` creates an instance per render.
const optimisticStateByClient = new WeakMap<QueryClient, OptimisticState>()

function getOptimisticState(queryClient: QueryClient) {
  let optimisticState = optimisticStateByClient.get(queryClient)

  if (!optimisticState) {
    optimisticState = { overlappedBucketIds: new Set(), pendingChanges: new Set() }
    optimisticStateByClient.set(queryClient, optimisticState)
  }

  return optimisticState
}

export function createBoardCache(queryClient: QueryClient) {
  const { overlappedBucketIds, pendingChanges } = getOptimisticState(queryClient)

  const track = (pendingChange: PendingOptimisticChange) => {
    for (const otherChange of pendingChanges) {
      if (otherChange.bucketIds.some((bucketId) => pendingChange.bucketIds.includes(bucketId))) {
        for (const bucketId of [...otherChange.bucketIds, ...pendingChange.bucketIds]) {
          overlappedBucketIds.add(bucketId)
        }
      }
    }

    pendingChanges.add(pendingChange)
  }

  // Refetches overlapped Buckets once no pending change touches them, since their responses may have arrived out of order.
  const settle = async (syncedScope?: BoardCacheScope) => {
    const settledBucketIds = [...overlappedBucketIds].filter(
      (bucketId) => ![...pendingChanges].some((otherChange) => otherChange.bucketIds.includes(bucketId)),
    )

    for (const bucketId of settledBucketIds) {
      overlappedBucketIds.delete(bucketId)
    }

    const bucketIdsToSync =
      syncedScope?.type === 'all'
        ? []
        : settledBucketIds.filter(
            (bucketId) => syncedScope?.type !== 'todos' || !syncedScope.bucketIds.includes(bucketId),
          )

    if (bucketIdsToSync.length > 0) {
      await sync({ bucketIds: bucketIdsToSync, type: 'todos' })
    }
  }

  // Layers still-pending optimistic changes back over canonical data written to `bucketIds`.
  const reapplyPendingChanges = (bucketIds: Array<number> | 'all') => {
    for (const pendingChange of pendingChanges) {
      if (bucketIds === 'all' || pendingChange.bucketIds.some((bucketId) => bucketIds.includes(bucketId))) {
        applyOptimisticChange(queryClient, pendingChange.change)
      }
    }
  }

  const sync = async (scope: BoardCacheScope, refetchType: 'active' | 'all' = 'active') => {
    const parsedScope = BoardCacheScopeSchema.safeParse(scope)
    const validScope = parsedScope.success ? parsedScope.data : ({ type: 'all' } as const)

    if (validScope.type === 'todos') {
      await Promise.all(
        validScope.bucketIds.map((bucketId) =>
          queryClient.invalidateQueries({
            exact: true,
            queryKey: boardCacheKeys.todos(bucketId),
            refetchType,
          }),
        ),
      )
      reapplyPendingChanges(validScope.bucketIds)
      return
    }

    if (validScope.type === 'all') {
      await queryClient.invalidateQueries({
        predicate: (query) => BOARD_QUERY_ROOTS.has(query.queryKey[0]),
        refetchType,
      })
      reapplyPendingChanges('all')
      return
    }

    await queryClient.invalidateQueries({
      exact: true,
      queryKey: getQueryKeyForScope(validScope),
      refetchType,
    })
  }

  const apply = async (change: CommittedBoardChange) => {
    const parsedChange = CommittedBoardChangeSchema.safeParse(change)

    if (!parsedChange.success) {
      await sync({ type: 'all' })
      return
    }

    const committedChange = parsedChange.data
    const affectedBucketIds = getAffectedBucketIds(committedChange)

    await Promise.all(
      affectedBucketIds.map((bucketId) =>
        queryClient.cancelQueries({ exact: true, queryKey: boardCacheKeys.todos(bucketId) }),
      ),
    )

    switch (committedChange.type) {
      case 'todo-created':
        updateLoadedTodos(queryClient, boardCacheKeys.todos(committedChange.todo.bucketId), (todos) =>
          [...todos.filter((todo) => todo.id !== committedChange.todo.id), committedChange.todo].toSorted(
            compareTodoPosition,
          ),
        )
        break
      case 'todo-deleted':
        updateLoadedTodos(queryClient, boardCacheKeys.todos(committedChange.previousBucketId), (todos) =>
          todos.filter((todo) => todo.id !== committedChange.todoId),
        )
        break
      case 'todo-moved': {
        const bucketsToSync = applyCommittedTodoMove(queryClient, committedChange)

        if (bucketsToSync.length > 0) {
          await sync({ bucketIds: bucketsToSync, type: 'todos' })
        }
        break
      }
      case 'todo-updated':
        applyCommittedTodoUpdate(queryClient, committedChange)
    }

    reapplyPendingChanges(affectedBucketIds)
  }

  // Returns the scope it refetched, if any.
  const reconcileFailure = async (failure: MutationFailure, scope: BoardCacheScope) => {
    const syncedScope: BoardCacheScope | undefined =
      failure === 'conflict' ? scope : failure === 'uncertain' ? { type: 'all' } : undefined

    if (syncedScope) {
      await sync(syncedScope)
    }

    return syncedScope
  }

  return {
    apply,
    async begin(change: OptimisticBoardChange) {
      const affectedBucketIds =
        change.type === 'todo-edited' ? [change.bucketId] : [...new Set([change.sourceBucketId, change.targetBucketId])]
      const queryKeys = affectedBucketIds.map(boardCacheKeys.todos)

      await Promise.all(queryKeys.map((queryKey) => queryClient.cancelQueries({ exact: true, queryKey })))

      const snapshots = queryKeys.map((queryKey) => snapshotQuery(queryClient, queryKey))
      const pendingChange: PendingOptimisticChange = { bucketIds: affectedBucketIds, change }

      applyOptimisticChange(queryClient, change)
      track(pendingChange)

      const optimisticRevisions = queryKeys.map((queryKey) => queryClient.getQueryState(queryKey)?.dataUpdateCount)

      let settled = false

      return {
        async confirm(committedChange: CommittedBoardChange) {
          if (settled) {
            return
          }

          settled = true
          pendingChanges.delete(pendingChange)
          await apply(committedChange)
          await settle()
        },
        async rollback(error?: unknown) {
          const failure = getMutationFailure(error)

          if (settled) {
            return failure
          }

          settled = true
          pendingChanges.delete(pendingChange)
          const hasInterveningWrite = queryKeys.some(
            (queryKey, index) => queryClient.getQueryState(queryKey)?.dataUpdateCount !== optimisticRevisions[index],
          )

          const affectedScope: BoardCacheScope = { bucketIds: affectedBucketIds, type: 'todos' }

          if (hasInterveningWrite) {
            const syncedScope: BoardCacheScope = failure === 'uncertain' ? { type: 'all' } : affectedScope
            // The snapshot is no longer safe to restore, so refresh inactive loaded Buckets too.
            await sync(syncedScope, 'all')
            await settle(syncedScope)
            return failure
          }

          for (const snapshot of snapshots) {
            restoreSnapshot(queryClient, snapshot)
          }

          await settle(await reconcileFailure(failure, affectedScope))
          return failure
        },
      }
    },
    /** Reconciles a failed non-optimistic mutation: conflicts refetch `scope`, uncertain outcomes resync the board. */
    async recover(error: unknown, scope: BoardCacheScope) {
      const failure = getMutationFailure(error)
      await reconcileFailure(failure, scope)
      return failure
    },
    sync,
  }
}

function applyCommittedTodoUpdate(queryClient: QueryClient, change: TodoUpdated) {
  const previousBucketKey = boardCacheKeys.todos(change.previousBucketId)
  const currentBucketKey = boardCacheKeys.todos(change.todo.bucketId)

  if (change.previousBucketId !== change.todo.bucketId) {
    updateLoadedTodos(queryClient, previousBucketKey, (todos) => todos.filter((todo) => todo.id !== change.todo.id))
  }

  updateLoadedTodos(queryClient, currentBucketKey, (todos) => {
    const hasTodo = todos.some((todo) => todo.id === change.todo.id)
    const updatedTodos = hasTodo
      ? todos.map((todo) => (todo.id === change.todo.id ? change.todo : todo))
      : [...todos, change.todo]

    return updatedTodos.toSorted(compareTodoPosition)
  })
}

function getAffectedBucketIds(change: CommittedBoardChange) {
  switch (change.type) {
    case 'todo-created':
      return [change.todo.bucketId]
    case 'todo-deleted':
      return [change.previousBucketId]
    case 'todo-moved':
      return change.affectedBucketIds
    case 'todo-updated':
      return [...new Set([change.previousBucketId, change.todo.bucketId])]
  }
}

const STATIC_SCOPE_QUERY_KEYS = {
  board: boardCacheKeys.board(),
  buckets: boardCacheKeys.buckets(),
  categories: boardCacheKeys.categories(),
  'migration-step': boardCacheKeys.migrationStep(),
  tags: boardCacheKeys.tags(),
} as const

const BOARD_QUERY_ROOTS = new Set<unknown>([
  ...Object.values(STATIC_SCOPE_QUERY_KEYS).map((queryKey) => queryKey[0]),
  boardCacheKeys.todosRoot()[0],
])

function getQueryKeyForScope(scope: { type: keyof typeof STATIC_SCOPE_QUERY_KEYS }) {
  return STATIC_SCOPE_QUERY_KEYS[scope.type]
}

function applyCommittedTodoMove(queryClient: QueryClient, change: TodoMoved) {
  const positionsById = new Map(change.positions.map((position) => [position.id, position.position]))
  const bucketsToSync: Array<number> = []

  for (const bucketId of change.affectedBucketIds) {
    const queryKey = boardCacheKeys.todos(bucketId)
    const todos = queryClient.getQueryData<Array<Todo>>(queryKey)

    if (todos === undefined) {
      continue
    }

    const loadedTodoIds = new Set(todos.map((todo) => todo.id))
    const hasUnloadedPositionPatch = change.positions.some(
      (position) => position.bucketId === bucketId && position.id !== change.todo.id && !loadedTodoIds.has(position.id),
    )

    if (hasUnloadedPositionPatch) {
      bucketsToSync.push(bucketId)
      continue
    }

    const withoutMovedTodo = todos.filter((todo) => todo.id !== change.todo.id)
    const patchedTodos = withoutMovedTodo.map((todo) => {
      const position = positionsById.get(todo.id)
      return position === undefined ? todo : { ...todo, position }
    })

    if (bucketId === change.todo.bucketId) {
      patchedTodos.push(change.todo)
    }

    queryClient.setQueryData(queryKey, patchedTodos.toSorted(compareTodoPosition))
  }

  return bucketsToSync
}

type TodoQueryKey = ReturnType<typeof boardCacheKeys.todos>

type TodoQuerySnapshot = {
  data: Array<Todo> | undefined
  existed: boolean
  queryKey: TodoQueryKey
}

function snapshotQuery(queryClient: QueryClient, queryKey: TodoQueryKey): TodoQuerySnapshot {
  return {
    data: queryClient.getQueryData<Array<Todo>>(queryKey),
    existed: queryClient.getQueryState(queryKey) !== undefined,
    queryKey,
  }
}

function restoreSnapshot(queryClient: QueryClient, snapshot: TodoQuerySnapshot) {
  if (!snapshot.existed) {
    queryClient.removeQueries({ exact: true, queryKey: snapshot.queryKey })
    return
  }

  queryClient.setQueryData(snapshot.queryKey, snapshot.data)
}

function applyOptimisticChange(queryClient: QueryClient, change: OptimisticBoardChange) {
  if (change.type === 'todo-moved') {
    applyOptimisticTodoMove(queryClient, change)
    return
  }

  updateLoadedTodos(queryClient, boardCacheKeys.todos(change.bucketId), (todos) =>
    todos.map((todo) => (todo.id === change.todoId ? { ...todo, ...change.changes } : todo)),
  )
}

function applyOptimisticTodoMove(queryClient: QueryClient, change: OptimisticTodoMove) {
  const sourceKey = boardCacheKeys.todos(change.sourceBucketId)
  const targetKey = boardCacheKeys.todos(change.targetBucketId)
  const sourceTodos = queryClient.getQueryData<Array<Todo>>(sourceKey)
  const movedTodo = sourceTodos?.find((todo) => todo.id === change.todoId)

  if (!movedTodo) {
    return
  }

  if (change.sourceBucketId !== change.targetBucketId) {
    updateLoadedTodos(queryClient, sourceKey, (todos) => todos.filter((todo) => todo.id !== change.todoId))
  }

  updateLoadedTodos(queryClient, targetKey, (todos) =>
    insertTodo(
      todos.filter((todo) => todo.id !== change.todoId),
      { ...movedTodo, bucketId: change.targetBucketId },
      change.beforeTodoId,
      change.afterTodoId,
    ),
  )
}

function insertTodo(
  todos: Array<Todo>,
  movedTodo: Todo,
  beforeTodoId: number | undefined,
  afterTodoId: number | undefined,
) {
  if (afterTodoId !== undefined) {
    const afterIndex = todos.findIndex((todo) => todo.id === afterTodoId)
    return todos.toSpliced(afterIndex === -1 ? todos.length : afterIndex, 0, movedTodo)
  }

  if (beforeTodoId !== undefined) {
    const beforeIndex = todos.findIndex((todo) => todo.id === beforeTodoId)
    return todos.toSpliced(beforeIndex === -1 ? todos.length : beforeIndex + 1, 0, movedTodo)
  }

  return [...todos, movedTodo]
}

function updateLoadedTodos(
  queryClient: QueryClient,
  queryKey: TodoQueryKey,
  update: (todos: Array<Todo>) => Array<Todo>,
) {
  if (queryClient.getQueryData(queryKey) === undefined) {
    return
  }

  queryClient.setQueryData<Array<Todo>>(queryKey, (todos) => (todos === undefined ? undefined : update(todos)))
}

function compareTodoPosition(left: Todo, right: Todo) {
  return left.position - right.position || left.id - right.id
}
