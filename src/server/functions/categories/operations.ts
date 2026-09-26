import type { z } from 'zod'

import type { CategoryDisplay } from '@/lib/types/Category'
import { errorResponse } from '@/server/core/errors'
import { requireNoPendingMigrationBuckets } from '@/server/core/pending-migration-gate'
import type { CategoryDbInsert } from '@/server/db/types'
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
}

/**
 * User-scoped Category persistence. Updates and deletes resolve `undefined` for missing and foreign Categories alike;
 * creates and updates reject with `CategoryNameConflictError` when the (User, name) uniqueness constraint fails.
 */
export type CategoryRepository = {
  createCategory: (category: CategoryDbInsert) => Promise<CategoryDisplay>
  deleteCategory: (categoryId: number, userId: string) => Promise<DeletedCategory | undefined>
  hasPendingMigrationBuckets: (userId: string) => Promise<boolean>
  listCategoriesForUser: (userId: string) => Promise<Array<CategoryDisplay>>
  updateCategory: (
    categoryId: number,
    userId: string,
    updates: Pick<CategoryDbInsert, 'colorKey' | 'name'>,
  ) => Promise<CategoryDisplay | undefined>
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
  return repository
    .createCategory({
      colorKey: data.colorKey,
      name: normalizeCategoryName(data.name),
      userId,
    })
    .catch(mapCategoryNameConflict)
}

export function listCategoriesForUser({ repository, userId }: ListCategoriesDependencies) {
  return repository.listCategoriesForUser(userId)
}

export async function updateCategoryForUser({ data, repository, userId }: UpdateCategoryDependencies) {
  await requireNoPendingMigrationBuckets(repository, userId, 'Categories')
  const category = await repository
    .updateCategory(data.id, userId, {
      colorKey: data.colorKey,
      name: normalizeCategoryName(data.name),
    })
    .catch(mapCategoryNameConflict)

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

function mapCategoryNameConflict(error: unknown): never {
  if (error instanceof CategoryNameConflictError) {
    throw errorResponse(409, error.message)
  }

  throw error
}
