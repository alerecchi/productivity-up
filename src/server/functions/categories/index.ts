import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { createPrivateOperation, validateInput } from '@/server/core'
import { createCategoryRepository } from '@/server/db/category-repository'
import {
  createCategoryForUser,
  deleteCategoryForUser,
  listCategoriesForUser,
  updateCategoryForUser,
} from '@/server/functions/categories/operations'
import {
  CategoriesResponse,
  CategoryResponse,
  CreateCategoryInput,
  DeleteCategoryInput,
  DeleteCategoryResponse,
  ListCategoriesInput,
  UpdateCategoryInput,
} from '@/server/functions/categories/schemas'

export const createCategory = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'categories.create', response: CategoryResponse })])
  .validator(validateInput(CreateCategoryInput))
  .handler(async ({ data, context }): Promise<z.output<typeof CategoryResponse>> => {
    return createCategoryForUser({ data, repository: createCategoryRepository(context.db), userId: context.user.id })
  })

export const listCategories = createServerFn({ method: 'GET' })
  .middleware([createPrivateOperation({ operation: 'categories.list', response: CategoriesResponse })])
  .validator(validateInput(ListCategoriesInput))
  .handler(async ({ context }): Promise<z.output<typeof CategoriesResponse>> => {
    return listCategoriesForUser({ repository: createCategoryRepository(context.db), userId: context.user.id })
  })

export const updateCategory = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'categories.update', response: CategoryResponse })])
  .validator(validateInput(UpdateCategoryInput))
  .handler(async ({ data, context }): Promise<z.output<typeof CategoryResponse>> => {
    return updateCategoryForUser({ data, repository: createCategoryRepository(context.db), userId: context.user.id })
  })

export const deleteCategory = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'categories.delete', response: DeleteCategoryResponse })])
  .validator(validateInput(DeleteCategoryInput))
  .handler(async ({ data, context }): Promise<z.output<typeof DeleteCategoryResponse>> => {
    return deleteCategoryForUser({ data, repository: createCategoryRepository(context.db), userId: context.user.id })
  })
