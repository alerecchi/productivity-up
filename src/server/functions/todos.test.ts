import { describe, expect, it, vi } from 'vitest'

import {
  CreateTodoInput,
  MoveTodoInput,
  UpdateTodoInput,
  createTodoForUser,
  deleteTodoForUser,
  getTodosForUser,
  moveTodoForUser,
  updateTodoForUser,
} from './todos.core'
import type { TodoRepository } from './todos.core'

const ownedCategory = {
  colorKey: 'blue',
  id: 5,
  name: 'home admin',
  userId: 'user-1',
} as const

const urgentTag = {
  colorKey: 'rose',
  id: 11,
  name: 'urgent',
  userId: 'user-1',
} as const

const focusTag = {
  colorKey: 'teal',
  id: 12,
  name: 'focus',
  userId: 'user-1',
} as const

const activeBucket = {
  archivedAt: null,
  createdAt: new Date('2026-06-10T08:00:00.000Z'),
  id: 2,
  period: '2026-06-11',
  status: 'active',
  type: 'daily',
  userId: 'user-1',
} as const

const otherActiveBucket = {
  ...activeBucket,
  id: 3,
  period: '2026-06',
  type: 'monthly',
} as const

const existingTodo = {
  bucket: activeBucket,
  bucketId: activeBucket.id,
  category: null,
  categoryId: null,
  completed: false,
  createdAt: new Date('2026-06-10T08:00:00.000Z'),
  description: '',
  id: 10,
  position: 1024,
  tags: [],
  title: 'Pay rent',
  userId: activeBucket.userId,
}

const createRepository = (overrides: Partial<TodoRepository> = {}): TodoRepository => ({
  createTodo: vi.fn((todoToCreate) => Promise.resolve({ id: 10, ...todoToCreate })),
  deleteTodo: vi.fn(),
  findOwnedActiveBucket: vi.fn(() => Promise.resolve(activeBucket)),
  findOwnedCategory: vi.fn(() => Promise.resolve(ownedCategory)),
  findOwnedTags: vi.fn((userId, tagIds) =>
    Promise.resolve([urgentTag, focusTag].filter((tag) => tag.userId === userId && tagIds.includes(tag.id))),
  ),
  findOwnedTodoWithBucket: vi.fn(),
  getMaxTodoPosition: vi.fn(() => Promise.resolve(null)),
  getTodosByBucketForUser: vi.fn(() => Promise.resolve([])),
  moveTodo: vi.fn(),
  replaceTodoTags: vi.fn(() => Promise.resolve()),
  updateTodo: vi.fn(),
  ...overrides,
})

describe('todo server behavior', () => {
  it('creates todos in an active owned bucket with normalized description and server-owned fields', async () => {
    const repository = createRepository()
    const createdAt = new Date('2026-06-11T10:15:00.000Z')

    const createdTodo = await createTodoForUser({
      data: CreateTodoInput.parse({
        bucketId: activeBucket.id,
        description: '  Details to remember  ',
        title: '  Pay rent  ',
      }),
      now: () => createdAt,
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.findOwnedActiveBucket).toHaveBeenCalledWith(activeBucket.userId, activeBucket.id)
    expect(repository.createTodo).toHaveBeenCalledWith({
      bucketId: activeBucket.id,
      categoryId: null,
      completed: false,
      createdAt,
      description: 'Details to remember',
      position: 1024,
      title: 'Pay rent',
      userId: activeBucket.userId,
    })
    expect(createdTodo).toMatchObject({
      bucketId: activeBucket.id,
      completed: false,
      description: 'Details to remember',
      tags: [],
      title: 'Pay rent',
      userId: activeBucket.userId,
    })
  })

  it('stores a whitespace-only description as an empty string', async () => {
    const repository = createRepository()

    await createTodoForUser({
      data: CreateTodoInput.parse({
        bucketId: activeBucket.id,
        description: '   ',
        title: 'Pay rent',
      }),
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.createTodo).toHaveBeenCalledWith(expect.objectContaining({ description: '' }))
  })

  it('creates new todos after the current bottom position in the selected Bucket', async () => {
    const repository = createRepository({
      getMaxTodoPosition: vi.fn(() => Promise.resolve(2048)),
    })

    await createTodoForUser({
      data: CreateTodoInput.parse({
        bucketId: activeBucket.id,
        title: 'Pay rent',
      }),
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.getMaxTodoPosition).toHaveBeenCalledWith(activeBucket.userId, activeBucket.id)
    expect(repository.createTodo).toHaveBeenCalledWith(expect.objectContaining({ position: 3072 }))
  })

  it('creates todos with an owned Category selected', async () => {
    const repository = createRepository()

    await createTodoForUser({
      data: CreateTodoInput.parse({
        bucketId: activeBucket.id,
        categoryId: ownedCategory.id,
        title: 'Pay rent',
      }),
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.findOwnedCategory).toHaveBeenCalledWith(activeBucket.userId, ownedCategory.id)
    expect(repository.createTodo).toHaveBeenCalledWith(expect.objectContaining({ categoryId: ownedCategory.id }))
  })

  it('creates todos with an empty Tag set', async () => {
    const repository = createRepository()

    const createdTodo = await createTodoForUser({
      data: CreateTodoInput.parse({
        bucketId: activeBucket.id,
        tagIds: [],
        title: 'Pay rent',
      }),
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.findOwnedTags).not.toHaveBeenCalled()
    expect(repository.replaceTodoTags).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId, [])
    expect(createdTodo.tags).toEqual([])
  })

  it('creates todos with owned Tags selected', async () => {
    const repository = createRepository()

    const createdTodo = await createTodoForUser({
      data: CreateTodoInput.parse({
        bucketId: activeBucket.id,
        tagIds: [focusTag.id, urgentTag.id],
        title: 'Pay rent',
      }),
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.findOwnedTags).toHaveBeenCalledWith(activeBucket.userId, [focusTag.id, urgentTag.id])
    expect(repository.replaceTodoTags).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId, [
      focusTag.id,
      urgentTag.id,
    ])
    expect(createdTodo.tags).toEqual([
      {
        colorKey: focusTag.colorKey,
        id: focusTag.id,
        name: focusTag.name,
      },
      {
        colorKey: urgentTag.colorKey,
        id: urgentTag.id,
        name: urgentTag.name,
      },
    ])
  })

  it("rejects creating a Todo with another user's Tag", async () => {
    const repository = createRepository({
      findOwnedTags: vi.fn(() => Promise.resolve([urgentTag])),
    })

    await expect(
      createTodoForUser({
        data: {
          bucketId: activeBucket.id,
          tagIds: [urgentTag.id, focusTag.id],
          title: 'Pay rent',
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedTags).toHaveBeenCalledWith(activeBucket.userId, [urgentTag.id, focusTag.id])
    expect(repository.createTodo).not.toHaveBeenCalled()
  })

  it("rejects creating a Todo with another user's Category", async () => {
    const repository = createRepository({
      findOwnedCategory: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      createTodoForUser({
        data: {
          bucketId: activeBucket.id,
          categoryId: ownedCategory.id,
          title: 'Pay rent',
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedCategory).toHaveBeenCalledWith(activeBucket.userId, ownedCategory.id)
    expect(repository.createTodo).not.toHaveBeenCalled()
  })

  it("rejects updating a Todo to another user's Category", async () => {
    const repository = createRepository({
      findOwnedCategory: vi.fn(() => Promise.resolve(undefined)),
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
    })

    await expect(
      updateTodoForUser({
        data: {
          categoryId: ownedCategory.id,
          id: existingTodo.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedCategory).toHaveBeenCalledWith(activeBucket.userId, ownedCategory.id)
    expect(repository.updateTodo).not.toHaveBeenCalled()
  })

  it("rejects updating a Todo to another user's Tag", async () => {
    const repository = createRepository({
      findOwnedTags: vi.fn(() => Promise.resolve([urgentTag])),
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
    })

    await expect(
      updateTodoForUser({
        data: {
          id: existingTodo.id,
          tagIds: [urgentTag.id, focusTag.id],
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedTags).toHaveBeenCalledWith(activeBucket.userId, [urgentTag.id, focusTag.id])
    expect(repository.updateTodo).not.toHaveBeenCalled()
    expect(repository.replaceTodoTags).not.toHaveBeenCalled()
  })

  it('rejects blank titles at the server function validation boundary', () => {
    expect(
      CreateTodoInput.safeParse({
        bucketId: activeBucket.id,
        title: '   ',
      }).success,
    ).toBe(false)
  })

  it('rejects create and read when the bucket is archived, missing, or owned by another user', async () => {
    const repository = createRepository({
      findOwnedActiveBucket: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      createTodoForUser({
        data: {
          bucketId: activeBucket.id,
          title: 'Pay rent',
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)
    await expect(
      getTodosForUser({
        data: { bucketId: activeBucket.id },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.createTodo).not.toHaveBeenCalled()
    expect(repository.getTodosByBucketForUser).not.toHaveBeenCalled()
  })

  it('reads todos only after verifying an active owned bucket', async () => {
    const repository = createRepository({
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([existingTodo])),
    })

    const todos = await getTodosForUser({
      data: { bucketId: activeBucket.id },
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.findOwnedActiveBucket).toHaveBeenCalledWith(activeBucket.userId, activeBucket.id)
    expect(repository.getTodosByBucketForUser).toHaveBeenCalledWith(activeBucket.userId, activeBucket.id)
    expect(todos).toEqual([existingTodo])
  })

  it('returns todos in the persisted Todo Position order provided by the repository', async () => {
    const lowerTodo = {
      ...existingTodo,
      id: 11,
      position: 1024,
      title: 'First',
    }
    const higherTodo = {
      ...existingTodo,
      id: 12,
      position: 2048,
      title: 'Second',
    }
    const repository = createRepository({
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([lowerTodo, higherTodo])),
    })

    const todos = await getTodosForUser({
      data: { bucketId: activeBucket.id },
      repository,
      userId: activeBucket.userId,
    })

    expect(todos).toEqual([lowerTodo, higherTodo])
  })

  it('does not expose creation time as editable update input', () => {
    expect(
      UpdateTodoInput.safeParse({
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        id: existingTodo.id,
        title: 'Changed',
      }).success,
    ).toBe(false)
  })

  it('rejects blank titles at the update validation boundary', () => {
    expect(
      UpdateTodoInput.safeParse({
        id: existingTodo.id,
        title: '   ',
      }).success,
    ).toBe(false)
  })

  it('updates todos only when the todo belongs to the current user', async () => {
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      updateTodoForUser({
        data: {
          completed: true,
          id: existingTodo.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.updateTodo).not.toHaveBeenCalled()
  })

  it('replaces the full submitted Tag set when updating a Todo', async () => {
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() =>
        Promise.resolve({
          ...existingTodo,
          tags: [urgentTag],
        }),
      ),
      updateTodo: vi.fn((todoId, userId, updates) =>
        Promise.resolve({
          ...existingTodo,
          ...updates,
          id: todoId,
          userId,
        }),
      ),
    })

    const updatedTodo = await updateTodoForUser({
      data: {
        id: existingTodo.id,
        tagIds: [focusTag.id],
      },
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.replaceTodoTags).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId, [focusTag.id])
    expect(updatedTodo.tags).toEqual([
      {
        colorKey: focusTag.colorKey,
        id: focusTag.id,
        name: focusTag.name,
      },
    ])
  })

  it('preserves the existing Tag display data when update omits Tag IDs', async () => {
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() =>
        Promise.resolve({
          ...existingTodo,
          tags: [urgentTag],
        }),
      ),
      updateTodo: vi.fn((todoId, userId, updates) =>
        Promise.resolve({
          ...existingTodo,
          ...updates,
          id: todoId,
          userId,
        }),
      ),
    })

    const updatedTodo = await updateTodoForUser({
      data: {
        completed: true,
        id: existingTodo.id,
      },
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.findOwnedTags).not.toHaveBeenCalled()
    expect(repository.replaceTodoTags).not.toHaveBeenCalled()
    expect(updatedTodo.tags).toEqual([
      {
        colorKey: urgentTag.colorKey,
        id: urgentTag.id,
        name: urgentTag.name,
      },
    ])
  })

  it('moves a Todo to another active owned Bucket', async () => {
    const repository = createRepository({
      findOwnedActiveBucket: vi.fn((userId, bucketId) =>
        Promise.resolve(
          userId === activeBucket.userId && bucketId === otherActiveBucket.id ? otherActiveBucket : undefined,
        ),
      ),
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
      getMaxTodoPosition: vi.fn(() => Promise.resolve(4096)),
      updateTodo: vi.fn((todoId, userId, updates) =>
        Promise.resolve({
          ...existingTodo,
          ...updates,
          id: todoId,
          userId,
        }),
      ),
    })

    const updatedTodo = await updateTodoForUser({
      data: {
        bucketId: otherActiveBucket.id,
        id: existingTodo.id,
      },
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.findOwnedActiveBucket).toHaveBeenCalledWith(activeBucket.userId, otherActiveBucket.id)
    expect(repository.getMaxTodoPosition).toHaveBeenCalledWith(activeBucket.userId, otherActiveBucket.id)
    expect(repository.updateTodo).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId, {
      bucketId: otherActiveBucket.id,
      position: 5120,
    })
    expect(updatedTodo).toMatchObject({
      bucketId: otherActiveBucket.id,
      id: existingTodo.id,
      tags: [],
      title: existingTodo.title,
    })
  })

  it('moves a Todo between adjacent anchors in the same Bucket without accepting a client position', async () => {
    const beforeTodo = {
      ...existingTodo,
      id: 11,
      position: 2048,
      title: 'Before anchor',
    }
    const afterTodo = {
      ...existingTodo,
      id: 12,
      position: 4096,
      title: 'After anchor',
    }
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([existingTodo, beforeTodo, afterTodo])),
      moveTodo: vi.fn((todoId, userId, move) =>
        Promise.resolve({
          status: 'moved' as const,
          todo: {
            ...existingTodo,
            bucketId: move.bucketId,
            id: todoId,
            position: move.position,
            userId,
          },
        }),
      ),
    })

    const result = await moveTodoForUser({
      data: MoveTodoInput.parse({
        afterTodoId: afterTodo.id,
        beforeTodoId: beforeTodo.id,
        id: existingTodo.id,
        targetBucketId: activeBucket.id,
      }),
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.moveTodo).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId, {
      bucketId: activeBucket.id,
      expectedMovedTodoPosition: existingTodo.position,
      expectedSourceBucketId: existingTodo.bucketId,
      expectedTargetTodoPositions: [
        { bucketId: activeBucket.id, id: beforeTodo.id, position: beforeTodo.position },
        { bucketId: activeBucket.id, id: afterTodo.id, position: afterTodo.position },
      ],
      position: 3072,
      rebalancedTodoPositions: [],
    })
    expect(result).toMatchObject({
      affectedBucketIds: [activeBucket.id],
      affectedTodoPositions: [{ bucketId: activeBucket.id, id: existingTodo.id, position: 3072 }],
      todo: {
        bucketId: activeBucket.id,
        id: existingTodo.id,
        position: 3072,
      },
    })
  })

  it('moves a Todo between adjacent anchors in another Bucket and returns both affected Buckets', async () => {
    const beforeTodo = {
      ...existingTodo,
      bucket: otherActiveBucket,
      bucketId: otherActiveBucket.id,
      id: 21,
      position: 1024,
      title: 'Target before anchor',
    }
    const afterTodo = {
      ...beforeTodo,
      id: 22,
      position: 2048,
      title: 'Target after anchor',
    }
    const repository = createRepository({
      findOwnedActiveBucket: vi.fn((userId, bucketId) =>
        Promise.resolve(
          userId === activeBucket.userId && bucketId === otherActiveBucket.id ? otherActiveBucket : undefined,
        ),
      ),
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([beforeTodo, afterTodo])),
      moveTodo: vi.fn((todoId, userId, move) =>
        Promise.resolve({
          status: 'moved' as const,
          todo: {
            ...existingTodo,
            bucketId: move.bucketId,
            id: todoId,
            position: move.position,
            userId,
          },
        }),
      ),
    })

    const result = await moveTodoForUser({
      data: {
        afterTodoId: afterTodo.id,
        beforeTodoId: beforeTodo.id,
        id: existingTodo.id,
        targetBucketId: otherActiveBucket.id,
      },
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.moveTodo).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId, {
      bucketId: otherActiveBucket.id,
      expectedMovedTodoPosition: existingTodo.position,
      expectedSourceBucketId: existingTodo.bucketId,
      expectedTargetTodoPositions: [
        { bucketId: otherActiveBucket.id, id: beforeTodo.id, position: beforeTodo.position },
        { bucketId: otherActiveBucket.id, id: afterTodo.id, position: afterTodo.position },
      ],
      position: 1536,
      rebalancedTodoPositions: [],
    })
    expect(result.affectedBucketIds).toEqual([activeBucket.id, otherActiveBucket.id])
    expect(result.todo).toMatchObject({
      bucketId: otherActiveBucket.id,
      id: existingTodo.id,
      position: 1536,
    })
  })

  it('rejects a stale Todo anchor without moving the Todo', async () => {
    const beforeTodo = {
      ...existingTodo,
      id: 31,
      position: 1024,
      title: 'Still present anchor',
    }
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([beforeTodo])),
    })

    await expect(
      moveTodoForUser({
        data: {
          afterTodoId: 999,
          beforeTodoId: beforeTodo.id,
          id: existingTodo.id,
          targetBucketId: activeBucket.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.moveTodo).not.toHaveBeenCalled()
  })

  it('rejects Todo anchors that are valid but no longer adjacent', async () => {
    const beforeTodo = {
      ...existingTodo,
      id: 41,
      position: 1024,
      title: 'Before anchor',
    }
    const interveningTodo = {
      ...existingTodo,
      id: 42,
      position: 2048,
      title: 'Intervening Todo',
    }
    const afterTodo = {
      ...existingTodo,
      id: 43,
      position: 3072,
      title: 'After anchor',
    }
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([beforeTodo, interveningTodo, afterTodo])),
    })

    await expect(
      moveTodoForUser({
        data: {
          afterTodoId: afterTodo.id,
          beforeTodoId: beforeTodo.id,
          id: existingTodo.id,
          targetBucketId: activeBucket.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.moveTodo).not.toHaveBeenCalled()
  })

  it('rejects moving a Todo to an archived or unauthorized target Bucket', async () => {
    const repository = createRepository({
      findOwnedActiveBucket: vi.fn(() => Promise.resolve(undefined)),
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
    })

    await expect(
      moveTodoForUser({
        data: {
          id: existingTodo.id,
          targetBucketId: otherActiveBucket.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedActiveBucket).toHaveBeenCalledWith(activeBucket.userId, otherActiveBucket.id)
    expect(repository.getTodosByBucketForUser).not.toHaveBeenCalled()
    expect(repository.moveTodo).not.toHaveBeenCalled()
  })

  it("rejects moving another user's Todo", async () => {
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      moveTodoForUser({
        data: {
          id: existingTodo.id,
          targetBucketId: activeBucket.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedActiveBucket).not.toHaveBeenCalled()
    expect(repository.moveTodo).not.toHaveBeenCalled()
  })

  it('does not expose Todo Position as editable move input', () => {
    expect(
      MoveTodoInput.safeParse({
        id: existingTodo.id,
        position: 2048,
        targetBucketId: activeBucket.id,
      }).success,
    ).toBe(false)
  })

  it('surfaces stale repository move results as an explicit conflict', async () => {
    const beforeTodo = {
      ...existingTodo,
      id: 61,
      position: 1024,
      title: 'Before anchor',
    }
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([beforeTodo])),
      moveTodo: vi.fn(() => Promise.resolve({ status: 'conflict' as const })),
    })

    await expect(
      moveTodoForUser({
        data: {
          beforeTodoId: beforeTodo.id,
          id: existingTodo.id,
          targetBucketId: activeBucket.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 409)
  })

  it('rebalances target Bucket positions when adjacent anchors leave no integer gap', async () => {
    const beforeTodo = {
      ...existingTodo,
      id: 51,
      position: 1024,
      title: 'Before anchor',
    }
    const afterTodo = {
      ...existingTodo,
      id: 52,
      position: 1025,
      title: 'After anchor',
    }
    const repository = createRepository({
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
      getTodosByBucketForUser: vi.fn(() => Promise.resolve([existingTodo, beforeTodo, afterTodo])),
      moveTodo: vi.fn((todoId, userId, move) =>
        Promise.resolve({
          status: 'moved' as const,
          todo: {
            ...existingTodo,
            bucketId: move.bucketId,
            id: todoId,
            position: move.position,
            userId,
          },
        }),
      ),
    })

    const result = await moveTodoForUser({
      data: {
        afterTodoId: afterTodo.id,
        beforeTodoId: beforeTodo.id,
        id: existingTodo.id,
        targetBucketId: activeBucket.id,
      },
      repository,
      userId: activeBucket.userId,
    })

    expect(repository.moveTodo).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId, {
      bucketId: activeBucket.id,
      expectedMovedTodoPosition: existingTodo.position,
      expectedSourceBucketId: existingTodo.bucketId,
      expectedTargetTodoPositions: [
        { bucketId: activeBucket.id, id: beforeTodo.id, position: beforeTodo.position },
        { bucketId: activeBucket.id, id: afterTodo.id, position: afterTodo.position },
      ],
      position: 2048,
      rebalancedTodoPositions: [{ bucketId: activeBucket.id, id: afterTodo.id, position: 3072 }],
    })
    expect(result.affectedTodoPositions).toEqual([
      { bucketId: activeBucket.id, id: afterTodo.id, position: 3072 },
      { bucketId: activeBucket.id, id: existingTodo.id, position: 2048 },
    ])
  })

  it('rejects moving a Todo to an archived Bucket', async () => {
    const repository = createRepository({
      findOwnedActiveBucket: vi.fn((userId, bucketId) =>
        Promise.resolve(userId === activeBucket.userId && bucketId === otherActiveBucket.id ? undefined : activeBucket),
      ),
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
    })

    await expect(
      updateTodoForUser({
        data: {
          bucketId: otherActiveBucket.id,
          id: existingTodo.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedActiveBucket).toHaveBeenCalledWith(activeBucket.userId, otherActiveBucket.id)
    expect(repository.updateTodo).not.toHaveBeenCalled()
  })

  it("rejects moving a Todo to another user's Bucket", async () => {
    const repository = createRepository({
      findOwnedActiveBucket: vi.fn(() => Promise.resolve(undefined)),
      findOwnedTodoWithBucket: vi.fn(() => Promise.resolve(existingTodo)),
    })

    await expect(
      updateTodoForUser({
        data: {
          bucketId: otherActiveBucket.id,
          id: existingTodo.id,
        },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.findOwnedActiveBucket).toHaveBeenCalledWith(activeBucket.userId, otherActiveBucket.id)
    expect(repository.updateTodo).not.toHaveBeenCalled()
  })

  it('deletes an owned Todo and returns its cache removal data', async () => {
    const deletedTodo = {
      bucketId: existingTodo.bucketId,
      todoId: existingTodo.id,
    }
    const repository = createRepository({
      deleteTodo: vi.fn(() => Promise.resolve(deletedTodo)),
    })

    await expect(
      deleteTodoForUser({
        data: { id: existingTodo.id },
        repository,
        userId: activeBucket.userId,
      }),
    ).resolves.toEqual(deletedTodo)

    expect(repository.deleteTodo).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId)
  })

  it('rejects deleting a nonexistent Todo', async () => {
    const repository = createRepository({
      deleteTodo: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      deleteTodoForUser({
        data: { id: existingTodo.id },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.deleteTodo).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId)
  })

  it('deletes todos only when the todo belongs to the current user', async () => {
    const repository = createRepository({
      deleteTodo: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      deleteTodoForUser({
        data: { id: existingTodo.id },
        repository,
        userId: activeBucket.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.deleteTodo).toHaveBeenCalledWith(existingTodo.id, activeBucket.userId)
  })
})
