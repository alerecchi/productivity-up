import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { useBoardCache } from '@/features/board/cache'
import { BucketColumn } from '@/features/board/components/bucket-column'
import { BucketLifecycleRecapDialog } from '@/features/board/components/bucket-lifecycle-recap-dialog'
import { LifecycleReconciliationStatus } from '@/features/board/components/lifecycle-reconciliation-status'
import {
  MigrationRecapDialog,
  PendingMigrationRecapDialog,
} from '@/features/board/components/pending-migration-recap-dialog'
import { TodoDragDropProvider } from '@/features/board/components/todo-drag-drop-provider'
import { useReconciledBoard } from '@/features/board/hooks/use-reconciled-board'
import type { ReconciledBoard } from '@/features/board/hooks/use-reconciled-board'
import { Button } from '@/features/shared/components/ui/button'
import { getTodayLocalDate, isFutureBucket } from '@/lib/periods'
import type { Bucket } from '@/lib/types/Bucket'
import { completeDay } from '@/server/functions/board'

const BUCKET_TYPE_ORDER = ['inbox', 'yearly', 'monthly', 'weekly', 'daily']
// Helper for O(1) lookups during sort
const bucketPriority: Record<string, number> = BUCKET_TYPE_ORDER.reduce(
  (acc, type, index) => ({ ...acc, [type]: index }),
  {},
)

export function Board() {
  const { board, reconciliation } = useReconciledBoard()

  if (!board) {
    return <LifecycleReconciliationStatus {...reconciliation} />
  }

  return <ReconciledBoardView board={board} />
}

function ReconciledBoardView({ board }: { board: ReconciledBoard }) {
  const navigate = useNavigate()
  const cache = useBoardCache()
  const completeDayMutation = useMutation({
    mutationFn: () => completeDay({ data: { planningDate: board.planningDate } }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not complete day')
      void cache.recover(error, { type: 'board' })
    },
    onSuccess: async (result) => {
      if (result.status === 'migration_required') {
        const { migrationRecap, ...nextBoard } = result
        await cache.apply({
          board: { ...nextBoard, completionRecap: migrationRecap },
          type: 'lifecycle-committed',
        })
        return
      }

      await cache.apply({
        board: {
          buckets: result.buckets,
          completionRecap: {
            ...result.recap,
            completedPlanningDate: board.planningDate,
            nextPlanningDate: result.planningDate,
          },
          planningDate: result.planningDate,
          status: 'ready',
          timeZone: result.timeZone,
        },
        type: 'lifecycle-committed',
      })
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
            aria-label='Productivity Up board'
            className={`flex min-h-0 flex-1 flex-row gap-6 overflow-x-auto overflow-y-hidden px-6 py-6 transition ${isMigrationRequired ? 'pointer-events-none blur-sm select-none' : ''}`}
            data-todo-board
            role='region'
          >
            {sortedBuckets.map((bucket: Bucket) => (
              <BucketColumn
                key={bucket.id}
                bucket={bucket}
                buckets={sortedBuckets}
                isPlanningBucket={isFutureBucket({ bucket, planningDate: board.planningDate, today })}
              />
            ))}
          </div>
        </TodoDragDropProvider>
      </div>
      {board.status === 'migration_required' && !board.completionRecap ? (
        <PendingMigrationRecapDialog sourceBucketId={board.pendingMigrationBuckets[0].id} />
      ) : null}
      {board.status === 'migration_required' && board.completionRecap ? (
        <MigrationRecapDialog
          onContinue={() => navigate({ to: '/migration' })}
          pendingMigrationBuckets={board.pendingMigrationBuckets}
          recap={board.completionRecap}
        />
      ) : null}
      {board.status === 'ready' && board.completionRecap ? (
        <BucketLifecycleRecapDialog
          actionLabel='Close and plan tomorrow'
          completedCount={board.completionRecap.completedCount}
          headline={`${board.completionRecap.completedPlanningDate} is wrapped`}
          incompleteCount={board.completionRecap.incompleteCount}
          migrationStepDetail='All todos are completed, so this step is skipped.'
          migrationStepTitle='No migration needed'
          onAction={() => cache.dismissCompletionRecap()}
          open
          showCloseButton
        />
      ) : null}
    </>
  )
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
