import { z } from 'zod'

import { CategoryDisplaySchema } from '@/lib/types/Category'
import { TagDisplaySchema } from '@/lib/types/Tag'
import {
  EmptyInputSchema,
  MIGRATION_DECISIONS_MAX_COUNT,
  PositiveIdSchema,
  UserTimeZoneSchema,
  strictInput,
} from '@/server/core/validation'

export const PlanningDateSchema = z.iso.date()

export const GetBoardInput = EmptyInputSchema
export const ReconcileLifecycleInput = strictInput({ timeZone: UserTimeZoneSchema.optional() }).default({})
export const CompleteDayInput = strictInput({ planningDate: PlanningDateSchema })
export const GetBucketsInput = EmptyInputSchema
export const GetMigrationStepInput = strictInput({ sourceBucketId: PositiveIdSchema.optional() })
export const ConfirmMigrationStepInput = strictInput({
  decisions: z
    .record(z.coerce.number().pipe(PositiveIdSchema), z.enum(['carry_forward', 'move_back']))
    .refine((decisions) => Object.keys(decisions).length <= MIGRATION_DECISIONS_MAX_COUNT, {
      message: `No more than ${MIGRATION_DECISIONS_MAX_COUNT} migration decisions are allowed`,
    }),
  sourceBucketId: PositiveIdSchema,
})

export const BucketResponse = z.object({
  id: PositiveIdSchema,
  period: z.string().min(1),
  type: z.enum(['inbox', 'yearly', 'monthly', 'weekly', 'daily']),
})

export const BucketsResponse = z.array(BucketResponse)

const MigrationRecapResponse = z.object({
  bucketBreakdown: z.array(
    z.object({
      bucket: BucketResponse,
      completedCount: z.int().nonnegative(),
      incompleteCount: z.int().nonnegative(),
    }),
  ),
  completedCount: z.int().nonnegative(),
  incompleteCount: z.int().nonnegative(),
})

const ReadyBoardResponse = z.object({
  buckets: BucketsResponse,
  planningDate: PlanningDateSchema,
  status: z.literal('ready'),
  timeZone: UserTimeZoneSchema,
})

const MigrationRequiredBoardResponse = z.object({
  buckets: BucketsResponse,
  pendingMigrationBuckets: BucketsResponse,
  planningDate: PlanningDateSchema,
  status: z.literal('migration_required'),
  timeZone: UserTimeZoneSchema,
})

const ReconciliationRequiredBoardResponse = z.object({ status: z.literal('reconciliation_required') })

export const BoardResponse = z.discriminatedUnion('status', [
  ReadyBoardResponse,
  MigrationRequiredBoardResponse,
  ReconciliationRequiredBoardResponse,
])

export const ReconcileLifecycleResponse = z.discriminatedUnion('status', [
  ReadyBoardResponse,
  MigrationRequiredBoardResponse,
])

const CompletedBoardResponse = z.object({
  buckets: BucketsResponse,
  planningDate: PlanningDateSchema,
  recap: z.object({
    completedCount: z.int().nonnegative(),
    incompleteCount: z.literal(0),
    kind: z.literal('all_complete'),
  }),
  status: z.literal('completed'),
  timeZone: UserTimeZoneSchema,
})

export const CompleteDayResponse = z.discriminatedUnion('status', [
  CompletedBoardResponse,
  MigrationRequiredBoardResponse.extend({ migrationRecap: MigrationRecapResponse }),
])

const MigrationTodoResponse = z.object({
  bucketId: PositiveIdSchema,
  category: CategoryDisplaySchema.nullable(),
  categoryId: PositiveIdSchema.nullable(),
  completed: z.boolean(),
  createdAt: z.date(),
  description: z.string(),
  id: PositiveIdSchema,
  position: z.int(),
  tags: z.array(TagDisplaySchema),
  title: z.string(),
})

export const MigrationStepResponse = z.object({
  carryForwardDestination: BucketResponse,
  completedCount: z.int().nonnegative(),
  flowRecap: MigrationRecapResponse,
  incompleteCount: z.int().nonnegative(),
  moveBackDestination: BucketResponse,
  pendingMigrationBuckets: BucketsResponse,
  sourceBucket: BucketResponse,
  todos: z.array(MigrationTodoResponse),
})

export const ConfirmMigrationStepResponse = z.object({
  board: BoardResponse,
  migratedTodoPositions: z.array(
    z.object({
      bucketId: PositiveIdSchema,
      id: PositiveIdSchema,
      position: z.int(),
    }),
  ),
  status: z.literal('confirmed'),
})
