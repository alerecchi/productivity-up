import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { todos } from '@/server/db/schema/schema'

import {
  CategoryNameConflictError,
  CreateCategoryInput,
  DeleteCategoryInput,
  UpdateCategoryInput,
  createCategoryForUser,
  deleteCategoryForUser,
  listCategoriesForUser,
  updateCategoryForUser,
} from './categories.core'
import type { CategoryRepository } from './categories.core'

const existingCategory = {
  colorKey: 'blue',
  id: 4,
  name: 'home admin',
  userId: 'user-1',
} as const

const createRepository = (overrides: Partial<CategoryRepository> = {}): CategoryRepository => ({
  createCategory: vi.fn((categoryToCreate) => Promise.resolve({ id: 8, ...categoryToCreate })),
  deleteCategory: vi.fn((categoryId, userId) => Promise.resolve({ categoryId, userId })),
  findCategoryByName: vi.fn(() => Promise.resolve(undefined)),
  hasPendingMigrationBuckets: vi.fn(() => Promise.resolve(false)),
  updateCategory: vi.fn((categoryId, userId, updates) =>
    Promise.resolve({
      ...existingCategory,
      ...updates,
      id: categoryId,
      userId,
    }),
  ),
  listCategoriesForUser: vi.fn(() => Promise.resolve([])),
  ...overrides,
})

describe('category server behavior', () => {
  it('creates a user-owned Category with a normalized reusable name', async () => {
    const repository = createRepository()

    const category = await createCategoryForUser({
      data: CreateCategoryInput.parse({
        colorKey: 'green',
        name: '  Home   Admin  ',
      }),
      repository,
      userId: existingCategory.userId,
    })

    expect(repository.createCategory).toHaveBeenCalledWith({
      colorKey: 'green',
      name: 'home admin',
      userId: existingCategory.userId,
    })
    expect(category).toMatchObject({
      colorKey: 'green',
      name: 'home admin',
      userId: existingCategory.userId,
    })
  })

  it('rejects Category management while a Pending Migration Bucket gates the board', async () => {
    const repository = createRepository({
      hasPendingMigrationBuckets: vi.fn(() => Promise.resolve(true)),
    })

    await expect(
      createCategoryForUser({
        data: { colorKey: 'green', name: 'home admin' },
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 409)
    await expect(
      updateCategoryForUser({
        data: { colorKey: 'green', id: existingCategory.id, name: 'life admin' },
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 409)
    await expect(
      deleteCategoryForUser({
        data: { id: existingCategory.id },
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.createCategory).not.toHaveBeenCalled()
    expect(repository.updateCategory).not.toHaveBeenCalled()
    expect(repository.deleteCategory).not.toHaveBeenCalled()
  })

  it('rejects duplicate Category creation without selecting the existing Category', async () => {
    const repository = createRepository({
      findCategoryByName: vi.fn(() => Promise.resolve(existingCategory)),
    })

    await expect(
      createCategoryForUser({
        data: CreateCategoryInput.parse({
          colorKey: 'rose',
          name: 'HOME ADMIN',
        }),
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.findCategoryByName).toHaveBeenCalledWith(existingCategory.userId, existingCategory.name)
    expect(repository.createCategory).not.toHaveBeenCalled()
  })

  it('rejects a raced Category create conflict that reaches the repository insert', async () => {
    const repository = createRepository({
      createCategory: vi.fn(() => Promise.reject(new CategoryNameConflictError())),
    })

    await expect(
      createCategoryForUser({
        data: CreateCategoryInput.parse({
          colorKey: 'rose',
          name: 'HOME ADMIN',
        }),
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.findCategoryByName).toHaveBeenCalledWith(existingCategory.userId, existingCategory.name)
    expect(repository.createCategory).toHaveBeenCalledWith({
      colorKey: 'rose',
      name: existingCategory.name,
      userId: existingCategory.userId,
    })
  })

  it('rejects invalid Category create input at the validation boundary', () => {
    expect(
      CreateCategoryInput.safeParse({
        colorKey: 'legacy-color',
        name: 'Home admin',
      }).success,
    ).toBe(false)
    expect(
      CreateCategoryInput.safeParse({
        colorKey: 'blue',
        name: '',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid Category update input at the validation boundary', () => {
    expect(
      UpdateCategoryInput.safeParse({
        colorKey: 'legacy-color',
        id: existingCategory.id,
        name: 'Home admin',
      }).success,
    ).toBe(false)
    expect(
      UpdateCategoryInput.safeParse({
        colorKey: 'blue',
        id: existingCategory.id,
        name: '   ',
      }).success,
    ).toBe(false)
  })

  it('lists Categories for the current user only', async () => {
    const repository = createRepository({
      listCategoriesForUser: vi.fn(() => Promise.resolve([existingCategory])),
    })

    const categories = await listCategoriesForUser({
      repository,
      userId: existingCategory.userId,
    })

    expect(repository.listCategoriesForUser).toHaveBeenCalledWith(existingCategory.userId)
    expect(categories).toEqual([existingCategory])
  })

  it('updates an owned Category with a normalized reusable name and curated color', async () => {
    const repository = createRepository()

    const category = await updateCategoryForUser({
      data: UpdateCategoryInput.parse({
        colorKey: 'green',
        id: existingCategory.id,
        name: '  Life   Admin  ',
      }),
      repository,
      userId: existingCategory.userId,
    })

    expect(repository.updateCategory).toHaveBeenCalledWith(existingCategory.id, existingCategory.userId, {
      colorKey: 'green',
      name: 'life admin',
    })
    expect(category).toMatchObject({
      colorKey: 'green',
      id: existingCategory.id,
      name: 'life admin',
      userId: existingCategory.userId,
    })
  })

  it("rejects updating another user's Category", async () => {
    const repository = createRepository({
      updateCategory: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      updateCategoryForUser({
        data: {
          colorKey: 'green',
          id: existingCategory.id,
          name: 'life admin',
        },
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.updateCategory).toHaveBeenCalledWith(existingCategory.id, existingCategory.userId, {
      colorKey: 'green',
      name: 'life admin',
    })
  })

  it('rejects renaming a Category to another existing Category name for the same user', async () => {
    const repository = createRepository({
      findCategoryByName: vi.fn(() =>
        Promise.resolve({
          colorKey: 'rose',
          id: 9,
          name: 'life admin',
          userId: existingCategory.userId,
        } as const),
      ),
    })

    await expect(
      updateCategoryForUser({
        data: {
          colorKey: 'green',
          id: existingCategory.id,
          name: '  Life   Admin  ',
        },
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.findCategoryByName).toHaveBeenCalledWith(existingCategory.userId, 'life admin')
    expect(repository.updateCategory).not.toHaveBeenCalled()
  })

  it('allows casing-only Category edits to keep the normalized lowercase name', async () => {
    const repository = createRepository({
      findCategoryByName: vi.fn(() => Promise.resolve(existingCategory)),
    })

    const category = await updateCategoryForUser({
      data: {
        colorKey: 'blue',
        id: existingCategory.id,
        name: 'HOME ADMIN',
      },
      repository,
      userId: existingCategory.userId,
    })

    expect(repository.updateCategory).toHaveBeenCalledWith(existingCategory.id, existingCategory.userId, {
      colorKey: 'blue',
      name: 'home admin',
    })
    expect(category.name).toBe('home admin')
  })

  it('deletes an owned Category', async () => {
    const repository = createRepository()

    const deletedCategory = await deleteCategoryForUser({
      data: DeleteCategoryInput.parse({
        id: existingCategory.id,
      }),
      repository,
      userId: existingCategory.userId,
    })

    expect(repository.deleteCategory).toHaveBeenCalledWith(existingCategory.id, existingCategory.userId)
    expect(deletedCategory).toEqual({
      categoryId: existingCategory.id,
      userId: existingCategory.userId,
    })
  })

  it("rejects deleting another user's Category", async () => {
    const repository = createRepository({
      deleteCategory: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      deleteCategoryForUser({
        data: {
          id: existingCategory.id,
        },
        repository,
        userId: existingCategory.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.deleteCategory).toHaveBeenCalledWith(existingCategory.id, existingCategory.userId)
  })

  it('clears Todo Category references when a Category is deleted', () => {
    const categoryForeignKey = getTableConfig(todos).foreignKeys.find(
      (foreignKey) => foreignKey.getName() === 'todos_category_id_categories_id_fk',
    )

    expect(categoryForeignKey?.onDelete).toBe('set null')
  })
})
