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

export function createBoardCache(queryClient: QueryClient) {
  const sync = async (scope: BoardCacheScope) => {
    const parsedScope = BoardCacheScopeSchema.safeParse(scope)
    const validScope = parsedScope.success ? parsedScope.data : ({ type: 'all' } as const)

    if (validScope.type === 'todos') {
      await Promise.all(
        validScope.bucketIds.map((bucketId) =>
          queryClient.invalidateQueries({
            exact: true,
            queryKey: boardCacheKeys.todos(bucketId),
            refetchType: 'active',
          }),
        ),
      )
      return
    }

    if (validScope.type === 'all') {
      await queryClient.invalidateQueries({
        predicate: (query) => BOARD_QUERY_ROOTS.has(query.queryKey[0]),
        refetchType: 'active',
      })
      return
    }

    await queryClient.invalidateQueries({
      exact: true,
      queryKey: getQueryKeyForScope(validScope),
      refetchType: 'active',
    })
  }

  const apply = async (change: CommittedBoardChange) => {
    const parsedChange = CommittedBoardChangeSchema.safeParse(change)

    if (!parsedChange.success) {
      await sync({ type: 'all' })
      return
    }

    const committedChange = parsedChange.data

    await Promise.all(
      getAffectedBucketIds(committedChange).map((bucketId) =>
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
        return
      case 'todo-deleted':
        updateLoadedTodos(queryClient, boardCacheKeys.todos(committedChange.previousBucketId), (todos) =>
          todos.filter((todo) => todo.id !== committedChange.todoId),
        )
        return
      case 'todo-moved': {
        const bucketsToSync = applyCommittedTodoMove(queryClient, committedChange)

        if (bucketsToSync.length > 0) {
          await sync({ bucketIds: bucketsToSync, type: 'todos' })
        }
        return
      }
      case 'todo-updated':
        applyCommittedTodoUpdate(queryClient, committedChange)
    }
  }

  return {
    apply,
    async begin(change: OptimisticBoardChange) {
      const affectedBucketIds =
        change.type === 'todo-edited' ? [change.bucketId] : [...new Set([change.sourceBucketId, change.targetBucketId])]
      const queryKeys = affectedBucketIds.map(boardCacheKeys.todos)

      await Promise.all(queryKeys.map((queryKey) => queryClient.cancelQueries({ exact: true, queryKey })))

      const snapshots = queryKeys.map((queryKey) => snapshotQuery(queryClient, queryKey))

      if (change.type === 'todo-edited') {
        updateLoadedTodos(queryClient, boardCacheKeys.todos(change.bucketId), (todos) =>
          todos.map((todo) => (todo.id === change.todoId ? { ...todo, ...change.changes } : todo)),
        )
      } else {
        applyOptimisticTodoMove(queryClient, change)
      }

      const optimisticRevisions = queryKeys.map((queryKey) => queryClient.getQueryState(queryKey)?.dataUpdateCount)

      let settled = false

      return {
        async confirm(committedChange: CommittedBoardChange) {
          if (settled) {
            return
          }

          settled = true
          await apply(committedChange)
        },
        async rollback() {
          if (settled) {
            return
          }

          settled = true
          const hasInterveningWrite = queryKeys.some(
            (queryKey, index) => queryClient.getQueryState(queryKey)?.dataUpdateCount !== optimisticRevisions[index],
          )

          if (hasInterveningWrite) {
            await sync({ bucketIds: affectedBucketIds, type: 'todos' })
            return
          }

          for (const snapshot of snapshots) {
            restoreSnapshot(queryClient, snapshot)
          }
        },
      }
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
