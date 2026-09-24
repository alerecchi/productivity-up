import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { createBoardCache } from '@/features/board/cache'
import {
  BOARD_QUERY_KEY,
  BUCKETS_QUERY_KEY,
  CATEGORIES_QUERY_KEY,
  MIGRATION_STEP_QUERY_KEY,
  TAGS_QUERY_KEY,
  TODOS_QUERY_KEY,
} from '@/features/board/queries/query-keys'
import type { Todo } from '@/lib/types/Todo'

describe('board cache', () => {
  it('rolls back a deterministic optimistic Todo edit', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ id: 1, title: 'Original title' })

    queryClient.setQueryData([TODOS_QUERY_KEY, todo.bucketId], [todo])

    const pendingChange = await cache.begin({
      bucketId: todo.bucketId,
      changes: { title: 'Optimistic title' },
      todoId: todo.id,
      type: 'todo-edited',
    })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, todo.bucketId])).toEqual([{ ...todo, title: 'Optimistic title' }])

    await pendingChange.rollback()

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, todo.bucketId])).toEqual([todo])
  })

  it('confirms an optimistic edit with the canonical Todo', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ id: 1, title: 'Original title' })
    const canonicalTodo = createTodo({ id: 1, title: 'Server title' })

    queryClient.setQueryData([TODOS_QUERY_KEY, todo.bucketId], [todo])

    const pendingChange = await cache.begin({
      bucketId: todo.bucketId,
      changes: { title: 'Optimistic title' },
      todoId: todo.id,
      type: 'todo-edited',
    })

    await pendingChange.confirm({
      previousBucketId: todo.bucketId,
      todo: canonicalTodo,
      type: 'todo-updated',
    })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, todo.bucketId])).toEqual([canonicalTodo])
  })

  it('preserves a newer confirmed edit when an older optimistic edit rolls back', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const firstTodo = createTodo({ id: 1, title: 'First original' })
    const secondTodo = createTodo({ id: 2, title: 'Second original' })
    const canonicalTodos = [firstTodo, { ...secondTodo, title: 'Second committed' }]
    const queryFn = vi.fn().mockResolvedValueOnce([firstTodo, secondTodo]).mockResolvedValue(canonicalTodos)
    const observer = new QueryObserver(queryClient, {
      queryFn,
      queryKey: [TODOS_QUERY_KEY, 10],
    })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    const firstChange = await cache.begin({
      bucketId: 10,
      changes: { title: 'First optimistic' },
      todoId: 1,
      type: 'todo-edited',
    })
    const secondChange = await cache.begin({
      bucketId: 10,
      changes: { title: 'Second optimistic' },
      todoId: 2,
      type: 'todo-edited',
    })

    await secondChange.confirm({
      previousBucketId: 10,
      todo: canonicalTodos[1],
      type: 'todo-updated',
    })
    await firstChange.rollback()

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual(canonicalTodos)
    expect(queryFn).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('rolls back an optimistic Todo move across Buckets', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 10, id: 1, position: 1024 })
    const destinationTodo = createTodo({ bucketId: 20, id: 2, position: 1024 })

    queryClient.setQueryData([TODOS_QUERY_KEY, 10], [movedTodo])
    queryClient.setQueryData([TODOS_QUERY_KEY, 20], [destinationTodo])

    const pendingChange = await cache.begin({
      beforeTodoId: destinationTodo.id,
      sourceBucketId: 10,
      targetBucketId: 20,
      todoId: movedTodo.id,
      type: 'todo-moved',
    })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 20])).toEqual([destinationTodo, { ...movedTodo, bucketId: 20 }])

    await pendingChange.rollback()

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([movedTodo])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 20])).toEqual([destinationTodo])
  })

  it('confirms an optimistic Todo move with canonical positions', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 10, id: 1, position: 1024 })
    const firstTodo = createTodo({ bucketId: 20, id: 2, position: 1024 })
    const lastTodo = createTodo({ bucketId: 20, id: 3, position: 3072 })
    const canonicalMovedTodo = { ...movedTodo, bucketId: 20 }

    queryClient.setQueryData([TODOS_QUERY_KEY, 10], [movedTodo])
    queryClient.setQueryData([TODOS_QUERY_KEY, 20], [firstTodo, lastTodo])

    const pendingChange = await cache.begin({
      beforeTodoId: firstTodo.id,
      sourceBucketId: 10,
      targetBucketId: 20,
      todoId: movedTodo.id,
      type: 'todo-moved',
    })

    await pendingChange.confirm({
      affectedBucketIds: [10, 20],
      positions: [
        { bucketId: 20, id: firstTodo.id, position: 0 },
        { bucketId: 20, id: lastTodo.id, position: 2048 },
      ],
      sourceBucketId: 10,
      todo: canonicalMovedTodo,
      type: 'todo-moved',
    })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 20])).toEqual([
      { ...firstTodo, position: 0 },
      canonicalMovedTodo,
      { ...lastTodo, position: 2048 },
    ])
  })

  it('applies canonical positions before sorting affected Todo projections', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 20, id: 1, position: 1024 })
    const firstTodo = createTodo({ bucketId: 20, id: 2, position: 1024 })
    const lastTodo = createTodo({ bucketId: 20, id: 3, position: 3072 })

    queryClient.setQueryData([TODOS_QUERY_KEY, 10], [{ ...movedTodo, bucketId: 10 }])
    queryClient.setQueryData([TODOS_QUERY_KEY, 20], [lastTodo, firstTodo])

    await cache.apply({
      affectedBucketIds: [10, 20],
      positions: [
        { bucketId: 20, id: firstTodo.id, position: 0 },
        { bucketId: 20, id: lastTodo.id, position: 2048 },
      ],
      sourceBucketId: 10,
      todo: movedTodo,
      type: 'todo-moved',
    })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 20])).toEqual([
      { ...firstTodo, position: 0 },
      movedTodo,
      { ...lastTodo, position: 2048 },
    ])
  })

  it('does not create a partial destination projection for a committed Todo move', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 20, id: 1 })

    queryClient.setQueryData([TODOS_QUERY_KEY, 10], [{ ...movedTodo, bucketId: 10 }])

    await cache.apply({
      affectedBucketIds: [10, 20],
      positions: [],
      sourceBucketId: 10,
      todo: movedTodo,
      type: 'todo-moved',
    })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([])
    expect(queryClient.getQueryState([TODOS_QUERY_KEY, 20])).toBeUndefined()
  })

  it('refetches an active Todo projection when a position patch names an unloaded Todo', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const loadedTodo = createTodo({ bucketId: 20, id: 2 })
    const movedTodo = createTodo({ bucketId: 20, id: 1 })
    const canonicalTodos = [movedTodo, loadedTodo]
    const queryFn = vi.fn().mockResolvedValueOnce([loadedTodo]).mockResolvedValue(canonicalTodos)
    const boardQueryFn = vi.fn().mockResolvedValue({ status: 'ready' })
    const observer = new QueryObserver(queryClient, {
      queryFn,
      queryKey: [TODOS_QUERY_KEY, 20],
    })
    const boardObserver = new QueryObserver(queryClient, {
      queryFn: boardQueryFn,
      queryKey: [BOARD_QUERY_KEY],
    })
    const unsubscribe = observer.subscribe(() => undefined)
    const unsubscribeBoard = boardObserver.subscribe(() => undefined)

    await observer.refetch()
    await vi.waitFor(() => expect(boardQueryFn).toHaveBeenCalledOnce())

    await cache.apply({
      affectedBucketIds: [10, 20],
      positions: [{ bucketId: 20, id: 99, position: 2048 }],
      sourceBucketId: 10,
      todo: movedTodo,
      type: 'todo-moved',
    })

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(boardQueryFn).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 20])).toEqual(canonicalTodos)

    unsubscribe()
    unsubscribeBoard()
  })

  it('marks an inactive Todo projection stale without fetching it immediately', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue([createTodo()])
    const queryOptions = {
      queryFn,
      queryKey: [TODOS_QUERY_KEY, 10] as const,
      staleTime: Number.POSITIVE_INFINITY,
    }

    await queryClient.fetchQuery(queryOptions)
    await cache.sync({ bucketIds: [10], type: 'todos' })

    expect(queryFn).toHaveBeenCalledTimes(1)

    await queryClient.fetchQuery(queryOptions)

    expect(queryFn).toHaveBeenCalledTimes(2)
  })

  it('fully synchronizes board projections without touching unrelated queries', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const boardQueryFns = [
      [BOARD_QUERY_KEY],
      [BUCKETS_QUERY_KEY],
      [CATEGORIES_QUERY_KEY],
      [MIGRATION_STEP_QUERY_KEY],
      [TAGS_QUERY_KEY],
      [TODOS_QUERY_KEY, 10],
    ].map((queryKey) => ({ queryFn: vi.fn().mockResolvedValue(queryKey), queryKey, staleTime: Infinity }))
    const unrelatedQuery = {
      queryFn: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
      queryKey: ['user-session'],
      staleTime: Infinity,
    }

    await Promise.all(boardQueryFns.map((options) => queryClient.fetchQuery(options)))
    await queryClient.fetchQuery(unrelatedQuery)

    await cache.sync({ type: 'all' })

    await Promise.all(boardQueryFns.map((options) => queryClient.fetchQuery(options)))
    await queryClient.fetchQuery(unrelatedQuery)

    for (const { queryFn } of boardQueryFns) {
      expect(queryFn).toHaveBeenCalledTimes(2)
    }
    expect(unrelatedQuery.queryFn).toHaveBeenCalledTimes(1)
  })

  it('falls back to a board-only full synchronization for an unknown scope', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const boardQuery = {
      queryFn: vi.fn().mockResolvedValue({ status: 'ready' }),
      queryKey: [BOARD_QUERY_KEY],
      staleTime: Infinity,
    }
    const unrelatedQuery = {
      queryFn: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
      queryKey: ['user-session'],
      staleTime: Infinity,
    }

    await Promise.all([queryClient.fetchQuery(boardQuery), queryClient.fetchQuery(unrelatedQuery)])

    await cache.sync({ type: 'unknown' } as never)

    await Promise.all([queryClient.fetchQuery(boardQuery), queryClient.fetchQuery(unrelatedQuery)])

    expect(boardQuery.queryFn).toHaveBeenCalledTimes(2)
    expect(unrelatedQuery.queryFn).toHaveBeenCalledTimes(1)
  })

  it('synchronizes one named board scope without invalidating another', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const categoriesQuery = {
      queryFn: vi.fn().mockResolvedValue([]),
      queryKey: [CATEGORIES_QUERY_KEY],
      staleTime: Infinity,
    }
    const tagsQuery = {
      queryFn: vi.fn().mockResolvedValue([]),
      queryKey: [TAGS_QUERY_KEY],
      staleTime: Infinity,
    }

    await Promise.all([queryClient.fetchQuery(categoriesQuery), queryClient.fetchQuery(tagsQuery)])

    await cache.sync({ type: 'categories' })

    await Promise.all([queryClient.fetchQuery(categoriesQuery), queryClient.fetchQuery(tagsQuery)])

    expect(categoriesQuery.queryFn).toHaveBeenCalledTimes(2)
    expect(tagsQuery.queryFn).toHaveBeenCalledTimes(1)
  })

  it('synchronizes the live Migration Step query', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue({ status: 'pending' })
    const observer = new QueryObserver(queryClient, {
      queryFn,
      queryKey: [MIGRATION_STEP_QUERY_KEY],
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()
    await cache.sync({ type: 'migration-step' })

    expect(queryFn).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('cancels an affected fetch before applying an optimistic change', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ title: 'Loaded title' })
    let wasAborted = false
    const queryFn = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<Array<Todo>>((resolve) => {
          signal.addEventListener('abort', () => {
            wasAborted = true
            resolve([{ ...todo, title: 'Stale fetch title' }])
          })
        }),
    )

    queryClient.setQueryData([TODOS_QUERY_KEY, todo.bucketId], [todo])
    const fetching = queryClient
      .fetchQuery({ queryFn, queryKey: [TODOS_QUERY_KEY, todo.bucketId] })
      .catch(() => undefined)

    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledOnce())

    const pendingChange = await cache.begin({
      bucketId: todo.bucketId,
      changes: { title: 'Optimistic title' },
      todoId: todo.id,
      type: 'todo-edited',
    })

    await fetching

    expect(wasAborted).toBe(true)
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, todo.bucketId])).toEqual([{ ...todo, title: 'Optimistic title' }])

    await pendingChange.rollback()
  })

  it('does not create a partial Todo projection for an unloaded Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)

    const pendingChange = await cache.begin({
      bucketId: 10,
      changes: { title: 'Optimistic title' },
      todoId: 1,
      type: 'todo-edited',
    })

    expect(queryClient.getQueryState([TODOS_QUERY_KEY, 10])).toBeUndefined()

    await pendingChange.rollback()

    expect(queryClient.getQueryState([TODOS_QUERY_KEY, 10])).toBeUndefined()
  })

  it('applies a committed Todo creation to a loaded Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const laterTodo = createTodo({ id: 2, position: 2048 })
    const createdTodo = createTodo({ id: 1, position: 1024 })

    queryClient.setQueryData([TODOS_QUERY_KEY, 10], [laterTodo])

    await cache.apply({ todo: createdTodo, type: 'todo-created' })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([createdTodo, laterTodo])
  })

  it('cancels an older Todo fetch before applying a committed edit', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ title: 'Original title' })
    const canonicalTodo = { ...todo, title: 'Committed title' }
    let wasAborted = false
    let finishFetch: ((todos: Array<Todo>) => void) | undefined
    const queryFn = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<Array<Todo>>((resolve) => {
          finishFetch = resolve
          signal.addEventListener('abort', () => {
            wasAborted = true
            resolve([{ ...todo, title: 'Stale fetch title' }])
          })
        }),
    )

    queryClient.setQueryData([TODOS_QUERY_KEY, 10], [todo])
    const fetching = queryClient.fetchQuery({ queryFn, queryKey: [TODOS_QUERY_KEY, 10] }).catch(() => undefined)
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledOnce())

    await cache.apply({ previousBucketId: 10, todo: canonicalTodo, type: 'todo-updated' })
    finishFetch?.([{ ...todo, title: 'Stale fetch title' }])
    await fetching

    expect(wasAborted).toBe(true)
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([canonicalTodo])
  })

  it('applies a committed Todo deletion to its previous Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const deletedTodo = createTodo({ id: 1 })
    const remainingTodo = createTodo({ id: 2 })

    queryClient.setQueryData([TODOS_QUERY_KEY, 10], [deletedTodo, remainingTodo])

    await cache.apply({ previousBucketId: 10, todoId: deletedTodo.id, type: 'todo-deleted' })

    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 10])).toEqual([remainingTodo])
  })

  it('fully synchronizes board data after receiving a malformed committed change', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue({ status: 'ready' })
    const observer = new QueryObserver(queryClient, {
      queryFn,
      queryKey: [BOARD_QUERY_KEY],
    })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    await cache.apply({ type: 'todo-updated' } as never)

    expect(queryFn).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('fully synchronizes board data when a committed move omits an affected Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue({ status: 'ready' })
    const observer = new QueryObserver(queryClient, {
      queryFn,
      queryKey: [BOARD_QUERY_KEY],
    })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    await cache.apply({
      affectedBucketIds: [],
      positions: [],
      sourceBucketId: 10,
      todo: createTodo({ bucketId: 20 }),
      type: 'todo-moved',
    })

    expect(queryFn).toHaveBeenCalledTimes(2)

    unsubscribe()
  })
})

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

function createTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    bucketId: 10,
    category: null,
    categoryId: null,
    completed: false,
    createdAt: new Date('2026-09-20T08:00:00.000Z'),
    description: '',
    id: 1,
    position: 1024,
    tags: [],
    title: 'Todo',
    ...overrides,
  }
}
