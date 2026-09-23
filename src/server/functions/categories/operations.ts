import type { z } from 'zod'

import { errorResponse } from '@/server/core/errors'
import { requireNoPendingMigrationBuckets } from '@/server/core/pending-migration-gate'
import type { CategoryDbInsert, CategoryDbSelect } from '@/server/db/types'
import type {
  CreateCategoryInput,
  DeleteCategoryInput,
  UpdateCategoryInput,
} from '@/server/functions/categories/schemas'

export class CategoryNameConflictError extends Error {
  constructor() {
    super('Category name already exists')
  }
}

export type DeletedCategory = {
  categoryId: number
  userId: string
}

export type CategoryRepository = {
  createCategory: (category: CategoryDbInsert) => Promise<CategoryDbSelect>
  deleteCategory: (categoryId: number, userId: string) => Promise<DeletedCategory | undefined>
  findCategoryByName: (userId: string, name: string) => Promise<CategoryDbSelect | undefined>
  hasPendingMigrationBuckets: (userId: string) => Promise<boolean>
  listCategoriesForUser: (userId: string) => Promise<Array<CategoryDbSelect>>
  updateCategory: (
    categoryId: number,
    userId: string,
    updates: Pick<CategoryDbInsert, 'colorKey' | 'name'>,
  ) => Promise<CategoryDbSelect | undefined>
}

type CreateCategoryDependencies = {
  data: z.output<typeof CreateCategoryInput>
  repository: CategoryRepository
  userId: string
}

type ListCategoriesDependencies = {
  repository: CategoryRepository
  userId: string
}

type UpdateCategoryDependencies = {
  data: z.output<typeof UpdateCategoryInput>
  repository: CategoryRepository
  userId: string
}

type DeleteCategoryDependencies = {
  data: z.output<typeof DeleteCategoryInput>
  repository: CategoryRepository
  userId: string
}

export async function createCategoryForUser({ data, repository, userId }: CreateCategoryDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Categories')
  const name = normalizeCategoryName(data.name)
  const categoryWithName = await repository.findCategoryByName(userId, name)

  if (categoryWithName) {
    throw errorResponse(409, 'Category name already exists')
  }

  return repository
    .createCategory({
      colorKey: data.colorKey,
      name,
      userId,
    })
    .catch((error: unknown) => {
      if (error instanceof CategoryNameConflictError) {
        throw errorResponse(409, error.message)
      }

      throw error
    })
}

export function listCategoriesForUser({ repository, userId }: ListCategoriesDependencies) {
  return repository.listCategoriesForUser(userId)
}

export async function updateCategoryForUser({ data, repository, userId }: UpdateCategoryDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Categories')
  const name = normalizeCategoryName(data.name)
  const categoryWithName = await repository.findCategoryByName(userId, name)

  if (categoryWithName && categoryWithName.id !== data.id) {
    throw errorResponse(409, 'Category name already exists')
  }

  const category = await repository
    .updateCategory(data.id, userId, {
      colorKey: data.colorKey,
      name,
    })
    .catch((error: unknown) => {
      if (error instanceof CategoryNameConflictError) {
        throw errorResponse(409, error.message)
      }

      throw error
    })

  if (!category) {
    throw errorResponse(404, 'Category not found or unauthorized')
  }

  return category
}

export async function deleteCategoryForUser({ data, repository, userId }: DeleteCategoryDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Categories')
  const deletedCategory = await repository.deleteCategory(data.id, userId)

  if (!deletedCategory) {
    throw errorResponse(404, 'Category not found or unauthorized')
  }

  return deletedCategory
}

export function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}
