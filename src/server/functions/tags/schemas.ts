import { z } from 'zod'

import { TagColorKeySchema, TagDisplaySchema } from '@/lib/types/Tag'
import { EmptyInputSchema, PositiveIdSchema, strictInput } from '@/server/core/validation'

export const TAG_NAME_MAX_LENGTH = 32

const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(TAG_NAME_MAX_LENGTH)
  .transform((name) => name.toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/))

export const CreateTagInput = strictInput({
  colorKey: TagColorKeySchema,
  name: tagNameSchema,
})

export const ListTagsInput = EmptyInputSchema

export const UpdateTagInput = strictInput({
  colorKey: TagColorKeySchema,
  id: PositiveIdSchema,
  name: tagNameSchema,
})

export const DeleteTagInput = strictInput({ id: PositiveIdSchema })

export const TagResponse = TagDisplaySchema
export const TagsResponse = z.array(TagDisplaySchema)
export const DeleteTagResponse = z.object({ tagId: PositiveIdSchema })
