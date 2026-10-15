import { createRequire } from 'node:module'

import handler from '@tanstack/react-start/server-entry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CategoryDisplay } from '@/lib/types/Category'
import type { TagDisplay } from '@/lib/types/Tag'
import { completeDay, confirmMigrationStep, reconcileLifecycle } from '@/server/functions/board'
import { createCategory, deleteCategory, updateCategory } from '@/server/functions/categories'
import type { CategoryRepository } from '@/server/functions/categories/operations'
import { createTag, deleteTag, updateTag } from '@/server/functions/tags'
import type { TagRepository } from '@/server/functions/tags/operations'
import { createBucket, createInMemoryBoardRepository, createTodo } from '@/test/in-memory-board-repository'

const fixture = vi.hoisted(() => ({
  userId: 'user-1',
  publish: vi.fn(() => Promise.resolve()),
  getByName: vi.fn(),
  board: undefined as ReturnType<typeof createInMemoryBoardRepository> | undefined,
  categories: undefined as CategoryRepository | undefined,
  tags: undefined as TagRepository | undefined,
}))

vi.mock('@/server/db/client', () => ({
  connectDatabase: () => Promise.resolve({ close: () => Promise.resolve(), db: {} }),
}))
vi.mock('@/server/auth', () => ({
  createAuth: () => ({
    api: { getSession: () => Promise.resolve({ user: { emailVerified: true, id: fixture.userId } }) },
  }),
}))
vi.mock('@/config/runtime-env', () => ({
  getRuntimeEnvironment: () => ({ version: 'test', realtime: { userRealtime: { getByName: fixture.getByName } } }),
}))
vi.mock('@/server/db/board-repository', () => ({ createBoardRepository: () => fixture.board }))
vi.mock('@/server/db/category-repository', () => ({ createCategoryRepository: () => fixture.categories }))
vi.mock('@/server/db/tag-repository', () => ({ createTagRepository: () => fixture.tags }))

const ORIGIN = '5b0c2f55-6d0e-4d8f-9a39-0f7c7f0d8a11'
const TODAY = '2026-07-06'

function boardFor(userId: string, pending = false) {
  return createInMemoryBoardRepository({
    buckets: [
      createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
      createBucket({ id: 2, period: '2026', type: 'yearly' }),
      createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
      createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      createBucket({ id: 5, period: TODAY, type: 'daily' }),
      ...(pending ? [createBucket({ id: 6, period: '2026-07-03', status: 'pending_migration', type: 'daily' })] : []),
    ].map((bucket) => ({ ...bucket, userId })),
    todos: pending
      ? [{ ...createTodo({ bucketId: 6, id: 12, completed: false, position: 1024, title: 'Carry' }), userId }]
      : [],
    user: { id: userId, planningDate: TODAY, timeZone: 'UTC' },
  })
}

function taxonomyStore() {
  const categories = new Map<number, CategoryDisplay & { userId: string }>()
  const tags = new Map<number, TagDisplay & { userId: string }>()
  categories.set(7, { id: 7, userId: 'user-1', name: 'old', colorKey: 'blue' })
  tags.set(7, { id: 7, userId: 'user-1', name: 'old', colorKey: 'blue' })
  const categoryRepository: CategoryRepository = {
    hasPendingMigrationBuckets: () => Promise.resolve(false),
    listCategoriesForUser: (userId) => Promise.resolve([...categories.values()].filter((row) => row.userId === userId)),
    createCategory: (row) => {
      const value = { ...row, id: 8 }
      categories.set(8, value)
      return Promise.resolve(value)
    },
    updateCategory: (id, userId, updates) => {
      const row = categories.get(id)
      if (!row || row.userId !== userId) return Promise.resolve(undefined)
      const value = { ...row, ...updates }
      categories.set(id, value)
      return Promise.resolve(value)
    },
    deleteCategory: (id, userId) => {
      if (categories.get(id)?.userId !== userId) return Promise.resolve(undefined)
      categories.delete(id)
      return Promise.resolve({ categoryId: id })
    },
  }
  const tagRepository: TagRepository = {
    hasPendingMigrationBuckets: () => Promise.resolve(false),
    listTagsForUser: (userId) => Promise.resolve([...tags.values()].filter((row) => row.userId === userId)),
    createTag: (row) => {
      const value = { ...row, id: 8 }
      tags.set(8, value)
      return Promise.resolve(value)
    },
    updateTag: (id, userId, updates) => {
      const row = tags.get(id)
      if (!row || row.userId !== userId) return Promise.resolve(undefined)
      const value = { ...row, ...updates }
      tags.set(id, value)
      return Promise.resolve(value)
    },
    deleteTag: (id, userId) => {
      if (tags.get(id)?.userId !== userId) return Promise.resolve(undefined)
      tags.delete(id)
      return Promise.resolve({ tagId: id })
    },
  }
  return { categories, categoryRepository, tags, tagRepository }
}

// Use Start's installed serializer for its HTTP wire format without adding a dependency.
const startRequire = createRequire(import.meta.resolve('@tanstack/react-start'))
const seroval: unknown = createRequire(startRequire.resolve('@tanstack/start-client-core/package.json'))('seroval')

async function request(serverFunction: unknown, data: unknown) {
  if (typeof serverFunction !== 'function' || !('url' in serverFunction) || typeof serverFunction.url !== 'string') {
    throw new Error('Expected an exported server function')
  }
  if (
    typeof seroval !== 'object' ||
    seroval === null ||
    !('toJSONAsync' in seroval) ||
    typeof seroval.toJSONAsync !== 'function'
  ) {
    throw new Error('Start serializer is unavailable')
  }
  return handler.fetch(
    new Request(new URL(serverFunction.url, 'http://localhost:3000'), {
      body: JSON.stringify(await seroval.toJSONAsync({ data })),
      headers: {
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        'x-tsr-serverFn': 'true',
        'X-Client-Instance-Id': ORIGIN,
      },
      method: 'POST',
    }),
  )
}

function expectPublished(type: string, userId = 'user-1') {
  expect(fixture.getByName).toHaveBeenCalledExactlyOnceWith(userId)
  expect(fixture.publish).toHaveBeenCalledExactlyOnceWith([{ type }], { originClientInstanceId: ORIGIN })
}

describe('exported commands publish committed realtime consequences', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`))
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    fixture.userId = 'user-1'
    fixture.publish.mockClear()
    fixture.getByName.mockReset().mockReturnValue({ publish: fixture.publish })
    fixture.board = boardFor('user-1')
    const store = taxonomyStore()
    fixture.categories = store.categoryRepository
    fixture.tags = store.tagRepository
  })

  it.each(['user-1', 'user-2'])('reconciliation commits before publishing only to %s', async (userId) => {
    fixture.userId = userId
    const repository = createInMemoryBoardRepository({ buckets: [], user: { id: userId } })
    fixture.board = repository
    let publishedBoard: ReturnType<typeof repository.readBoard> | undefined
    fixture.publish.mockImplementationOnce(() => {
      publishedBoard = repository.readBoard(userId)
      return Promise.resolve()
    })
    expect((await request(reconcileLifecycle, { timeZone: 'UTC' })).status).toBe(200)
    expectPublished('board-changed', userId)
    await expect(publishedBoard).resolves.toMatchObject({ planningDate: TODAY, timeZone: 'UTC' })
  })

  it('complete day commits the next Planning Date before publishing', async () => {
    const repository = boardFor('user-1')
    fixture.board = repository
    let publishedBoard: ReturnType<typeof repository.readBoard> | undefined
    fixture.publish.mockImplementationOnce(() => {
      publishedBoard = repository.readBoard('user-1')
      return Promise.resolve()
    })
    expect((await request(completeDay, { planningDate: TODAY })).status).toBe(200)
    expectPublished('board-changed')
    await expect(publishedBoard).resolves.toMatchObject({ planningDate: '2026-07-07' })
  })

  it('migration moves the Todo and retires the source before publishing', async () => {
    const repository = boardFor('user-1', true)
    fixture.board = repository
    let publishedBoard: ReturnType<typeof repository.readBoard> | undefined
    let publishedTodos: ReturnType<typeof repository.getTodosByBucket> | undefined
    fixture.publish.mockImplementationOnce(() => {
      publishedBoard = repository.readBoard('user-1')
      publishedTodos = repository.getTodosByBucket('user-1', 5)
      return Promise.resolve()
    })
    expect(
      (await request(confirmMigrationStep, { decisions: { 12: 'carry_forward' }, sourceBucketId: 6 })).status,
    ).toBe(200)
    expectPublished('board-changed')
    await expect(publishedBoard).resolves.toMatchObject({ pendingMigrationBuckets: [] })
    await expect(publishedTodos).resolves.toEqual([expect.objectContaining({ id: 12 })])
  })

  it.each([
    ['reconciliation', reconcileLifecycle, {}, 400],
    ['complete day', completeDay, { planningDate: '2026-07-05' }, 409],
    ['migration', confirmMigrationStep, { decisions: {}, sourceBucketId: 999 }, 404],
  ])('%s publishes nothing when rejected', async (_name, command, data, status) => {
    if (command === reconcileLifecycle) fixture.board = createInMemoryBoardRepository({ buckets: [], user: {} })
    expect((await request(command, data)).status).toBe(status)
    expect(fixture.getByName).not.toHaveBeenCalled()
    expect(fixture.publish).not.toHaveBeenCalled()
  })

  it.each([
    ['Category create', createCategory, { name: 'new', colorKey: 'blue' }, 'categories-changed'],
    ['Category update', updateCategory, { id: 7, name: 'new', colorKey: 'blue' }, 'categories-changed'],
    ['Category delete', deleteCategory, { id: 7 }, 'categories-changed'],
    ['Tag create', createTag, { name: 'new', colorKey: 'blue' }, 'tags-changed'],
    ['Tag update', updateTag, { id: 7, name: 'new', colorKey: 'blue' }, 'tags-changed'],
    ['Tag delete', deleteTag, { id: 7 }, 'tags-changed'],
  ])('%s publishes its configured hint after the write', async (_name, command, data, hint) => {
    const store = taxonomyStore()
    fixture.categories = store.categoryRepository
    fixture.tags = store.tagRepository
    let publishedRows: unknown
    fixture.publish.mockImplementationOnce(() => {
      publishedRows = [...(hint === 'categories-changed' ? store.categories.values() : store.tags.values())].map(
        (row) => ({ ...row }),
      )
      return Promise.resolve()
    })
    expect((await request(command, data)).status).toBe(200)
    expectPublished(hint)
    if (_name.endsWith('delete')) {
      expect(publishedRows).toEqual([])
    } else {
      expect(publishedRows).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'new' })]))
    }
  })

  it.each([
    ['Category create', createCategory, { name: 'new', colorKey: 'blue' }],
    ['Tag create', createTag, { name: 'new', colorKey: 'blue' }],
  ])('%s publishes nothing when migration blocks the command', async (_name, command, data) => {
    const store = taxonomyStore()
    store.categoryRepository.hasPendingMigrationBuckets = () => Promise.resolve(true)
    store.tagRepository.hasPendingMigrationBuckets = () => Promise.resolve(true)
    fixture.categories = store.categoryRepository
    fixture.tags = store.tagRepository
    expect((await request(command, data)).status).toBe(409)
    expect(fixture.publish).not.toHaveBeenCalled()
  })

  it.each([
    ['Category update', updateCategory, { id: 7, name: 'new', colorKey: 'blue' }],
    ['Category delete', deleteCategory, { id: 7 }],
    ['Tag update', updateTag, { id: 7, name: 'new', colorKey: 'blue' }],
    ['Tag delete', deleteTag, { id: 7 }],
  ])('%s rejects foreign resources without publishing', async (_name, command, data) => {
    fixture.userId = 'user-2'
    expect((await request(command, data)).status).toBe(404)
    expect(fixture.getByName).not.toHaveBeenCalled()
    expect(fixture.publish).not.toHaveBeenCalled()
  })
})
