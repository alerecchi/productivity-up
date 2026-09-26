import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import type { CategoryDisplay } from '@/lib/types/Category'
import { TodoSchema } from '@/lib/types/Todo'
import { todos } from '@/server/db/schema/schema'

import {
  CategoryNameConflictError,
  createCategoryForUser,
  deleteCategoryForUser,
  listCategoriesForUser,
  updateCategoryForUser,
} from './operations'
import type { CategoryRepository } from './operations'
import { CategoryResponse, CreateCategoryInput, UpdateCategoryInput } from './schemas'

type StoredCategory = CategoryDisplay & { userId: string }

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const homeAdmin: StoredCategory = { colorKey: 'blue', id: 4, name: 'home admin', userId: USER_ID }
const foreignWork: StoredCategory = { colorKey: 'teal', id: 9, name: 'work', userId: OTHER_USER_ID }
const conflict = { code: 'CONFLICT', message: 'Category name already exists', status: 409 }
const notFound = { code: 'RESOURCE_NOT_FOUND', status: 404 }

/** Runs a fake repository write so that thrown errors reject, like the production repository's statements. */
function settle<T>(write: () => T) {
  return new Promise<T>((resolve) => resolve(write()))
}

/** Models the owner-scoped SQL predicates and the (user_id, name) unique index of the production repository. */
function createCategoryStore(initialCategories: Array<StoredCategory> = [], { pendingMigration = false } = {}) {
  const categories = initialCategories.map((category) => ({ ...category }))
  let nextId = Math.max(0, ...categories.map((category) => category.id)) + 1

  const assertUniqueName = (userId: string, name: string, exceptId?: number) => {
    if (
      categories.some((category) => category.userId === userId && category.name === name && category.id !== exceptId)
    ) {
      throw new CategoryNameConflictError()
    }
  }
  const toDisplay = ({ colorKey, id, name }: StoredCategory): CategoryDisplay => ({ colorKey, id, name })

  const repository: CategoryRepository = {
    createCategory: (category) =>
      settle(() => {
        assertUniqueName(category.userId, category.name)
        const created = { ...category, id: nextId++ }
        categories.push(created)
        return toDisplay(created)
      }),
    deleteCategory: (categoryId, userId) =>
      settle(() => {
        const index = categories.findIndex((category) => category.id === categoryId && category.userId === userId)
        if (index === -1) {
          return undefined
        }
        categories.splice(index, 1)
        return { categoryId }
      }),
    hasPendingMigrationBuckets: () => Promise.resolve(pendingMigration),
    listCategoriesForUser: (userId) =>
      Promise.resolve(
        categories
          .filter((category) => category.userId === userId)
          .toSorted((left, right) => left.name.localeCompare(right.name))
          .map(toDisplay),
      ),
    updateCategory: (categoryId, userId, updates) =>
      settle(() => {
        const category = categories.find((stored) => stored.id === categoryId && stored.userId === userId)
        if (!category) {
          return undefined
        }
        assertUniqueName(userId, updates.name, categoryId)
        Object.assign(category, updates)
        return toDisplay(category)
      }),
  }

  return { categories, repository }
}

describe('Category commands', () => {
  it('creates a Category with a normalized name and returns only its display data', async () => {
    const { repository } = createCategoryStore([foreignWork])

    const category = await createCategoryForUser({
      data: CreateCategoryInput.parse({ colorKey: 'green', name: '  Work   Life  ' }),
      repository,
      userId: USER_ID,
    })

    expect(category).toEqual({ colorKey: 'green', id: 10, name: 'work life' })
  })

  it('allows a Category name that another User already uses', async () => {
    const { repository } = createCategoryStore([foreignWork])

    await expect(
      createCategoryForUser({ data: { colorKey: 'rose', name: 'Work' }, repository, userId: USER_ID }),
    ).resolves.toMatchObject({ name: 'work' })
  })

  it('rejects a duplicate Category name with the uniqueness conflict contract', async () => {
    const { repository } = createCategoryStore([homeAdmin])

    await expect(
      createCategoryForUser({
        data: CreateCategoryInput.parse({ colorKey: 'rose', name: 'HOME  Admin' }),
        repository,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject(conflict)
  })

  it('updates an owned Category and returns only its display data', async () => {
    const { repository } = createCategoryStore([homeAdmin])

    const category = await updateCategoryForUser({
      data: UpdateCategoryInput.parse({ colorKey: 'green', id: homeAdmin.id, name: '  Life   Admin ' }),
      repository,
      userId: USER_ID,
    })

    expect(category).toEqual({ colorKey: 'green', id: homeAdmin.id, name: 'life admin' })
  })

  it.each([
    ['casing-only', { colorKey: 'blue', name: 'HOME ADMIN' }],
    ['color-only', { colorKey: 'violet', name: 'home admin' }],
  ] as const)('keeps %s Category edits free of conflicts', async (_edit, changes) => {
    const { repository } = createCategoryStore([homeAdmin])

    const category = await updateCategoryForUser({
      data: { ...changes, id: homeAdmin.id },
      repository,
      userId: USER_ID,
    })

    expect(category).toEqual({ colorKey: changes.colorKey, id: homeAdmin.id, name: 'home admin' })
  })

  it('rejects renaming a Category to another owned Category name with the uniqueness conflict contract', async () => {
    const { categories, repository } = createCategoryStore([
      homeAdmin,
      { colorKey: 'rose', id: 5, name: 'life admin', userId: USER_ID },
    ])

    await expect(
      updateCategoryForUser({
        data: { colorKey: 'green', id: homeAdmin.id, name: 'Life Admin' },
        repository,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject(conflict)
    expect(categories.find((category) => category.id === homeAdmin.id)).toEqual(homeAdmin)
  })

  it.each([
    ['missing', 99],
    ['foreign', foreignWork.id],
  ])('rejects updating a %s Category as not found', async (_case, id) => {
    const { categories, repository } = createCategoryStore([homeAdmin, foreignWork])

    await expect(
      updateCategoryForUser({ data: { colorKey: 'green', id, name: 'renamed' }, repository, userId: USER_ID }),
    ).rejects.toMatchObject(notFound)
    expect(categories).toEqual([homeAdmin, foreignWork])
  })

  it('deletes an owned Category and returns only its ID', async () => {
    const { categories, repository } = createCategoryStore([homeAdmin, foreignWork])

    const deleted = await deleteCategoryForUser({ data: { id: homeAdmin.id }, repository, userId: USER_ID })

    expect(deleted).toEqual({ categoryId: homeAdmin.id })
    expect(categories).toEqual([foreignWork])
  })

  it.each([
    ['missing', 99],
    ['foreign', foreignWork.id],
  ])('rejects deleting a %s Category as not found', async (_case, id) => {
    const { categories, repository } = createCategoryStore([homeAdmin, foreignWork])

    await expect(deleteCategoryForUser({ data: { id }, repository, userId: USER_ID })).rejects.toMatchObject(notFound)
    expect(categories).toEqual([homeAdmin, foreignWork])
  })

  it("lists only the User's Categories as display data", async () => {
    const { repository } = createCategoryStore([homeAdmin, foreignWork])

    await expect(listCategoriesForUser({ repository, userId: USER_ID })).resolves.toEqual([
      { colorKey: 'blue', id: homeAdmin.id, name: 'home admin' },
    ])
  })

  it('rejects Category changes while a Pending Migration Bucket gates the board', async () => {
    const { categories, repository } = createCategoryStore([homeAdmin], { pendingMigration: true })
    const gated = { status: 409 }

    await expect(
      createCategoryForUser({ data: { colorKey: 'green', name: 'work' }, repository, userId: USER_ID }),
    ).rejects.toMatchObject(gated)
    await expect(
      updateCategoryForUser({
        data: { colorKey: 'green', id: homeAdmin.id, name: 'work' },
        repository,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject(gated)
    await expect(
      deleteCategoryForUser({ data: { id: homeAdmin.id }, repository, userId: USER_ID }),
    ).rejects.toMatchObject(gated)
    expect(categories).toEqual([homeAdmin])
  })

  it('returns the same Category display shape that Todos embed', () => {
    expect(CategoryResponse).toBe(TodoSchema.shape.category.unwrap())
  })

  it('clears Todo Category references when a Category is deleted', () => {
    const categoryForeignKey = getTableConfig(todos).foreignKeys.find(
      (foreignKey) => foreignKey.getName() === 'todos_category_id_categories_id_fk',
    )

    expect(categoryForeignKey?.onDelete).toBe('set null')
  })

  it('rejects invalid Category input at the validation boundary', () => {
    expect(CreateCategoryInput.safeParse({ colorKey: 'legacy-color', name: 'Home admin' }).success).toBe(false)
    expect(CreateCategoryInput.safeParse({ colorKey: 'blue', name: '' }).success).toBe(false)
    expect(UpdateCategoryInput.safeParse({ colorKey: 'blue', id: homeAdmin.id, name: '   ' }).success).toBe(false)
  })
})
