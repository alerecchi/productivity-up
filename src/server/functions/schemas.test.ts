import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  MIGRATION_DECISIONS_MAX_COUNT,
  POSTGRES_ID_MAX,
  PositiveIdSchema,
  TODO_DESCRIPTION_MAX_LENGTH,
  TODO_TAGS_MAX_COUNT,
  TODO_TITLE_MAX_LENGTH,
  UserTimeZoneSchema,
} from '@/server/core/validation'
import {
  CompleteDayInput,
  ConfirmMigrationStepInput,
  GetBoardInput,
  GetBucketsInput,
  GetMigrationStepInput,
  MigrationStepResponse,
} from '@/server/functions/board/schemas'
import {
  CATEGORY_NAME_MAX_LENGTH,
  CreateCategoryInput,
  DeleteCategoryInput,
  ListCategoriesInput,
  UpdateCategoryInput,
} from '@/server/functions/categories/schemas'
import { PRIVATE_OPERATION_NAMES } from '@/server/functions/private-operation-inventory'
import {
  CreateTagInput,
  DeleteTagInput,
  ListTagsInput,
  TAG_NAME_MAX_LENGTH,
  UpdateTagInput,
} from '@/server/functions/tags/schemas'
import {
  CreateTodoInput,
  DeleteTodoInput,
  GetTodosInput,
  MoveTodoInput,
  TodoResponse,
  UpdateTodoInput,
} from '@/server/functions/todos/schemas'

const schemaCases: Array<[string, z.ZodType, unknown]> = [
  ['board.get', GetBoardInput, { browserTimeZone: 'Europe/Berlin' }],
  ['board.completeDay', CompleteDayInput, undefined],
  ['board.getMigrationStep', GetMigrationStepInput, { sourceBucketId: 1 }],
  ['board.confirmMigrationStep', ConfirmMigrationStepInput, { decisions: { 1: 'carry_forward' }, sourceBucketId: 1 }],
  ['board.getBuckets', GetBucketsInput, undefined],
  ['categories.create', CreateCategoryInput, { colorKey: 'blue', name: 'a' }],
  ['categories.list', ListCategoriesInput, undefined],
  ['categories.update', UpdateCategoryInput, { colorKey: 'blue', id: 1, name: 'a' }],
  ['categories.delete', DeleteCategoryInput, { id: 1 }],
  ['tags.create', CreateTagInput, { colorKey: 'blue', name: 'a' }],
  ['tags.list', ListTagsInput, undefined],
  ['tags.update', UpdateTagInput, { colorKey: 'blue', id: 1, name: 'a' }],
  ['tags.delete', DeleteTagInput, { id: 1 }],
  ['todos.create', CreateTodoInput, { bucketId: 1, title: 'a' }],
  ['todos.list', GetTodosInput, { bucketId: 1 }],
  ['todos.update', UpdateTodoInput, { id: 1, title: 'a' }],
  ['todos.move', MoveTodoInput, { id: 1, targetBucketId: 2 }],
  ['todos.delete', DeleteTodoInput, { id: 1 }],
]

describe('private operation input schemas', () => {
  it('has one strict schema for every private operation', () => {
    expect(schemaCases.map(([operation]) => operation)).toEqual(PRIVATE_OPERATION_NAMES)

    for (const [, schema, input] of schemaCases) {
      expect(schema.safeParse(input).success).toBe(true)
      expect(schema.safeParse({ ...(input ?? {}), unexpected: true }).success).toBe(false)
    }
  })

  it('accepts positive PostgreSQL identifiers at both bounds and rejects either side', () => {
    expect(PositiveIdSchema.safeParse(1).success).toBe(true)
    expect(PositiveIdSchema.safeParse(POSTGRES_ID_MAX).success).toBe(true)
    expect(PositiveIdSchema.safeParse(0).success).toBe(false)
    expect(PositiveIdSchema.safeParse(POSTGRES_ID_MAX + 1).success).toBe(false)
  })

  it('requires an actual IANA User Timezone and caps its raw size', () => {
    expect(UserTimeZoneSchema.safeParse('America/Argentina/ComodRivadavia').success).toBe(true)
    expect(UserTimeZoneSchema.safeParse('Mars/Olympus_Mons').success).toBe(false)
    expect(UserTimeZoneSchema.safeParse('x'.repeat(256)).success).toBe(false)
  })

  it('enforces Todo text and Tag collection bounds at the limit and one past it', () => {
    expect(CreateTodoInput.safeParse({ bucketId: 1, title: 'x'.repeat(TODO_TITLE_MAX_LENGTH) }).success).toBe(true)
    expect(CreateTodoInput.safeParse({ bucketId: 1, title: 'x'.repeat(TODO_TITLE_MAX_LENGTH + 1) }).success).toBe(false)
    expect(
      CreateTodoInput.safeParse({ bucketId: 1, description: 'x'.repeat(TODO_DESCRIPTION_MAX_LENGTH), title: 'a' })
        .success,
    ).toBe(true)
    expect(
      CreateTodoInput.safeParse({ bucketId: 1, description: 'x'.repeat(TODO_DESCRIPTION_MAX_LENGTH + 1), title: 'a' })
        .success,
    ).toBe(false)
    expect(CreateTodoInput.safeParse({ bucketId: 1, tagIds: ids(TODO_TAGS_MAX_COUNT), title: 'a' }).success).toBe(true)
    expect(CreateTodoInput.safeParse({ bucketId: 1, tagIds: ids(TODO_TAGS_MAX_COUNT + 1), title: 'a' }).success).toBe(
      false,
    )
    expect(CreateTodoInput.safeParse({ bucketId: 1, tagIds: [1, 1], title: 'a' }).success).toBe(false)
  })

  it('accepts existing Todos with more tags than new input permits', () => {
    const todo = {
      bucketId: 1,
      category: null,
      categoryId: null,
      completed: false,
      createdAt: new Date('2026-07-03T08:00:00.000Z'),
      description: '',
      id: 1,
      position: 1024,
      tags: ids(TODO_TAGS_MAX_COUNT + 1).map((id) => ({ colorKey: 'blue', id, name: `Tag ${id}` })),
      title: 'Existing Todo',
    }

    expect(TodoResponse.safeParse(todo).success).toBe(true)
    expect(MigrationStepResponse.shape.todos.element.safeParse(todo).success).toBe(true)
  })

  it('enforces Category and Tag name bounds at the limit and one past it', () => {
    expect(
      CreateCategoryInput.safeParse({ colorKey: 'blue', name: 'x'.repeat(CATEGORY_NAME_MAX_LENGTH) }).success,
    ).toBe(true)
    expect(
      CreateCategoryInput.safeParse({ colorKey: 'blue', name: 'x'.repeat(CATEGORY_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'x'.repeat(TAG_NAME_MAX_LENGTH) }).success).toBe(true)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'x'.repeat(TAG_NAME_MAX_LENGTH + 1) }).success).toBe(
      false,
    )
  })

  it('enforces the Migration Step work limit at the bound and one past it', () => {
    expect(
      ConfirmMigrationStepInput.safeParse({ decisions: decisions(MIGRATION_DECISIONS_MAX_COUNT), sourceBucketId: 1 })
        .success,
    ).toBe(true)
    expect(
      ConfirmMigrationStepInput.safeParse({
        decisions: decisions(MIGRATION_DECISIONS_MAX_COUNT + 1),
        sourceBucketId: 1,
      }).success,
    ).toBe(false)
  })
})

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1)
}

function decisions(count: number) {
  return Object.fromEntries(ids(count).map((id) => [id, 'carry_forward']))
}
