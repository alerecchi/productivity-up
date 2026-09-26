import { Column } from 'drizzle-orm'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { describe, expect, it } from 'vitest'

import { createCategoryRepository } from '@/server/db/category-repository'
import type { Database } from '@/server/db/client'
import { createTagRepository } from '@/server/db/tag-repository'
import { CategoryNameConflictError } from '@/server/functions/categories/operations'
import { TagNameConflictError } from '@/server/functions/tags/operations'

const storedRow = { color_key: 'blue', id: 4, name: 'home', user_id: 'user-1' }

/** Answers every statement with one stored row, projected to the statement's selected columns like PostgreSQL would. */
function storedRowDatabase(): Database {
  const project = (selection: Record<string, unknown> = {}) =>
    Promise.resolve([
      Object.fromEntries(
        Object.entries(selection).map(([alias, column]) => [
          alias,
          column instanceof Column ? Reflect.get(storedRow, column.name) : undefined,
        ]),
      ),
    ])
  const returning = { returning: project }

  return {
    delete: () => ({ where: () => returning }),
    insert: () => ({ values: () => returning }),
    select: (selection?: Record<string, unknown>) => ({
      from: () => ({ where: () => ({ orderBy: () => project(selection) }) }),
    }),
    update: () => ({ set: () => ({ where: () => returning }) }),
  } as unknown as Database
}

function rejectedDatabase(error: Error): Database {
  const returning = () => Promise.reject(error)

  return {
    insert: () => ({ values: () => ({ returning }) }),
    update: () => ({ set: () => ({ where: () => ({ returning }) }) }),
  } as unknown as Database
}

function wrappedUniqueViolation(constraint: string) {
  const cause = Object.assign(new Error('duplicate key'), { code: '23505', constraint })
  return new DrizzleQueryError('insert or update', [], cause)
}

describe('taxonomy repository results', () => {
  const display = { colorKey: 'blue', id: 4, name: 'home' }

  it('reads and writes Categories as display data and deletes them by ID only', async () => {
    const repository = createCategoryRepository(storedRowDatabase())

    await expect(repository.createCategory({ colorKey: 'blue', name: 'home', userId: 'user-1' })).resolves.toEqual(
      display,
    )
    await expect(repository.updateCategory(4, 'user-1', { colorKey: 'blue', name: 'home' })).resolves.toEqual(display)
    await expect(repository.listCategoriesForUser('user-1')).resolves.toEqual([display])
    await expect(repository.deleteCategory(4, 'user-1')).resolves.toEqual({ categoryId: 4 })
  })

  it('reads and writes Tags as display data and deletes them by ID only', async () => {
    const repository = createTagRepository(storedRowDatabase())

    await expect(repository.createTag({ colorKey: 'blue', name: 'home', userId: 'user-1' })).resolves.toEqual(display)
    await expect(repository.updateTag(4, 'user-1', { colorKey: 'blue', name: 'home' })).resolves.toEqual(display)
    await expect(repository.listTagsForUser('user-1')).resolves.toEqual([display])
    await expect(repository.deleteTag(4, 'user-1')).resolves.toEqual({ tagId: 4 })
  })
})

describe('repository uniqueness conflicts', () => {
  it.each(['create', 'update'] as const)('maps a Drizzle-wrapped Category %s conflict', async (action) => {
    const repository = createCategoryRepository(
      rejectedDatabase(wrappedUniqueViolation('categories_user_id_name_unique')),
    )

    const result =
      action === 'create'
        ? repository.createCategory({ colorKey: 'blue', name: 'home', userId: 'user-1' })
        : repository.updateCategory(1, 'user-1', { colorKey: 'blue', name: 'home' })

    await expect(result).rejects.toBeInstanceOf(CategoryNameConflictError)
  })

  it.each(['create', 'update'] as const)('maps a Drizzle-wrapped Tag %s conflict', async (action) => {
    const repository = createTagRepository(rejectedDatabase(wrappedUniqueViolation('tags_user_id_name_unique')))

    const result =
      action === 'create'
        ? repository.createTag({ colorKey: 'blue', name: 'home', userId: 'user-1' })
        : repository.updateTag(1, 'user-1', { colorKey: 'blue', name: 'home' })

    await expect(result).rejects.toBeInstanceOf(TagNameConflictError)
  })

  it('does not hide a different constraint failure', async () => {
    const error = wrappedUniqueViolation('another_constraint')
    const repository = createCategoryRepository(rejectedDatabase(error))

    await expect(repository.createCategory({ colorKey: 'blue', name: 'home', userId: 'user-1' })).rejects.toBe(error)
  })
})
