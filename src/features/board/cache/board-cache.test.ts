import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { createBoardCache } from '@/features/board/cache'
import type { CanonicalBoard } from '@/features/board/cache'
import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import type { Bucket } from '@/lib/types/Bucket'
import type { Todo } from '@/lib/types/Todo'

describe('board cache', () => {
  it('rolls back a deterministic optimistic Todo edit', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ id: 1, title: 'Original title' })

    queryClient.setQueryData(boardCacheKeys.todos(todo.bucketId), [todo])

    const pendingChange = await cache.begin({
      bucketId: todo.bucketId,
      changes: { title: 'Optimistic title' },
      todoId: todo.id,
      type: 'todo-edited',
    })

    expect(queryClient.getQueryData(boardCacheKeys.todos(todo.bucketId))).toEqual([
      { ...todo, title: 'Optimistic title' },
    ])

    await pendingChange.rollback()

    expect(queryClient.getQueryData(boardCacheKeys.todos(todo.bucketId))).toEqual([todo])
  })

  it('confirms an optimistic edit with the canonical Todo', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ id: 1, title: 'Original title' })
    const canonicalTodo = createTodo({ id: 1, title: 'Server title' })

    queryClient.setQueryData(boardCacheKeys.todos(todo.bucketId), [todo])

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

    expect(queryClient.getQueryData(boardCacheKeys.todos(todo.bucketId))).toEqual([canonicalTodo])
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
      queryKey: boardCacheKeys.todos(10),
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

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual(canonicalTodos)
    expect(queryFn).toHaveBeenCalledTimes(2)

    unsubscribe()
  })

  it('rolls back an optimistic Todo move across Buckets', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 10, id: 1, position: 1024 })
    const destinationTodo = createTodo({ bucketId: 20, id: 2, position: 1024 })

    queryClient.setQueryData(boardCacheKeys.todos(10), [movedTodo])
    queryClient.setQueryData(boardCacheKeys.todos(20), [destinationTodo])

    const pendingChange = await cache.begin({
      beforeTodoId: destinationTodo.id,
      sourceBucketId: 10,
      targetBucketId: 20,
      todoId: movedTodo.id,
      type: 'todo-moved',
    })

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([
      destinationTodo,
      { ...movedTodo, bucketId: 20 },
    ])

    await pendingChange.rollback()

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([movedTodo])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([destinationTodo])
  })

  it('confirms an optimistic Todo move with canonical positions', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 10, id: 1, position: 1024 })
    const firstTodo = createTodo({ bucketId: 20, id: 2, position: 1024 })
    const lastTodo = createTodo({ bucketId: 20, id: 3, position: 3072 })
    const canonicalMovedTodo = { ...movedTodo, bucketId: 20 }

    queryClient.setQueryData(boardCacheKeys.todos(10), [movedTodo])
    queryClient.setQueryData(boardCacheKeys.todos(20), [firstTodo, lastTodo])

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

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([
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

    queryClient.setQueryData(boardCacheKeys.todos(10), [{ ...movedTodo, bucketId: 10 }])
    queryClient.setQueryData(boardCacheKeys.todos(20), [lastTodo, firstTodo])

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

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([
      { ...firstTodo, position: 0 },
      movedTodo,
      { ...lastTodo, position: 2048 },
    ])
  })

  it('does not create a partial destination projection for a committed Todo move', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 20, id: 1 })

    queryClient.setQueryData(boardCacheKeys.todos(10), [{ ...movedTodo, bucketId: 10 }])

    await cache.apply({
      affectedBucketIds: [10, 20],
      positions: [],
      sourceBucketId: 10,
      todo: movedTodo,
      type: 'todo-moved',
    })

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([])
    expect(queryClient.getQueryState(boardCacheKeys.todos(20))).toBeUndefined()
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
      queryKey: boardCacheKeys.todos(20),
    })
    const boardObserver = new QueryObserver(queryClient, {
      queryFn: boardQueryFn,
      queryKey: boardCacheKeys.board(),
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
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual(canonicalTodos)

    unsubscribe()
    unsubscribeBoard()
  })

  it('marks an inactive Todo projection stale without fetching it immediately', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue([createTodo()])
    const queryOptions = {
      queryFn,
      queryKey: boardCacheKeys.todos(10),
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
      boardCacheKeys.board(),
      boardCacheKeys.categories(),
      boardCacheKeys.migrationStep(20),
      boardCacheKeys.tags(),
      boardCacheKeys.todos(10),
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
      queryKey: boardCacheKeys.board(),
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
      queryKey: boardCacheKeys.categories(),
      staleTime: Infinity,
    }
    const tagsQuery = {
      queryFn: vi.fn().mockResolvedValue([]),
      queryKey: boardCacheKeys.tags(),
      staleTime: Infinity,
    }

    await Promise.all([queryClient.fetchQuery(categoriesQuery), queryClient.fetchQuery(tagsQuery)])

    await cache.sync({ type: 'categories' })

    await Promise.all([queryClient.fetchQuery(categoriesQuery), queryClient.fetchQuery(tagsQuery)])

    expect(categoriesQuery.queryFn).toHaveBeenCalledTimes(2)
    expect(tagsQuery.queryFn).toHaveBeenCalledTimes(1)
  })

  it('synchronizes only the live Migration Step of the named source Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const [sourceObserver, otherObserver] = [20, 21].map(
      (sourceBucketId) =>
        new QueryObserver(queryClient, {
          queryFn: vi.fn().mockResolvedValue({ sourceBucketId }),
          queryKey: boardCacheKeys.migrationStep(sourceBucketId),
          staleTime: Infinity,
        }),
    )
    const unsubscribes = [sourceObserver, otherObserver].map((observer) => observer.subscribe(() => undefined))

    await Promise.all([sourceObserver.refetch(), otherObserver.refetch()])
    await cache.sync({ sourceBucketId: 20, type: 'migration-step' })

    expect(sourceObserver.options.queryFn).toHaveBeenCalledTimes(2)
    expect(otherObserver.options.queryFn).toHaveBeenCalledTimes(1)

    for (const unsubscribe of unsubscribes) {
      unsubscribe()
    }
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

    queryClient.setQueryData(boardCacheKeys.todos(todo.bucketId), [todo])
    const fetching = queryClient
      .fetchQuery({ queryFn, queryKey: boardCacheKeys.todos(todo.bucketId) })
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
    expect(queryClient.getQueryData(boardCacheKeys.todos(todo.bucketId))).toEqual([
      { ...todo, title: 'Optimistic title' },
    ])

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

    expect(queryClient.getQueryState(boardCacheKeys.todos(10))).toBeUndefined()

    await pendingChange.rollback()

    expect(queryClient.getQueryState(boardCacheKeys.todos(10))).toBeUndefined()
  })

  it('applies a committed Todo creation to a loaded Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const laterTodo = createTodo({ id: 2, position: 2048 })
    const createdTodo = createTodo({ id: 1, position: 1024 })

    queryClient.setQueryData(boardCacheKeys.todos(10), [laterTodo])

    await cache.apply({ todo: createdTodo, type: 'todo-created' })

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([createdTodo, laterTodo])
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

    queryClient.setQueryData(boardCacheKeys.todos(10), [todo])
    const fetching = queryClient.fetchQuery({ queryFn, queryKey: boardCacheKeys.todos(10) }).catch(() => undefined)
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledOnce())

    await cache.apply({ previousBucketId: 10, todo: canonicalTodo, type: 'todo-updated' })
    finishFetch?.([{ ...todo, title: 'Stale fetch title' }])
    await fetching

    expect(wasAborted).toBe(true)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([canonicalTodo])
  })

  it('applies a committed Todo deletion to its previous Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const deletedTodo = createTodo({ id: 1 })
    const remainingTodo = createTodo({ id: 2 })

    queryClient.setQueryData(boardCacheKeys.todos(10), [deletedTodo, remainingTodo])

    await cache.apply({ previousBucketId: 10, todoId: deletedTodo.id, type: 'todo-deleted' })

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([remainingTodo])
  })

  it('removes an updated Todo from its previous Bucket without creating an unloaded destination', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ bucketId: 10 })

    queryClient.setQueryData(boardCacheKeys.todos(10), [todo])

    await cache.apply({ previousBucketId: 10, todo: { ...todo, bucketId: 20 }, type: 'todo-updated' })

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([])
    expect(queryClient.getQueryState(boardCacheKeys.todos(20))).toBeUndefined()
  })

  it('does not create a Todo projection when deleting from an unloaded Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)

    await cache.apply({ previousBucketId: 10, todoId: 1, type: 'todo-deleted' })

    expect(queryClient.getQueryState(boardCacheKeys.todos(10))).toBeUndefined()
  })

  it('fully synchronizes board data after receiving a malformed committed change', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue({ status: 'ready' })
    const observer = new QueryObserver(queryClient, {
      queryFn,
      queryKey: boardCacheKeys.board(),
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
      queryKey: boardCacheKeys.board(),
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

describe('board cache failure reconciliation', () => {
  it('restores the snapshot and refetches affected Buckets after a conflicting optimistic change', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ title: 'Original title' })
    const canonicalTodos = [{ ...todo, title: 'Server title' }]
    const queryFn = vi.fn().mockResolvedValueOnce([todo]).mockResolvedValue(canonicalTodos)
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.todos(10) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    const pendingChange = await cache.begin({
      bucketId: 10,
      changes: { title: 'Optimistic title' },
      todoId: todo.id,
      type: 'todo-edited',
    })

    await expect(pendingChange.rollback(new Response(null, { status: 409 }))).resolves.toBe('conflict')

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual(canonicalTodos)

    unsubscribe()
  })

  it('fully synchronizes board data after an optimistic change with an uncertain outcome', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ completed: false })
    const boardQueryFn = vi.fn().mockResolvedValue({ status: 'ready' })
    const boardObserver = new QueryObserver(queryClient, { queryFn: boardQueryFn, queryKey: boardCacheKeys.board() })
    const unsubscribe = boardObserver.subscribe(() => undefined)

    await boardObserver.refetch()
    queryClient.setQueryData(boardCacheKeys.todos(10), [todo])

    const pendingChange = await cache.begin({
      bucketId: 10,
      changes: { completed: true },
      todoId: todo.id,
      type: 'todo-edited',
    })

    await expect(pendingChange.rollback(new TypeError('Failed to fetch'))).resolves.toBe('uncertain')

    expect(boardQueryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([todo])

    unsubscribe()
  })

  it('only restores the snapshot after the server rejects an optimistic change', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ completed: false })
    const queryFn = vi.fn().mockResolvedValue([todo])
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.todos(10) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    const pendingChange = await cache.begin({
      bucketId: 10,
      changes: { completed: true },
      todoId: todo.id,
      type: 'todo-edited',
    })

    await expect(pendingChange.rollback(new Response(null, { status: 400 }))).resolves.toBe('rejected')

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([todo])

    unsubscribe()
  })

  it('refetches the named Buckets after a non-optimistic mutation conflicts', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo()
    const queryFn = vi.fn().mockResolvedValueOnce([todo]).mockResolvedValue([])
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.todos(10) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    await expect(cache.recover(new Response(null, { status: 404 }), { bucketIds: [10], type: 'todos' })).resolves.toBe(
      'conflict',
    )

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([])

    unsubscribe()
  })
})

describe('board cache lifecycle consequences', () => {
  it('writes the canonical board and removes Todo projections for retired Buckets', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const activeTodo = createTodo({ bucketId: 10, id: 1 })
    const retiredTodo = createTodo({ bucketId: 11, id: 2 })
    const board = createBoard({ buckets: [createBucket({ id: 10 }), createBucket({ id: 12, period: '2026-09-21' })] })

    queryClient.setQueryData(boardCacheKeys.todos(10), [activeTodo])
    queryClient.setQueryData(boardCacheKeys.todos(11), [retiredTodo])

    await cache.apply({ board, type: 'lifecycle-committed' })

    expect(queryClient.getQueryData(boardCacheKeys.board())).toEqual(board)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([activeTodo])
    expect(queryClient.getQueryState(boardCacheKeys.todos(11))).toBeUndefined()
  })

  it('removes Migration Steps whose source Bucket is no longer pending', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const board: CanonicalBoard = {
      ...createBoard(),
      completionRecap: undefined,
      pendingMigrationBuckets: [createBucket({ id: 21, period: '2026-W38', type: 'weekly' })],
      status: 'migration_required',
    }

    queryClient.setQueryData(boardCacheKeys.migrationStep(20), { sourceBucketId: 20 })
    queryClient.setQueryData(boardCacheKeys.migrationStep(21), { sourceBucketId: 21 })

    await cache.apply({ board, type: 'lifecycle-committed' })

    expect(queryClient.getQueryState(boardCacheKeys.migrationStep(20))).toBeUndefined()
    expect(queryClient.getQueryData(boardCacheKeys.migrationStep(21))).toEqual({ sourceBucketId: 21 })
  })

  it('invalidates a confirmed Migration Step while keeping it on screen without refetching its retired source', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue({ sourceBucketId: 20 })
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.migrationStep(20) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()
    await cache.apply({
      board: createBoard(),
      destinationBucketIds: [10],
      sourceBucketId: 20,
      type: 'migration-step-confirmed',
    })

    expect(queryClient.getQueryData(boardCacheKeys.migrationStep(20))).toEqual({ sourceBucketId: 20 })
    expect(queryClient.getQueryState(boardCacheKeys.migrationStep(20))?.isInvalidated).toBe(true)
    expect(queryFn).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('refetches destination Todos and refreshes the remaining Migration Steps after a Migration Step commits', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 10, id: 7 })
    const destinationQueryFn = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([movedTodo])
    const nextStepQueryFn = vi.fn().mockResolvedValue({ sourceBucketId: 21 })
    const observers = [
      new QueryObserver(queryClient, { queryFn: destinationQueryFn, queryKey: boardCacheKeys.todos(10) }),
      new QueryObserver(queryClient, {
        queryFn: nextStepQueryFn,
        queryKey: boardCacheKeys.migrationStep(21),
        staleTime: Infinity,
      }),
    ]
    const unsubscribes = observers.map((observer) => observer.subscribe(() => undefined))
    const board: CanonicalBoard = {
      ...createBoard({
        buckets: [createBucket({ id: 10 }), createBucket({ id: 12, period: '2026-W38', type: 'weekly' })],
      }),
      completionRecap: undefined,
      pendingMigrationBuckets: [createBucket({ id: 21, period: '2026-09', type: 'monthly' })],
      status: 'migration_required',
    }

    await Promise.all(observers.map((observer) => observer.refetch()))
    queryClient.setQueryData(boardCacheKeys.todos(20), [createTodo({ bucketId: 20, id: 7 })])
    queryClient.setQueryData(boardCacheKeys.migrationStep(20), { sourceBucketId: 20 })

    await cache.apply({ board, destinationBucketIds: [10, 12], sourceBucketId: 20, type: 'migration-step-confirmed' })

    expect(queryClient.getQueryData(boardCacheKeys.board())).toEqual(board)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([movedTodo])
    expect(queryClient.getQueryState(boardCacheKeys.todos(12))).toBeUndefined()
    expect(queryClient.getQueryState(boardCacheKeys.todos(20))).toBeUndefined()
    expect(queryClient.getQueryState(boardCacheKeys.migrationStep(20))).toBeUndefined()
    expect(nextStepQueryFn).toHaveBeenCalledTimes(2)

    for (const unsubscribe of unsubscribes) {
      unsubscribe()
    }
  })

  it.each([{ type: 'board' }, { type: 'all' }] as const)(
    'removes retired Todo projections after a $type synchronization refetches the board',
    async (scope) => {
      const queryClient = createQueryClient()
      const cache = createBoardCache(queryClient)
      const refetchedBoard = createBoard({ buckets: [createBucket({ id: 12, period: '2026-09-21' })] })
      const observer = new QueryObserver(queryClient, {
        queryFn: vi.fn().mockResolvedValueOnce(createBoard()).mockResolvedValue(refetchedBoard),
        queryKey: boardCacheKeys.board(),
      })
      const unsubscribe = observer.subscribe(() => undefined)

      await observer.refetch()
      queryClient.setQueryData(boardCacheKeys.todos(10), [createTodo()])

      await cache.sync(scope)

      expect(queryClient.getQueryData(boardCacheKeys.board())).toEqual(refetchedBoard)
      expect(queryClient.getQueryState(boardCacheKeys.todos(10))).toBeUndefined()

      unsubscribe()
    },
  )

  it('fully synchronizes board data after receiving a malformed lifecycle consequence', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const queryFn = vi.fn().mockResolvedValue([createTodo()])
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.todos(10) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()
    await cache.apply({ board: { status: 'ready' }, type: 'lifecycle-committed' } as never)

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryState(boardCacheKeys.board())).toBeUndefined()

    unsubscribe()
  })

  it('refetches the board and the stale Migration Step after a Migration Step conflicts', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const [boardObserver, stepObserver, otherStepObserver] = [
      boardCacheKeys.board(),
      boardCacheKeys.migrationStep(20),
      boardCacheKeys.migrationStep(21),
    ].map(
      (queryKey) =>
        new QueryObserver<unknown>(queryClient, {
          queryFn: vi.fn().mockResolvedValue(null),
          queryKey,
          staleTime: Infinity,
        }),
    )
    const observers = [boardObserver, stepObserver, otherStepObserver]
    const unsubscribes = observers.map((observer) => observer.subscribe(() => undefined))

    await Promise.all(observers.map((observer) => observer.refetch()))

    await expect(
      cache.recover(new Response(null, { status: 409 }), [
        { type: 'board' },
        { sourceBucketId: 20, type: 'migration-step' },
      ]),
    ).resolves.toBe('conflict')

    expect(boardObserver.options.queryFn).toHaveBeenCalledTimes(2)
    expect(stepObserver.options.queryFn).toHaveBeenCalledTimes(2)
    expect(otherStepObserver.options.queryFn).toHaveBeenCalledTimes(1)

    for (const unsubscribe of unsubscribes) {
      unsubscribe()
    }
  })
})

describe('board cache overlapping optimistic changes', () => {
  it('keeps a pending toggle visible when an earlier toggle of the same Todo confirms', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ completed: false })

    queryClient.setQueryData(boardCacheKeys.todos(10), [todo])

    const firstToggle = await cache.begin({
      bucketId: 10,
      changes: { completed: true },
      todoId: todo.id,
      type: 'todo-edited',
    })
    await cache.begin({ bucketId: 10, changes: { completed: false }, todoId: todo.id, type: 'todo-edited' })

    await firstToggle.confirm({ previousBucketId: 10, todo: { ...todo, completed: true }, type: 'todo-updated' })

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([{ ...todo, completed: false }])
  })

  it('refetches shared Buckets once after the last overlapping change settles', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const movedTodo = createTodo({ bucketId: 10, id: 1, position: 1024 })
    const canonicalMovedTodo = { ...movedTodo, bucketId: 20 }
    const staleMovedTodo = { ...canonicalMovedTodo, completed: false }
    const sourceQueryFn = vi.fn().mockResolvedValueOnce([movedTodo]).mockResolvedValue([])
    const targetQueryFn = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ ...canonicalMovedTodo, completed: true }])
    const sourceObserver = new QueryObserver(queryClient, {
      queryFn: sourceQueryFn,
      queryKey: boardCacheKeys.todos(10),
    })
    const targetObserver = new QueryObserver(queryClient, {
      queryFn: targetQueryFn,
      queryKey: boardCacheKeys.todos(20),
    })
    const unsubscribeSource = sourceObserver.subscribe(() => undefined)
    const unsubscribeTarget = targetObserver.subscribe(() => undefined)

    await Promise.all([sourceObserver.refetch(), targetObserver.refetch()])

    const move = await cache.begin({ sourceBucketId: 10, targetBucketId: 20, todoId: movedTodo.id, type: 'todo-moved' })
    const toggle = await cache.begin({
      bucketId: 20,
      changes: { completed: true },
      todoId: movedTodo.id,
      type: 'todo-edited',
    })

    await toggle.confirm({
      previousBucketId: 20,
      todo: { ...canonicalMovedTodo, completed: true },
      type: 'todo-updated',
    })

    expect(targetQueryFn).toHaveBeenCalledTimes(1)

    // The move committed before the toggle, but its response arrives last with an older Todo.
    await move.confirm({
      affectedBucketIds: [10, 20],
      positions: [],
      sourceBucketId: 10,
      todo: staleMovedTodo,
      type: 'todo-moved',
    })

    expect(sourceQueryFn).toHaveBeenCalledTimes(2)
    expect(targetQueryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([{ ...canonicalMovedTodo, completed: true }])

    unsubscribeSource()
    unsubscribeTarget()
  })

  it('keeps a pending change visible when an overlapping conflict refetches its Bucket', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const firstTodo = createTodo({ id: 1, title: 'First' })
    const secondTodo = createTodo({ completed: false, id: 2, position: 2048 })
    const queryFn = vi.fn().mockResolvedValue([firstTodo, secondTodo])
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.todos(10) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    const rename = await cache.begin({ bucketId: 10, changes: { title: 'Renamed' }, todoId: 1, type: 'todo-edited' })
    await cache.begin({ bucketId: 10, changes: { completed: true }, todoId: 2, type: 'todo-edited' })

    await rename.rollback(new Response(null, { status: 409 }))

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([firstTodo, { ...secondTodo, completed: true }])

    unsubscribe()
  })

  it('repairs an inactive Bucket after an overlapping mutation is rejected', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const firstTodo = createTodo({ id: 1, title: 'First' })
    const secondTodo = createTodo({ completed: false, id: 2, position: 2048 })
    const canonicalTodos = [firstTodo, { ...secondTodo, completed: true }]
    const queryFn = vi.fn().mockResolvedValueOnce([firstTodo, secondTodo]).mockResolvedValue(canonicalTodos)
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.todos(10) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()
    unsubscribe()

    const rejectedChange = await cache.begin({
      bucketId: 10,
      changes: { title: 'Optimistic title' },
      todoId: firstTodo.id,
      type: 'todo-edited',
    })
    const confirmedChange = await cache.begin({
      bucketId: 10,
      changes: { completed: true },
      todoId: secondTodo.id,
      type: 'todo-edited',
    })

    await confirmedChange.confirm({ previousBucketId: 10, todo: canonicalTodos[1], type: 'todo-updated' })
    await rejectedChange.rollback(new Response(null, { status: 400 }))

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual(canonicalTodos)
  })

  it('does not refetch after optimistic changes that settle one after another', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const todo = createTodo({ completed: false })
    const queryFn = vi.fn().mockResolvedValue([todo])
    const observer = new QueryObserver(queryClient, { queryFn, queryKey: boardCacheKeys.todos(10) })
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    const firstToggle = await cache.begin({
      bucketId: 10,
      changes: { completed: true },
      todoId: todo.id,
      type: 'todo-edited',
    })
    await firstToggle.confirm({ previousBucketId: 10, todo: { ...todo, completed: true }, type: 'todo-updated' })
    const secondToggle = await cache.begin({
      bucketId: 10,
      changes: { completed: false },
      todoId: todo.id,
      type: 'todo-edited',
    })
    await secondToggle.confirm({ previousBucketId: 10, todo, type: 'todo-updated' })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([todo])

    unsubscribe()
  })
})

describe('board cache taxonomy consequences', () => {
  it('upserts a saved Category into the loaded Categories in name order', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const home = { colorKey: 'blue', id: 1, name: 'Home' } as const
    const work = { colorKey: 'green', id: 2, name: 'Work' } as const

    queryClient.setQueryData(boardCacheKeys.categories(), [work])

    await cache.apply({ category: home, type: 'category-saved' })
    await cache.apply({ category: { ...work, name: 'Admin' }, type: 'category-saved' })

    expect(queryClient.getQueryData(boardCacheKeys.categories())).toEqual([{ ...work, name: 'Admin' }, home])
  })

  it('does not create a partial Categories projection when none is loaded', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)

    await cache.apply({ category: { colorKey: 'blue', id: 1, name: 'Home' }, type: 'category-saved' })

    expect(queryClient.getQueryState(boardCacheKeys.categories())).toBeUndefined()
  })

  it('patches a saved Category into every loaded Todo projection that displays it', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const work = { colorKey: 'green', id: 2, name: 'Work' } as const
    const home = { colorKey: 'blue', id: 1, name: 'Home' } as const
    const workTodo = createTodo({ bucketId: 10, category: work, categoryId: work.id, id: 1 })
    const homeTodo = createTodo({ bucketId: 10, category: home, categoryId: home.id, id: 2, position: 2048 })
    const laterWorkTodo = createTodo({ bucketId: 20, category: work, categoryId: work.id, id: 3 })
    const renamedWork = { colorKey: 'red', id: 2, name: 'Office' } as const

    queryClient.setQueryData(boardCacheKeys.todos(10), [workTodo, homeTodo])
    queryClient.setQueryData(boardCacheKeys.todos(20), [laterWorkTodo])

    await cache.apply({ category: renamedWork, type: 'category-saved' })

    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([
      { ...workTodo, category: renamedWork },
      homeTodo,
    ])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([{ ...laterWorkTodo, category: renamedWork }])
    expect(queryClient.getQueryState(boardCacheKeys.todos(30))).toBeUndefined()
  })

  it('removes a deleted Category from the Categories and every Todo that displayed it', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const work = { colorKey: 'green', id: 2, name: 'Work' } as const
    const home = { colorKey: 'blue', id: 1, name: 'Home' } as const
    const workTodo = createTodo({ bucketId: 10, category: work, categoryId: work.id, id: 1 })
    const homeTodo = createTodo({ bucketId: 20, category: home, categoryId: home.id, id: 2 })

    queryClient.setQueryData(boardCacheKeys.categories(), [home, work])
    queryClient.setQueryData(boardCacheKeys.todos(10), [workTodo])
    queryClient.setQueryData(boardCacheKeys.todos(20), [homeTodo])

    await cache.apply({ categoryId: work.id, type: 'category-deleted' })

    expect(queryClient.getQueryData(boardCacheKeys.categories())).toEqual([home])
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([
      { ...workTodo, category: null, categoryId: null },
    ])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([homeTodo])
  })

  it('upserts a saved Tag into the loaded Tags and every Todo that displays it, in name order', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const urgent = { colorKey: 'red', id: 1, name: 'Urgent' } as const
    const calls = { colorKey: 'blue', id: 2, name: 'Calls' } as const
    const renamedUrgent = { colorKey: 'orange', id: 1, name: 'ASAP' } as const
    const taggedTodo = createTodo({ bucketId: 10, id: 1, tags: [calls, urgent] })
    const laterTaggedTodo = createTodo({ bucketId: 20, id: 2, tags: [urgent] })

    queryClient.setQueryData(boardCacheKeys.tags(), [calls, urgent])
    queryClient.setQueryData(boardCacheKeys.todos(10), [taggedTodo])
    queryClient.setQueryData(boardCacheKeys.todos(20), [laterTaggedTodo])

    await cache.apply({ tag: renamedUrgent, type: 'tag-saved' })

    expect(queryClient.getQueryData(boardCacheKeys.tags())).toEqual([renamedUrgent, calls])
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([
      { ...taggedTodo, tags: [renamedUrgent, calls] },
    ])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([{ ...laterTaggedTodo, tags: [renamedUrgent] }])
  })

  it('removes a deleted Tag from the Tags and every Todo that displayed it', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const urgent = { colorKey: 'red', id: 1, name: 'Urgent' } as const
    const calls = { colorKey: 'blue', id: 2, name: 'Calls' } as const
    const taggedTodo = createTodo({ bucketId: 10, id: 1, tags: [calls, urgent] })
    const laterTaggedTodo = createTodo({ bucketId: 20, id: 2, tags: [urgent] })

    queryClient.setQueryData(boardCacheKeys.tags(), [calls, urgent])
    queryClient.setQueryData(boardCacheKeys.todos(10), [taggedTodo])
    queryClient.setQueryData(boardCacheKeys.todos(20), [laterTaggedTodo])

    await cache.apply({ tagId: urgent.id, type: 'tag-deleted' })

    expect(queryClient.getQueryData(boardCacheKeys.tags())).toEqual([calls])
    expect(queryClient.getQueryData(boardCacheKeys.todos(10))).toEqual([{ ...taggedTodo, tags: [calls] }])
    expect(queryClient.getQueryData(boardCacheKeys.todos(20))).toEqual([{ ...laterTaggedTodo, tags: [] }])
  })

  it('refetches a Todo projection whose fetch may have read the Category before it changed', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const work = { colorKey: 'green', id: 2, name: 'Work' } as const
    const renamedWork = { colorKey: 'red', id: 2, name: 'Office' } as const
    const todo = createTodo({ category: work, categoryId: work.id })
    let resolveStaleFetch: (todos: Array<Todo>) => void = () => undefined
    const queryFn = vi
      .fn<() => Promise<Array<Todo>>>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveStaleFetch = resolve)))
      .mockResolvedValue([{ ...todo, category: renamedWork }])

    queryClient.setQueryData(boardCacheKeys.todos(todo.bucketId), [todo])
    const unsubscribe = new QueryObserver(queryClient, {
      queryFn,
      queryKey: boardCacheKeys.todos(todo.bucketId),
      staleTime: Infinity,
    }).subscribe(() => undefined)
    void queryClient.refetchQueries({ queryKey: boardCacheKeys.todos(todo.bucketId) })
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledOnce())

    await cache.apply({ category: renamedWork, type: 'category-saved' })
    resolveStaleFetch([todo])

    await vi.waitFor(() =>
      expect(queryClient.getQueryState(boardCacheKeys.todos(todo.bucketId))?.fetchStatus).toBe('idle'),
    )
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(boardCacheKeys.todos(todo.bucketId))).toEqual([{ ...todo, category: renamedWork }])

    unsubscribe()
  })

  describe.each(['category', 'tag'] as const)('%s fetches crossing a commit', (taxonomy) => {
    it.each([
      { active: true, loaded: false, projection: 'todos' },
      { active: true, loaded: false, projection: 'taxonomy' },
      { active: false, loaded: false, projection: 'todos' },
      { active: false, loaded: false, projection: 'taxonomy' },
      { active: false, loaded: true, projection: 'todos' },
      { active: false, loaded: true, projection: 'taxonomy' },
    ] as const)(
      'protects $projection with active=$active and loaded=$loaded from a pre-commit response',
      async ({ active, loaded, projection }) => {
        const queryClient = createQueryClient()
        const cache = createBoardCache(queryClient)
        const entry = { colorKey: 'green', id: 2, name: 'Work' } as const
        const renamedEntry = { ...entry, name: 'Office' }
        const todo = createTodo(taxonomy === 'category' ? { category: entry, categoryId: entry.id } : { tags: [entry] })
        const updatedTodo =
          taxonomy === 'category' ? { ...todo, category: renamedEntry } : { ...todo, tags: [renamedEntry] }
        const queryKey =
          projection === 'todos'
            ? boardCacheKeys.todos(todo.bucketId)
            : taxonomy === 'category'
              ? boardCacheKeys.categories()
              : boardCacheKeys.tags()
        const staleData = projection === 'todos' ? [todo] : [entry]
        const canonicalData = projection === 'todos' ? [updatedTodo] : [renamedEntry]
        let resolveStaleFetch: (data: Array<unknown>) => void = () => undefined
        // Deliberately ignores AbortSignal: cancellation must still reject the old result.
        const queryFn = vi
          .fn<() => Promise<Array<unknown>>>()
          .mockImplementationOnce(() => new Promise((resolve) => (resolveStaleFetch = resolve)))
          .mockResolvedValue(canonicalData)
        const options = { queryFn, queryKey, staleTime: Infinity }

        if (loaded) {
          queryClient.setQueryData(queryKey, staleData)
        }

        const observer = new QueryObserver(queryClient, options)
        const unsubscribe = active ? observer.subscribe(() => undefined) : () => undefined
        const staleFetch = queryClient.fetchQuery({ ...options, staleTime: 0 }).catch(() => undefined)
        await vi.waitFor(() => expect(queryFn).toHaveBeenCalledOnce())

        await cache.apply(
          taxonomy === 'category'
            ? { category: renamedEntry, type: 'category-saved' }
            : { tag: renamedEntry, type: 'tag-saved' },
        )
        resolveStaleFetch(staleData)
        await staleFetch
        await Promise.resolve()

        expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle')
        if (active) {
          expect(queryFn).toHaveBeenCalledTimes(2)
          expect(observer.getCurrentResult().status).toBe('success')
          expect(queryClient.getQueryData(queryKey)).toEqual(canonicalData)
          expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false)
        } else {
          expect(queryFn).toHaveBeenCalledOnce()
          expect(queryClient.getQueryData(queryKey)).toEqual(loaded ? canonicalData : undefined)
          expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
          await expect(queryClient.fetchQuery(options)).resolves.toEqual(canonicalData)
          expect(queryFn).toHaveBeenCalledTimes(2)
        }

        unsubscribe()
        queryClient.clear()
      },
    )
  })

  it('keeps a pending Todo edit visible after restarting a fetch for a taxonomy commit', async () => {
    const queryClient = createQueryClient()
    const cache = createBoardCache(queryClient)
    const work = { colorKey: 'green', id: 2, name: 'Work' } as const
    const renamedWork = { ...work, name: 'Office' }
    const todo = createTodo({ category: work, categoryId: work.id })
    let resolveStaleFetch: (todos: Array<Todo>) => void = () => undefined
    const queryFn = vi
      .fn<() => Promise<Array<Todo>>>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveStaleFetch = resolve)))
      .mockResolvedValue([{ ...todo, category: renamedWork }])
    const queryKey = boardCacheKeys.todos(todo.bucketId)
    queryClient.setQueryData(queryKey, [todo])
    const unsubscribe = new QueryObserver(queryClient, { queryFn, queryKey, staleTime: Infinity }).subscribe(
      () => undefined,
    )
    await cache.begin({
      bucketId: todo.bucketId,
      changes: { title: 'Pending title' },
      todoId: todo.id,
      type: 'todo-edited',
    })
    const staleFetch = queryClient.refetchQueries({ exact: true, queryKey })
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledOnce())

    await cache.apply({ category: renamedWork, type: 'category-saved' })
    resolveStaleFetch([todo])
    await staleFetch

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(queryKey)).toEqual([{ ...todo, category: renamedWork, title: 'Pending title' }])

    unsubscribe()
    queryClient.clear()
  })

  it.each([
    { otherTaxonomyKey: boardCacheKeys.tags(), taxonomyKey: boardCacheKeys.categories(), type: 'categories' },
    { otherTaxonomyKey: boardCacheKeys.categories(), taxonomyKey: boardCacheKeys.tags(), type: 'tags' },
  ] as const)(
    'synchronizes the $type with the Todo projections that display them',
    async ({ otherTaxonomyKey, taxonomyKey, type }) => {
      const queryClient = createQueryClient()
      const cache = createBoardCache(queryClient)
      const [taxonomyQuery, todosQuery, otherTaxonomyQuery, boardQuery] = [
        taxonomyKey,
        boardCacheKeys.todos(10),
        otherTaxonomyKey,
        boardCacheKeys.board(),
      ].map((queryKey) => ({ queryFn: vi.fn().mockResolvedValue([]), queryKey, staleTime: Infinity }))
      const queries = [taxonomyQuery, todosQuery, otherTaxonomyQuery, boardQuery]

      await Promise.all(queries.map((query) => queryClient.fetchQuery(query)))

      await cache.sync({ type })

      await Promise.all(queries.map((query) => queryClient.fetchQuery(query)))

      expect(taxonomyQuery.queryFn).toHaveBeenCalledTimes(2)
      expect(todosQuery.queryFn).toHaveBeenCalledTimes(2)
      expect(otherTaxonomyQuery.queryFn).toHaveBeenCalledTimes(1)
      expect(boardQuery.queryFn).toHaveBeenCalledTimes(1)
    },
  )
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

function createBucket(overrides: Partial<Bucket> = {}): Bucket {
  return { id: 10, period: '2026-09-20', type: 'daily', ...overrides }
}

function createBoard(
  overrides: Partial<Extract<CanonicalBoard, { status: 'ready' }>> = {},
): Extract<CanonicalBoard, { status: 'ready' }> {
  return {
    buckets: [createBucket()],
    planningDate: '2026-09-20',
    status: 'ready',
    timeZone: 'Europe/Rome',
    ...overrides,
  }
}
