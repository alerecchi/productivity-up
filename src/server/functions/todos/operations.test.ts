import { describe, expect, it } from 'vitest'

import type { InMemoryTodoState } from '@/test/in-memory-todo-repository'
import { createInMemoryTodoRepository } from '@/test/in-memory-todo-repository'

import type { TodoRepository } from './operations'
import {
  STALE_TODO_POSITIONS_MESSAGE,
  createTodoForUser,
  deleteTodoForUser,
  getTodosForUser,
  moveTodoForUser,
  updateTodoForUser,
} from './operations'
import { CreateTodoInput, MoveTodoInput, UpdateTodoInput } from './schemas'

const USER = 'user-1'
const OTHER_USER = 'user-2'

const DAILY = 1
const MONTHLY = 2
const ARCHIVED = 3
const FOREIGN_BUCKET = 4
const WEEKLY = 7

const HOME = { colorKey: 'blue', id: 5, name: 'home admin', userId: USER } as const
const FOREIGN_CATEGORY = { colorKey: 'teal', id: 6, name: 'secret', userId: OTHER_USER } as const
const URGENT = { colorKey: 'rose', id: 11, name: 'urgent', userId: USER } as const
const FOCUS = { colorKey: 'teal', id: 12, name: 'focus', userId: USER } as const
const FOREIGN_TAG = { colorKey: 'blue', id: 13, name: 'foreign', userId: OTHER_USER } as const

const NOT_FOUND = { code: 'RESOURCE_NOT_FOUND', status: 404 }
const CONFLICT = { code: 'CONFLICT', status: 409 }

const createdAt = new Date('2026-06-11T10:15:00.000Z')

function todo(
  id: number,
  bucketId: number,
  position: number,
  overrides: Partial<InMemoryTodoState['todos'][number]> = {},
) {
  return {
    bucketId,
    categoryId: null,
    completed: false,
    createdAt,
    description: '',
    id,
    position,
    title: `Todo ${id}`,
    userId: USER,
    ...overrides,
  }
}

const BUCKETS: InMemoryTodoState['buckets'] = [
  { id: DAILY, status: 'active', userId: USER },
  { id: MONTHLY, status: 'active', userId: USER },
  { id: ARCHIVED, status: 'archived', userId: USER },
  { id: FOREIGN_BUCKET, status: 'active', userId: OTHER_USER },
  { id: WEEKLY, status: 'active', userId: USER },
]

function setup(state: Partial<InMemoryTodoState> = {}) {
  return createInMemoryTodoRepository({
    buckets: BUCKETS,
    categories: [HOME, FOREIGN_CATEGORY],
    tags: [URGENT, FOCUS, FOREIGN_TAG],
    ...state,
  }).repository
}

/** Runs a competing, already-committed command right after the named read, as a concurrent request would. */
function afterRead<TMethod extends keyof TodoRepository>(
  repository: TodoRepository,
  method: TMethod,
  concurrentCommand: () => Promise<unknown>,
) {
  const read = repository[method] as (...args: Array<unknown>) => Promise<unknown>
  let hasRun = false

  Object.assign(repository, {
    [method]: async (...args: Array<unknown>) => {
      const result = await read(...args)

      if (!hasRun) {
        hasRun = true
        await concurrentCommand()
      }

      return result
    },
  })
}

describe('createTodoForUser', () => {
  it('appends the Todo to the end of the Bucket and returns the canonical Todo with sorted display data', async () => {
    const repository = setup({ todos: [todo(20, DAILY, 2048)] })

    const created = await createTodoForUser({
      data: CreateTodoInput.parse({
        bucketId: DAILY,
        categoryId: HOME.id,
        description: '  Details to remember  ',
        tagIds: [URGENT.id, FOCUS.id],
        title: '  Pay rent  ',
      }),
      now: () => createdAt,
      repository,
      userId: USER,
    })

    expect(created).toEqual({
      bucketId: DAILY,
      category: { colorKey: 'blue', id: HOME.id, name: 'home admin' },
      categoryId: HOME.id,
      completed: false,
      createdAt,
      description: 'Details to remember',
      id: 21,
      position: 3072,
      tags: [
        { colorKey: 'teal', id: FOCUS.id, name: 'focus' },
        { colorKey: 'rose', id: URGENT.id, name: 'urgent' },
      ],
      title: 'Pay rent',
    })
    expect(await repository.listTodos(USER, DAILY)).toEqual([expect.objectContaining({ id: 20 }), created])
  })

  it.each([
    ['a missing Bucket', { bucketId: 99 }],
    ['a foreign Bucket', { bucketId: FOREIGN_BUCKET }],
    ['an archived Bucket', { bucketId: ARCHIVED }],
    ['a missing Category', { categoryId: 99 }],
    ['a foreign Category', { categoryId: FOREIGN_CATEGORY.id }],
    ['a missing Tag', { tagIds: [URGENT.id, 99] }],
    ['a foreign Tag', { tagIds: [URGENT.id, FOREIGN_TAG.id] }],
  ])('rejects %s with the indistinguishable not-found error and creates nothing', async (_, input) => {
    const repository = setup()

    await expect(
      createTodoForUser({ data: { bucketId: DAILY, title: 'Pay rent', ...input }, repository, userId: USER }),
    ).rejects.toMatchObject(NOT_FOUND)
    expect(await repository.listTodos(USER, DAILY)).toEqual([])
  })

  it('requires Migration before creating while a Pending Migration Bucket gates the board', async () => {
    const repository = setup({ buckets: [...BUCKETS, { id: 9, status: 'pending_migration', userId: USER }] })

    await expect(
      createTodoForUser({ data: { bucketId: DAILY, title: 'Pay rent' }, repository, userId: USER }),
    ).rejects.toMatchObject(CONFLICT)
    expect(await repository.listTodos(USER, DAILY)).toEqual([])
  })
})

describe('getTodosForUser', () => {
  it("lists an owned active Bucket's canonical Todos in position order", async () => {
    const repository = setup({ todos: [todo(21, DAILY, 2048), todo(20, DAILY, 1024), todo(22, MONTHLY, 1024)] })

    const todos = await getTodosForUser({ data: { bucketId: DAILY }, repository, userId: USER })

    expect(todos.map(({ id }) => id)).toEqual([20, 21])
    expect(todos[0]).not.toHaveProperty('userId')
  })

  it.each([
    ['missing', 99],
    ['foreign', FOREIGN_BUCKET],
    ['archived', ARCHIVED],
  ])('rejects the %s Bucket with the indistinguishable not-found error', async (_, bucketId) => {
    await expect(getTodosForUser({ data: { bucketId }, repository: setup(), userId: USER })).rejects.toMatchObject(
      NOT_FOUND,
    )
  })
})

describe('updateTodoForUser', () => {
  const taggedTodo = () =>
    setup({
      todoTags: [{ tagId: URGENT.id, todoId: 20 }],
      todos: [todo(20, DAILY, 1024, { categoryId: HOME.id })],
    })

  it('toggles completion and returns the canonical Todo with its unchanged display data and previous Bucket', async () => {
    const repository = taggedTodo()

    const result = await updateTodoForUser({ data: { completed: true, id: 20 }, repository, userId: USER })

    expect(result).toEqual({
      previousBucketId: DAILY,
      todo: {
        ...todo(20, DAILY, 1024, { categoryId: HOME.id, completed: true, userId: undefined }),
        category: { colorKey: 'blue', id: HOME.id, name: 'home admin' },
        tags: [{ colorKey: 'rose', id: URGENT.id, name: 'urgent' }],
      },
    })
    expect(result.todo).not.toHaveProperty('userId')
    expect((await repository.listTodos(USER, DAILY))[0]).toEqual(result.todo)
  })

  it('edits fields and replaces the full Category and Tag set', async () => {
    const repository = taggedTodo()

    const { todo: updated } = await updateTodoForUser({
      data: UpdateTodoInput.parse({
        categoryId: null,
        description: '  New details  ',
        id: 20,
        tagIds: [FOCUS.id],
        title: '  Pay rent early  ',
      }),
      repository,
      userId: USER,
    })

    expect(updated).toMatchObject({
      category: null,
      categoryId: null,
      description: 'New details',
      tags: [{ colorKey: 'teal', id: FOCUS.id, name: 'focus' }],
      title: 'Pay rent early',
    })
    expect((await repository.listTodos(USER, DAILY))[0]).toEqual(updated)
  })

  it('moves the Todo to the end of another owned Bucket and reports the source as its previous Bucket', async () => {
    const repository = setup({ todos: [todo(20, DAILY, 1024), todo(30, MONTHLY, 4096)] })

    const result = await updateTodoForUser({ data: { bucketId: MONTHLY, id: 20 }, repository, userId: USER })

    expect(result.previousBucketId).toBe(DAILY)
    expect(result.todo).toMatchObject({ bucketId: MONTHLY, id: 20, position: 5120 })
    expect(await repository.listTodos(USER, DAILY)).toEqual([])
    expect((await repository.listTodos(USER, MONTHLY)).map(({ id }) => id)).toEqual([30, 20])
  })

  it.each([
    ['a missing Todo', { id: 99 }],
    ['a foreign Todo', { id: 40 }],
    ['a missing Category', { categoryId: 99 }],
    ['a foreign Category', { categoryId: FOREIGN_CATEGORY.id }],
    ['a foreign Tag', { tagIds: [FOREIGN_TAG.id] }],
    ['a foreign destination Bucket', { bucketId: FOREIGN_BUCKET }],
    ['an archived destination Bucket', { bucketId: ARCHIVED }],
  ])('rejects %s with the indistinguishable not-found error and changes nothing', async (_, input) => {
    const repository = setup({
      todos: [todo(20, DAILY, 1024), todo(40, FOREIGN_BUCKET, 1024, { userId: OTHER_USER })],
    })

    await expect(
      updateTodoForUser({ data: { id: 20, title: 'Changed', ...input }, repository, userId: USER }),
    ).rejects.toMatchObject(NOT_FOUND)
    expect(await repository.findTodo(USER, 20)).toMatchObject({
      bucketId: DAILY,
      categoryId: null,
      tags: [],
      title: 'Todo 20',
    })
    expect(await repository.findTodo(OTHER_USER, 40)).toMatchObject({ title: 'Todo 40' })
  })

  it.each([
    [
      'a Pending Migration Bucket gates the board',
      DAILY,
      [...BUCKETS, { id: 9, status: 'pending_migration', userId: USER }],
    ],
    ['the Todo sits in an archived Bucket', ARCHIVED, BUCKETS],
  ] as const)('rejects the edit with a conflict while %s', async (_, bucketId, buckets) => {
    const repository = setup({ buckets: [...buckets], todos: [todo(20, bucketId, 1024)] })

    await expect(
      updateTodoForUser({ data: { id: 20, title: 'Changed' }, repository, userId: USER }),
    ).rejects.toMatchObject(CONFLICT)
    expect(await repository.findTodo(USER, 20)).toMatchObject({ title: 'Todo 20' })
  })

  it('keeps ordinary field edits last-write-wins when a concurrent move relocates the Todo', async () => {
    const repository = setup({ todos: [todo(20, DAILY, 1024)] })
    afterRead(repository, 'findTodo', () =>
      repository.updateTodo({
        changes: {},
        destination: { bucketId: MONTHLY, expectedBucketId: DAILY },
        todoId: 20,
        userId: USER,
      }),
    )

    const result = await updateTodoForUser({ data: { id: 20, title: 'Changed' }, repository, userId: USER })

    expect(result.previousBucketId).toBe(MONTHLY)
    expect(result.todo).toMatchObject({ bucketId: MONTHLY, title: 'Changed' })
    expect(await repository.findTodo(USER, 20)).toMatchObject({ bucketId: MONTHLY, title: 'Changed' })
  })

  it('returns current Tags after a concurrent replacement during an ordinary field edit', async () => {
    const repository = taggedTodo()
    afterRead(repository, 'findTodo', () =>
      repository.updateTodo({ changes: {}, tagIds: [FOCUS.id], todoId: 20, userId: USER }),
    )

    const result = await updateTodoForUser({ data: { id: 20, title: 'Changed' }, repository, userId: USER })

    expect(result.todo).toMatchObject({
      tags: [{ colorKey: 'teal', id: FOCUS.id, name: 'focus' }],
      title: 'Changed',
    })
  })

  it('rejects a Bucket change as stale when a concurrent move already relocated the Todo', async () => {
    const repository = setup({ todos: [todo(20, DAILY, 1024)] })
    afterRead(repository, 'findTodo', () =>
      repository.updateTodo({
        changes: {},
        destination: { bucketId: MONTHLY, expectedBucketId: DAILY },
        todoId: 20,
        userId: USER,
      }),
    )

    await expect(
      updateTodoForUser({ data: { bucketId: WEEKLY, id: 20, title: 'Changed' }, repository, userId: USER }),
    ).rejects.toMatchObject(CONFLICT)
    expect(await repository.findTodo(USER, 20)).toMatchObject({ bucketId: MONTHLY, title: 'Todo 20' })
  })
})

describe('moveTodoForUser', () => {
  const positionsOf = async (repository: TodoRepository, bucketId: number) =>
    (await repository.listPositions(USER, bucketId)).map(({ id, position }) => [id, position])

  it('moves a Todo between adjacent anchors in its Bucket and returns the committed change', async () => {
    const repository = setup({
      todoTags: [{ tagId: URGENT.id, todoId: 10 }],
      todos: [todo(10, DAILY, 1024), todo(11, DAILY, 2048), todo(12, DAILY, 4096)],
    })

    const result = await moveTodoForUser({
      data: MoveTodoInput.parse({ afterTodoId: 12, beforeTodoId: 11, id: 10, targetBucketId: DAILY }),
      repository,
      userId: USER,
    })

    expect(result).toEqual({
      affectedBucketIds: [DAILY],
      positions: [{ bucketId: DAILY, id: 10, position: 3072 }],
      sourceBucketId: DAILY,
      todo: {
        ...todo(10, DAILY, 3072, { userId: undefined }),
        category: null,
        tags: [{ colorKey: 'rose', id: URGENT.id, name: 'urgent' }],
      },
    })
    expect(await positionsOf(repository, DAILY)).toEqual([
      [11, 2048],
      [10, 3072],
      [12, 4096],
    ])
  })

  it('moves a Todo into another Bucket and reports both Buckets as affected', async () => {
    const repository = setup({ todos: [todo(10, DAILY, 1024), todo(21, MONTHLY, 1024), todo(22, MONTHLY, 2048)] })

    const result = await moveTodoForUser({
      data: { afterTodoId: 22, beforeTodoId: 21, id: 10, targetBucketId: MONTHLY },
      repository,
      userId: USER,
    })

    expect(result).toMatchObject({
      affectedBucketIds: [DAILY, MONTHLY],
      positions: [{ bucketId: MONTHLY, id: 10, position: 1536 }],
      sourceBucketId: DAILY,
      todo: { bucketId: MONTHLY, id: 10, position: 1536 },
    })
    expect(await positionsOf(repository, DAILY)).toEqual([])
    expect(await positionsOf(repository, MONTHLY)).toEqual([
      [21, 1024],
      [10, 1536],
      [22, 2048],
    ])
  })

  it.each([
    ['an empty Bucket', [], {}, 1024],
    ['after the last Todo', [todo(21, MONTHLY, 3000)], { beforeTodoId: 21 }, 4024],
    ['without anchors at the end', [todo(21, MONTHLY, 3000)], {}, 4024],
    ['before the first Todo', [todo(21, MONTHLY, 3000)], { afterTodoId: 21 }, 1500],
  ])('places a Todo moved into %s at a sparse position', async (_, targetTodos, anchors, position) => {
    const repository = setup({ todos: [todo(10, DAILY, 1024), ...targetTodos] })

    const result = await moveTodoForUser({
      data: { id: 10, targetBucketId: MONTHLY, ...anchors },
      repository,
      userId: USER,
    })

    expect(result.positions).toEqual([{ bucketId: MONTHLY, id: 10, position }])
  })

  it('rebalances the target Bucket when the anchors leave no integer gap and returns every changed position', async () => {
    const repository = setup({ todos: [todo(10, DAILY, 1024), todo(11, DAILY, 1025), todo(12, DAILY, 1026)] })

    const result = await moveTodoForUser({
      data: { afterTodoId: 12, beforeTodoId: 11, id: 10, targetBucketId: DAILY },
      repository,
      userId: USER,
    })

    expect(result.positions).toEqual([
      { bucketId: DAILY, id: 11, position: 1024 },
      { bucketId: DAILY, id: 12, position: 3072 },
      { bucketId: DAILY, id: 10, position: 2048 },
    ])
    expect(await positionsOf(repository, DAILY)).toEqual([
      [11, 1024],
      [10, 2048],
      [12, 3072],
    ])
  })

  it('orders tied positions from concurrent creates by Todo ID and rebalances them when moving between', async () => {
    const repository = setup({ todos: [todo(10, MONTHLY, 1024), todo(12, DAILY, 2048), todo(11, DAILY, 2048)] })

    expect(
      (await getTodosForUser({ data: { bucketId: DAILY }, repository, userId: USER })).map(({ id }) => id),
    ).toEqual([11, 12])

    await moveTodoForUser({
      data: { afterTodoId: 12, beforeTodoId: 11, id: 10, targetBucketId: DAILY },
      repository,
      userId: USER,
    })

    expect(await positionsOf(repository, DAILY)).toEqual([
      [11, 1024],
      [10, 2048],
      [12, 3072],
    ])
  })

  it.each([
    ['a missing anchor', { afterTodoId: 99, beforeTodoId: 11 }],
    ["another User's anchor", { afterTodoId: 40, beforeTodoId: 11 }],
    ['anchors that are no longer adjacent', { afterTodoId: 13, beforeTodoId: 11 }],
    ['a before anchor that is no longer last', { beforeTodoId: 11 }],
    ['an after anchor that is no longer first', { afterTodoId: 12 }],
  ])('rejects %s as stale positions without moving anything', async (_, anchors) => {
    const repository = setup({
      todos: [
        todo(10, MONTHLY, 1024),
        todo(11, DAILY, 1024),
        todo(12, DAILY, 2048),
        todo(13, DAILY, 3072),
        todo(40, FOREIGN_BUCKET, 1024, { userId: OTHER_USER }),
      ],
    })

    await expect(
      moveTodoForUser({ data: { id: 10, targetBucketId: DAILY, ...anchors }, repository, userId: USER }),
    ).rejects.toMatchObject({ ...CONFLICT, message: STALE_TODO_POSITIONS_MESSAGE })
    expect(await positionsOf(repository, MONTHLY)).toEqual([[10, 1024]])
  })

  const moveElsewhere = (repository: TodoRepository, todoId: number, position: number, targetBucketId = MONTHLY) =>
    repository.listPositions(USER, DAILY).then(async (positions) => {
      const current = positions.find(({ id }) => id === todoId)!
      const expectedTargetTodos = (await repository.listPositions(USER, targetBucketId)).filter(
        ({ id }) => id !== todoId,
      )
      return repository.moveTodo({
        expectedTargetTodos,
        kind: 'insert',
        position,
        source: { bucketId: DAILY, position: current.position },
        targetBucketId,
        todoId,
        userId: USER,
      })
    })

  it.each([
    [
      'an anchor left the Bucket',
      (repository: TodoRepository) => moveElsewhere(repository, 12, 1024),
      [
        [10, 1024],
        [11, 2048],
      ],
    ],
    [
      'the moved Todo was repositioned',
      (repository: TodoRepository) => moveElsewhere(repository, 10, 5000, DAILY),
      [
        [11, 2048],
        [12, 4096],
        [10, 5000],
      ],
    ],
    [
      'the moved Todo was deleted',
      (repository: TodoRepository) => repository.deleteTodo(USER, 10),
      [
        [11, 2048],
        [12, 4096],
      ],
    ],
  ])('rejects the move as stale when %s after it was planned', async (_, concurrentCommand, expectedPositions) => {
    const repository = setup({ todos: [todo(10, DAILY, 1024), todo(11, DAILY, 2048), todo(12, DAILY, 4096)] })
    afterRead(repository, 'listPositions', () => concurrentCommand(repository))

    await expect(
      moveTodoForUser({
        data: { afterTodoId: 12, beforeTodoId: 11, id: 10, targetBucketId: DAILY },
        repository,
        userId: USER,
      }),
    ).rejects.toMatchObject(CONFLICT)
    expect(await positionsOf(repository, DAILY)).toEqual(expectedPositions)
  })

  it('commits no partial rebalance when the target Bucket changed after the move was planned', async () => {
    const repository = setup({ todos: [todo(10, DAILY, 1024), todo(11, DAILY, 1025), todo(12, DAILY, 1026)] })
    afterRead(repository, 'listPositions', () => moveElsewhere(repository, 12, 1024))

    await expect(
      moveTodoForUser({
        data: { afterTodoId: 12, beforeTodoId: 11, id: 10, targetBucketId: DAILY },
        repository,
        userId: USER,
      }),
    ).rejects.toMatchObject(CONFLICT)
    expect(await positionsOf(repository, DAILY)).toEqual([
      [10, 1024],
      [11, 1025],
    ])
  })

  it('rejects a sparse move when a Todo is appended after its target order was read', async () => {
    const repository = setup({ todos: [todo(10, MONTHLY, 1024), todo(11, DAILY, 1024)] })
    afterRead(repository, 'listPositions', () =>
      repository.createTodo({
        bucketId: DAILY,
        categoryId: null,
        createdAt,
        description: '',
        tagIds: [],
        title: 'Concurrent append',
        userId: USER,
      }),
    )

    await expect(
      moveTodoForUser({ data: { beforeTodoId: 11, id: 10, targetBucketId: DAILY }, repository, userId: USER }),
    ).rejects.toMatchObject(CONFLICT)
    expect(await positionsOf(repository, MONTHLY)).toEqual([[10, 1024]])
  })

  it('converges a retried move on the already committed placement', async () => {
    const repository = setup({ todos: [todo(10, DAILY, 1024), todo(11, DAILY, 2048), todo(12, DAILY, 4096)] })
    const retry = () =>
      moveTodoForUser({
        data: { afterTodoId: 12, beforeTodoId: 11, id: 10, targetBucketId: DAILY },
        repository,
        userId: USER,
      })

    const first = await retry()

    await expect(retry()).resolves.toEqual(first)
    expect(await positionsOf(repository, DAILY)).toEqual([
      [11, 2048],
      [10, 3072],
      [12, 4096],
    ])
  })

  it.each([
    ['a missing Todo', { id: 99 }],
    ['a foreign Todo', { id: 40 }],
    ['a foreign target Bucket', { targetBucketId: FOREIGN_BUCKET }],
    ['an archived target Bucket', { targetBucketId: ARCHIVED }],
  ])('rejects %s with the indistinguishable not-found error', async (_, input) => {
    const repository = setup({ todos: [todo(10, DAILY, 1024), todo(40, FOREIGN_BUCKET, 1024, { userId: OTHER_USER })] })

    await expect(
      moveTodoForUser({ data: { id: 10, targetBucketId: MONTHLY, ...input }, repository, userId: USER }),
    ).rejects.toMatchObject(NOT_FOUND)
    expect(await positionsOf(repository, DAILY)).toEqual([[10, 1024]])
  })

  it.each([
    [
      'a Pending Migration Bucket gates the board',
      DAILY,
      [...BUCKETS, { id: 9, status: 'pending_migration', userId: USER }],
    ],
    ['the Todo sits in an archived Bucket', ARCHIVED, BUCKETS],
  ] as const)('rejects the move with a conflict while %s', async (_, bucketId, buckets) => {
    const repository = setup({ buckets: [...buckets], todos: [todo(10, bucketId, 1024)] })

    await expect(
      moveTodoForUser({ data: { id: 10, targetBucketId: MONTHLY }, repository, userId: USER }),
    ).rejects.toMatchObject(CONFLICT)
    expect(await positionsOf(repository, MONTHLY)).toEqual([])
  })
})

describe('deleteTodoForUser', () => {
  it('deletes an owned Todo and returns its ID and previous Bucket', async () => {
    const repository = setup({ todoTags: [{ tagId: URGENT.id, todoId: 20 }], todos: [todo(20, DAILY, 1024)] })

    await expect(deleteTodoForUser({ data: { id: 20 }, repository, userId: USER })).resolves.toEqual({
      previousBucketId: DAILY,
      todoId: 20,
    })
    expect(await repository.findTodo(USER, 20)).toBeUndefined()
  })

  it.each([
    ['a missing Todo', 99, NOT_FOUND],
    ['a foreign Todo', 40, NOT_FOUND],
    ['a Todo in an archived Bucket', 30, CONFLICT],
  ])('rejects deleting %s and keeps it', async (_, id, error) => {
    const repository = setup({
      todos: [todo(30, ARCHIVED, 1024), todo(40, FOREIGN_BUCKET, 1024, { userId: OTHER_USER })],
    })

    await expect(deleteTodoForUser({ data: { id }, repository, userId: USER })).rejects.toMatchObject(error)
    expect(await repository.findTodo(OTHER_USER, 40)).toBeDefined()
    expect(await repository.findTodo(USER, 30)).toBeDefined()
  })

  it('requires Migration before deleting while a Pending Migration Bucket gates the board', async () => {
    const repository = setup({
      buckets: [...BUCKETS, { id: 9, status: 'pending_migration', userId: USER }],
      todos: [todo(20, DAILY, 1024)],
    })

    await expect(deleteTodoForUser({ data: { id: 20 }, repository, userId: USER })).rejects.toMatchObject(CONFLICT)
    expect(await repository.findTodo(USER, 20)).toBeDefined()
  })

  it('treats a Todo deleted concurrently after it was read as not found', async () => {
    const repository = setup({ todos: [todo(20, DAILY, 1024)] })
    afterRead(repository, 'findTodo', () => repository.deleteTodo(USER, 20))

    await expect(deleteTodoForUser({ data: { id: 20 }, repository, userId: USER })).rejects.toMatchObject(NOT_FOUND)
  })
})
