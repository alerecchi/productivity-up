import { z } from 'zod'

import { CategoryColorKeySchema } from '@/lib/types/Category'
import type { CategoryDbInsert, CategoryDbSelect } from '@/server/db/types'
import { requireNoPendingMigrationBuckets } from '@/server/functions/pending-migration-gate'
import { errorResponse } from '@/server/utils'

export class CategoryNameConflictError extends Error {
  constructor() {
    super('Category name already exists')
  }
}

export const CreateCategoryInput = z
  .object({
    colorKey: CategoryColorKeySchema,
    name: z.string().trim().min(1).max(64),
  })
  .strict()

export const UpdateCategoryInput = z
  .object({
    colorKey: CategoryColorKeySchema,
    id: z.number().int(),
    name: z.string().trim().min(1).max(64),
  })
  .strict()

export const DeleteCategoryInput = z
  .object({
    id: z.number().int(),
  })
  .strict()

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

  const category = await repository.updateCategory(data.id, userId, {
    colorKey: data.colorKey,
    name,
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
