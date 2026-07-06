import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { BucketColumn } from '@/features/board/components/bucket-column'
import { BucketLifecycleRecapDialog } from '@/features/board/components/bucket-lifecycle-recap-dialog'
import {
  MigrationRecapDialog,
  PendingMigrationRecapDialog,
} from '@/features/board/components/pending-migration-recap-dialog'
import type { MigrationRecap } from '@/features/board/components/pending-migration-recap-dialog'
import { TodoDragDropProvider } from '@/features/board/components/todo-drag-drop-provider'
import { BOARD_QUERY_KEY } from '@/features/board/queries/query-keys'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'
import { Button } from '@/features/shared/components/ui/button'
import { getTodayLocalDate } from '@/lib/periods'
import type { Bucket } from '@/lib/types/Bucket'
import { completeDay } from '@/server/functions/board'

const BUCKET_TYPE_ORDER = ['inbox', 'yearly', 'monthly', 'weekly', 'daily']
// Helper for O(1) lookups during sort
const bucketPriority: Record<string, number> = BUCKET_TYPE_ORDER.reduce(
  (acc, type, index) => ({ ...acc, [type]: index }),
  {},
)

export function Board() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: board } = useSuspenseQuery(getBoardQueryOptions)
  const [completionRecap, setCompletionRecap] = useState<CompletionRecap | null>(null)
  const [migrationRecap, setMigrationRecap] = useState<ManualMigrationRecap | null>(null)
  const completeDayMutation = useMutation({
    mutationFn: () => completeDay(),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not complete day')
    },
    onSuccess: (result) => {
      if (result.status === 'migration_required') {
        queryClient.setQueryData([BOARD_QUERY_KEY], result)
        if (result.migrationRecap) {
          setMigrationRecap({
            pendingMigrationBuckets: result.pendingMigrationBuckets,
            recap: result.migrationRecap,
          })
        }
        return
      }

      queryClient.setQueryData([BOARD_QUERY_KEY], {
        buckets: result.buckets,
        planningDate: result.planningDate,
        status: 'ready',
        timeZone: result.timeZone,
      })

      setCompletionRecap({
        ...result.recap,
        completedPlanningDate: board.planningDate,
        nextPlanningDate: result.planningDate,
      })
      setMigrationRecap(null)
    },
  })

  const bucketList = board.buckets
  // TODO: decide where the sorting should be (server, client before cache?, here)
  const sortedBuckets = bucketList.toSorted((a: Bucket, b: Bucket) => bucketPriority[a.type] - bucketPriority[b.type])
  const isMigrationRequired = board.status === 'migration_required'
  const today = getTodayLocalDate(new Date(), board.timeZone)
  const isPlanningAhead = board.planningDate > today
  const isPlanningBehind = board.planningDate < today
  const planningStatus = isPlanningAhead
    ? board.planningDate === addDaysToDateKey(today, 1)
      ? 'Planning tomorrow'
      : 'Planning ahead'
    : isPlanningBehind
      ? 'Planning earlier'
      : 'Planning today'

  return (
    <>
      <div className='flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col'>
        <header className='flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3'>
          <div className='flex min-w-0 flex-col gap-1'>
            <p className='text-sm font-medium'>{planningStatus}</p>
            {isPlanningAhead && (
              <p className='text-sm text-muted-foreground'>Complete day is disabled while planning ahead.</p>
            )}
          </div>
          <Button
            aria-describedby={isPlanningAhead ? 'complete-day-disabled-reason' : undefined}
            disabled={isMigrationRequired || isPlanningAhead || completeDayMutation.isPending}
            onClick={() => completeDayMutation.mutate()}
          >
            <CheckCircle2 />
            Complete day
          </Button>
          {isPlanningAhead && (
            <span className='sr-only' id='complete-day-disabled-reason'>
              Complete day is disabled while planning ahead.
            </span>
          )}
        </header>
        <TodoDragDropProvider>
          <div
            aria-label='Todo Buckets board'
            className={`flex min-h-0 flex-1 flex-row gap-6 overflow-x-auto overflow-y-hidden px-6 py-6 transition ${isMigrationRequired ? 'pointer-events-none blur-sm select-none' : ''}`}
            data-todo-board
            role='region'
          >
            {sortedBuckets.map((bucket: Bucket) => (
              <BucketColumn key={bucket.id} bucket={bucket} buckets={sortedBuckets} />
            ))}
          </div>
        </TodoDragDropProvider>
      </div>
      {isMigrationRequired && migrationRecap === null ? <PendingMigrationRecapDialog /> : null}
      {migrationRecap ? (
        <MigrationRecapDialog
          onContinue={() => navigate({ to: '/migration' })}
          pendingMigrationBuckets={migrationRecap.pendingMigrationBuckets}
          recap={migrationRecap.recap}
        />
      ) : null}
      {completionRecap ? (
        <BucketLifecycleRecapDialog
          actionLabel='Close and plan tomorrow'
          completedCount={completionRecap.completedCount}
          headline={`${completionRecap.completedPlanningDate} is wrapped`}
          incompleteCount={completionRecap.incompleteCount}
          migrationStepDetail='All todos are completed, so this step is skipped.'
          migrationStepTitle='No migration needed'
          onAction={() => setCompletionRecap(null)}
          open
          showCloseButton
        />
      ) : null}
    </>
  )
}

type CompletionRecap = {
  completedPlanningDate: string
  completedCount: number
  incompleteCount: 0
  kind: 'all_complete'
  nextPlanningDate: string
}

type ManualMigrationRecap = {
  pendingMigrationBuckets: Array<Pick<Bucket, 'id'>>
  recap: MigrationRecap
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}
