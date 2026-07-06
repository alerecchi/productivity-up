import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'

import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import { db } from '@/server/db/client'
import { categories } from '@/server/db/schema/schema'
import type { CategoryDbInsert } from '@/server/db/types'
import type { CategoryRepository } from '@/server/functions/categories.core'
import {
  CategoryNameConflictError,
  CreateCategoryInput,
  DeleteCategoryInput,
  UpdateCategoryInput,
  createCategoryForUser,
  deleteCategoryForUser,
  listCategoriesForUser,
  updateCategoryForUser,
} from '@/server/functions/categories.core'
import { authRequiredMiddleware } from '@/server/middlewares/auth-middleware'

export const createCategory = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(CreateCategoryInput)
  .handler(async ({ data, context }) => {
    return createCategoryForUser({
      data,
      repository: categoryRepository,
      userId: context.session.user.id,
    })
  })

export const listCategories = createServerFn()
  .middleware([authRequiredMiddleware])
  .handler(async ({ context }) => {
    return listCategoriesForUser({
      repository: categoryRepository,
      userId: context.session.user.id,
    })
  })

export const updateCategory = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(UpdateCategoryInput)
  .handler(async ({ data, context }) => {
    return updateCategoryForUser({
      data,
      repository: categoryRepository,
      userId: context.session.user.id,
    })
  })

export const deleteCategory = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(DeleteCategoryInput)
  .handler(async ({ data, context }) => {
    return deleteCategoryForUser({
      data,
      repository: categoryRepository,
      userId: context.session.user.id,
    })
  })

const categoryRepository: CategoryRepository = {
  async createCategory(categoryToAdd: CategoryDbInsert) {
    const [category] = await db
      .insert(categories)
      .values(categoryToAdd)
      .returning()
      .catch((error: unknown) => {
        if (isCategoryNameUniqueViolation(error)) {
          throw new CategoryNameConflictError()
        }

        throw error
      })

    return category
  },
  async deleteCategory(categoryId, userId) {
    const [category] = await db
      .delete(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .returning({
        categoryId: categories.id,
        userId: categories.userId,
      })

    return category
  },
  findCategoryByName(userId: string, name: string) {
    return db.query.categories.findFirst({
      where: and(eq(categories.userId, userId), eq(categories.name, name)),
    })
  },
  hasPendingMigrationBuckets,
  listCategoriesForUser(userId: string) {
    return db.query.categories.findMany({
      orderBy: [asc(categories.name)],
      where: eq(categories.userId, userId),
    })
  },
  async updateCategory(categoryId, userId, updates) {
    const [category] = await db
      .update(categories)
      .set(updates)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .returning()

    return category
  },
}

function isCategoryNameUniqueViolation(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeDatabaseError = error as {
    code?: unknown
    constraint?: unknown
    constraint_name?: unknown
  }

  if (maybeDatabaseError.code !== '23505') {
    return false
  }

  return (
    maybeDatabaseError.constraint === undefined ||
    maybeDatabaseError.constraint === 'categories_user_id_name_unique' ||
    maybeDatabaseError.constraint_name === 'categories_user_id_name_unique'
  )
}
