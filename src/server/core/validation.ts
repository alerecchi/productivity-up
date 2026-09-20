import { z } from 'zod'

import { USER_TIME_ZONE_MAX_LENGTH } from '@/lib/auth-user-fields'

export { UserTimeZoneSchema } from '@/lib/auth-user-fields'

export const POSTGRES_ID_MAX = 2_147_483_647
export const TIME_ZONE_MAX_LENGTH = USER_TIME_ZONE_MAX_LENGTH
export const TODO_DESCRIPTION_MAX_LENGTH = 10_000
export const TODO_TAGS_MAX_COUNT = 50
export const TODO_TITLE_MAX_LENGTH = 256
export const MIGRATION_DECISIONS_MAX_COUNT = 500

export const PositiveIdSchema = z.int().positive().max(POSTGRES_ID_MAX)

export const EmptyInputSchema = z.object({}).strict().default({})

export class RequestValidationError extends Error {
  readonly issues: Array<z.core.$ZodIssue>

  constructor(issues: Array<z.core.$ZodIssue>) {
    super('Request validation failed')
    this.name = 'RequestValidationError'
    this.issues = issues
  }
}

export function strictInput<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).strict()
}

export function boundedUniqueIds(maxLength: number) {
  return z
    .array(PositiveIdSchema)
    .max(maxLength)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Identifiers must be unique',
    })
}

export function validateInput<TSchema extends z.ZodType>(schema: TSchema) {
  return (input: z.input<TSchema>): z.output<TSchema> => {
    const result = schema.safeParse(input)

    if (!result.success) {
      throw new RequestValidationError(result.error.issues)
    }

    return result.data
  }
}
