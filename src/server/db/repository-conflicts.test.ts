import { DrizzleQueryError } from 'drizzle-orm/errors'
import { describe, expect, it } from 'vitest'

import { createCategoryRepository } from '@/server/db/category-repository'
import type { Database } from '@/server/db/client'
import { createTagRepository } from '@/server/db/tag-repository'
import { CategoryNameConflictError } from '@/server/functions/categories/operations'
import { TagNameConflictError } from '@/server/functions/tags/operations'

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
