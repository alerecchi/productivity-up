import { and, asc, eq } from 'drizzle-orm'

import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import type { Database } from '@/server/db/client'
import { isUniqueConstraintViolation } from '@/server/db/postgres-errors'
import { categories } from '@/server/db/schema/schema'
import type { CategoryDbInsert } from '@/server/db/types'
import { CategoryNameConflictError } from '@/server/functions/categories/operations'
import type { CategoryRepository } from '@/server/functions/categories/operations'

export function createCategoryRepository(db: Database): CategoryRepository {
  return {
    async createCategory(categoryToAdd: CategoryDbInsert) {
      const [category] = await db
        .insert(categories)
        .values(categoryToAdd)
        .returning()
        .catch((error: unknown) => {
          if (isUniqueConstraintViolation(error, 'categories_user_id_name_unique')) {
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
    hasPendingMigrationBuckets(userId) {
      return hasPendingMigrationBuckets(db, userId)
    },
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
        .catch((error: unknown) => {
          if (isUniqueConstraintViolation(error, 'categories_user_id_name_unique')) {
            throw new CategoryNameConflictError()
          }

          throw error
        })

      return category
    },
  }
}
