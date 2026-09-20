import { z } from 'zod'

import { CategoryColorKeySchema, CategoryDisplaySchema } from '@/lib/types/Category'
import { EmptyInputSchema, PositiveIdSchema, strictInput } from '@/server/core/validation'

export const CATEGORY_NAME_MAX_LENGTH = 64

export const CreateCategoryInput = strictInput({
  colorKey: CategoryColorKeySchema,
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
})

export const ListCategoriesInput = EmptyInputSchema

export const UpdateCategoryInput = strictInput({
  colorKey: CategoryColorKeySchema,
  id: PositiveIdSchema,
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
})

export const DeleteCategoryInput = strictInput({ id: PositiveIdSchema })

export const CategoryResponse = CategoryDisplaySchema
export const CategoriesResponse = z.array(CategoryDisplaySchema)
export const DeleteCategoryResponse = z.object({ categoryId: PositiveIdSchema })
