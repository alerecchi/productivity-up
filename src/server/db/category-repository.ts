import { and, asc, eq } from 'drizzle-orm'

import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import type { Database } from '@/server/db/client'
import { isUniqueConstraintViolation } from '@/server/db/postgres-errors'
import { categories } from '@/server/db/schema/schema'
import type { CategoryDbInsert } from '@/server/db/types'
import { CategoryNameConflictError } from '@/server/functions/categories/operations'
import type { CategoryRepository } from '@/server/functions/categories/operations'

const categoryDisplay = { colorKey: categories.colorKey, id: categories.id, name: categories.name }

/** Production Category repository. Every write is one owner-scoped statement returning only display data. */
export function createCategoryRepository(db: Database): CategoryRepository {
  return {
    async createCategory(categoryToAdd: CategoryDbInsert) {
      const [category] = await db
        .insert(categories)
        .values(categoryToAdd)
        .returning(categoryDisplay)
        .catch(mapNameConflict)

      return category
    },
    async deleteCategory(categoryId, userId) {
      const [category] = await db
        .delete(categories)
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
        .returning({ categoryId: categories.id })

      return category
    },
    hasPendingMigrationBuckets(userId) {
      return hasPendingMigrationBuckets(db, userId)
    },
    listCategoriesForUser(userId: string) {
      return db
        .select(categoryDisplay)
        .from(categories)
        .where(eq(categories.userId, userId))
        .orderBy(asc(categories.name))
    },
    async updateCategory(categoryId, userId, updates) {
      const [category] = await db
        .update(categories)
        .set(updates)
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
        .returning(categoryDisplay)
        .catch(mapNameConflict)

      return category
    },
  }
}

function mapNameConflict(error: unknown): never {
  if (isUniqueConstraintViolation(error, 'categories_user_id_name_unique')) {
    throw new CategoryNameConflictError()
  }

  throw error
}
