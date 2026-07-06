import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronRight,
  CornerUpLeft,
  FastForward,
  Layers3,
  Route as RouteIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  clearStoredMigrationFlowStarted,
  getStoredMigrationFlowBucketIds,
} from '@/features/board/lib/migration-flow-started'
import { BOARD_QUERY_KEY, MIGRATION_STEP_QUERY_KEY } from '@/features/board/queries/query-keys'
import { Badge } from '@/features/shared/components/ui/badge'
import { Button } from '@/features/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/shared/components/ui/dialog'
import { cn } from '@/features/shared/utils/tailwind'
import type { Bucket } from '@/lib/types/Bucket'
import { confirmMigrationStep, getMigrationStep } from '@/server/functions/board'

type MigrationDecision = 'carry_forward' | 'move_back'
type BulkMigrationAction = {
  confirmLabel: string
  decision: MigrationDecision
  title: string
} | null

export function MigrationFlow({ onFlowComplete }: { onFlowComplete?: () => Promise<void> | void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [bulkAction, setBulkAction] = useState<BulkMigrationAction>(null)
  const [decisions, setDecisions] = useState<Partial<Record<number, MigrationDecision>>>({})
  const [isLeavingFlow, setIsLeavingFlow] = useState(false)
  const { data: step } = useSuspenseQuery(
    queryOptions({
      queryKey: [MIGRATION_STEP_QUERY_KEY],
      queryFn: () => getMigrationStep({ data: {} }),
    }),
  )
  const confirmMutation = useMutation({
    mutationFn: (bulkDecision?: MigrationDecision) =>
      confirmMigrationStep({
        data: {
          decisions: bulkDecision
            ? getBulkDecisions(step.todos, bulkDecision)
            : getConfirmedDecisions(step.todos, decisions),
          sourceBucketId: step.sourceBucket.id,
        },
      }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not confirm migration')
    },
    onSuccess: async (result) => {
      if (result.board.status === 'ready') {
        clearStoredMigrationFlowStarted()
        queryClient.setQueryData([BOARD_QUERY_KEY], result.board)
        try {
          setIsLeavingFlow(true)
          await (onFlowComplete ? onFlowComplete() : navigate({ to: '/board' }))
        } catch (error) {
          setIsLeavingFlow(false)
          toast.error(error instanceof Error ? error.message : 'Could not return to the board')
        }
        return
      }

      queryClient.setQueryData([BOARD_QUERY_KEY], result.board)
      queryClient.invalidateQueries({ queryKey: [MIGRATION_STEP_QUERY_KEY] })
      setBulkAction(null)
    },
  })
  const hasAllDecisions = step.todos.every((todo) => decisions[todo.id] !== undefined)
  const migrationFlowBucketIds = getMigrationFlowBucketIds(step.pendingMigrationBuckets, step.sourceBucket)
  const currentStepIndex = getMigrationStepIndex(migrationFlowBucketIds, step.sourceBucket)
  const upcomingBucketNames = getUpcomingBucketNames({
    migrationFlowBucketIds,
    pendingMigrationBuckets: step.pendingMigrationBuckets,
    sourceBucket: step.sourceBucket,
  })

  useEffect(() => {
    setDecisions({})
    setBulkAction(null)
  }, [step.sourceBucket.id])

  if (isLeavingFlow) {
    return null
  }

  return (
    <main className='min-h-[calc(100dvh-3.5rem)] bg-muted/35 px-4 py-6 sm:px-6 lg:px-8'>
      <section className='mx-auto flex max-w-6xl flex-col pb-44'>
        <header>
          <div className='flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground uppercase'>
            <RouteIcon className='size-3.5 text-primary' aria-hidden='true' />
            {formatMigrationEyebrow(step.sourceBucket)}
            <span className='text-muted-foreground/60'>
              Step {currentStepIndex + 1} of {migrationFlowBucketIds.length}
            </span>
          </div>
          <h1 className='mt-3 text-3xl font-semibold'>
            Decide what moves on from {formatBucketName(step.sourceBucket)}.
          </h1>
          <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground'>
            This bucket has reached its end. Keep the work at the same horizon, or return it to a broader bucket for
            another pass.
          </p>
          <p className='mt-2 text-sm text-muted-foreground'>
            {upcomingBucketNames ? `Up next: ${upcomingBucketNames}` : 'This is the last Pending Migration Bucket.'}
          </p>
        </header>

        <div className='mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]'>
          <div className='flex min-h-0 min-w-0 flex-col'>
            <div className='mb-3 flex items-end justify-between gap-4'>
              <div>
                <h2 className='text-lg font-semibold'>Place unfinished work</h2>
                <p className='mt-1 text-sm text-muted-foreground'>Each row has one deliberate destination.</p>
              </div>
            </div>
            <div className='max-h-[calc(100vh-27rem)] min-h-0 overflow-y-auto rounded-lg border border-border bg-background lg:max-h-[calc(100vh-22rem)]'>
              {step.todos.map((todo, index) => (
                <article
                  className={cn(
                    'grid gap-4 p-4 lg:grid-cols-[minmax(12rem,1fr)_auto]',
                    index < step.todos.length - 1 && 'border-b border-border',
                  )}
                  key={todo.id}
                >
                  <div className='min-w-0 border-l-4 border-blue-500 pl-3'>
                    <div className='mb-2 flex flex-wrap items-center gap-2'>
                      {todo.category && (
                        <Badge className='rounded-sm border-0 bg-blue-100 px-1.5 py-0 text-[11px] text-blue-800 uppercase'>
                          {todo.category.name}
                        </Badge>
                      )}
                      {todo.tags.map((tag) => (
                        <Badge
                          className='rounded-sm border-blue-200 bg-blue-50 px-1.5 py-0 text-[11px] text-blue-800 uppercase'
                          key={tag.id}
                          variant='outline'
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                    <h2 className='text-sm font-semibold text-foreground'>{todo.title}</h2>
                  </div>
                  <div className='flex shrink-0 flex-col gap-2 sm:flex-row'>
                    <Button
                      aria-pressed={decisions[todo.id] === 'move_back'}
                      className={cn(
                        'border-violet-200 text-violet-800 hover:bg-violet-50 hover:text-violet-900',
                        decisions[todo.id] === 'move_back' &&
                          'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 hover:text-white',
                      )}
                      onClick={() => setDecisions((current) => ({ ...current, [todo.id]: 'move_back' }))}
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      <CornerUpLeft aria-hidden='true' />
                      Move back
                    </Button>
                    <Button
                      aria-pressed={decisions[todo.id] === 'carry_forward'}
                      className={cn(
                        'border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900',
                        decisions[todo.id] === 'carry_forward' &&
                          'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white',
                      )}
                      onClick={() => setDecisions((current) => ({ ...current, [todo.id]: 'carry_forward' }))}
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      <FastForward aria-hidden='true' />
                      Carry forward
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className='self-start rounded-lg border border-border bg-background p-5 lg:sticky lg:top-20'>
            <span className='flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary'>
              <Layers3 className='size-5' aria-hidden='true' />
            </span>
            <h2 className='mt-4 text-base font-semibold'>
              {formatTodoCount(step.todos.length)} {step.todos.length === 1 ? 'needs' : 'need'} a new home
            </h2>
            <DestinationKey
              icon={<CornerUpLeft aria-hidden='true' />}
              label='Move back'
              value={formatBucketName(step.moveBackDestination)}
              tone='back'
            />
            <DestinationKey
              icon={<ArrowRight aria-hidden='true' />}
              label='Carry forward'
              value={formatBucketName(step.carryForwardDestination)}
              tone='forward'
            />
            <div className='mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground'>
              The current bucket closes after every todo has a destination.
            </div>
          </aside>
        </div>
      </section>

      <footer className='fixed right-0 bottom-0 left-0 z-30 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgb(15_23_42/0.08)] backdrop-blur sm:px-6'>
        <div className='mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex min-w-0 items-center gap-3'>
            <DecisionProgress decidedCount={Object.keys(decisions).length} total={step.todos.length} />
          </div>
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <Button
              className='border-violet-200 text-violet-800 hover:bg-violet-50 hover:text-violet-900'
              disabled={confirmMutation.isPending}
              onClick={() =>
                setBulkAction({
                  confirmLabel: 'Confirm move all back',
                  decision: 'move_back',
                  title: 'Move all back?',
                })
              }
              size='sm'
              type='button'
              variant='outline'
            >
              <ArrowDownToLine aria-hidden='true' />
              Move all back
            </Button>
            <Button
              className='border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900'
              disabled={confirmMutation.isPending}
              onClick={() =>
                setBulkAction({
                  confirmLabel: 'Confirm carry all forward',
                  decision: 'carry_forward',
                  title: 'Carry all forward?',
                })
              }
              size='sm'
              type='button'
              variant='outline'
            >
              <FastForward aria-hidden='true' />
              Carry all forward
            </Button>
            <Button
              disabled={!hasAllDecisions || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate(undefined)}
              size='sm'
            >
              Confirm choices
              <ChevronRight aria-hidden='true' />
            </Button>
          </div>
        </div>
      </footer>
      <Dialog open={bulkAction !== null} onOpenChange={(open) => !open && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bulkAction?.title}</DialogTitle>
            <DialogDescription>
              This will commit the current Migration Step immediately for every incomplete Todo in{' '}
              {formatBucketName(step.sourceBucket)}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={confirmMutation.isPending}
              onClick={() => setBulkAction(null)}
              type='button'
              variant='outline'
            >
              Cancel
            </Button>
            <Button
              disabled={confirmMutation.isPending}
              onClick={() => {
                if (bulkAction) {
                  confirmMutation.mutate(bulkAction.decision)
                }
              }}
              type='button'
            >
              {bulkAction?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function formatBucketName(bucket: Pick<Bucket, 'period' | 'type'>) {
  if (bucket.type === 'inbox') {
    return 'Inbox'
  }

  return `${bucket.type[0].toUpperCase()}${bucket.type.slice(1)} ${bucket.period}`
}

function formatMigrationEyebrow(bucket: Pick<Bucket, 'type'>) {
  if (bucket.type === 'inbox') {
    return 'Inbox migration'
  }

  return `${bucket.type[0].toUpperCase()}${bucket.type.slice(1)} migration`
}

function formatTodoCount(count: number) {
  return `${count} ${count === 1 ? 'todo' : 'todos'}`
}

function DestinationKey({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode
  label: string
  tone: 'back' | 'forward'
  value: string
}) {
  return (
    <div className={cn('mt-5 border-l-4 pl-3', tone === 'back' ? 'border-violet-500' : 'border-emerald-500')}>
      <p className='flex items-center gap-2 text-xs font-semibold uppercase'>
        <span className={tone === 'back' ? 'text-violet-700' : 'text-emerald-700'}>{icon}</span>
        {label}
      </p>
      <p className='mt-1 text-sm font-medium'>{value}</p>
    </div>
  )
}

function DecisionProgress({ decidedCount, total }: { decidedCount: number; total: number }) {
  const percentage = total === 0 ? 100 : Math.round((decidedCount / total) * 100)

  return (
    <div className='min-w-36'>
      <div className='mb-1 flex items-baseline justify-between gap-3 text-xs'>
        <span className='font-medium tabular-nums'>
          {decidedCount}/{total}
        </span>
      </div>
      <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
        <div className='h-full rounded-full bg-primary transition-[width]' style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

function getConfirmedDecisions(
  todos: Array<{ id: number }>,
  draftDecisions: Partial<Record<number, MigrationDecision>>,
) {
  const confirmedDecisions: Record<number, MigrationDecision> = {}

  for (const todo of todos) {
    const decision = draftDecisions[todo.id]

    if (!decision) {
      throw new Error('Choose a destination for every Todo')
    }

    confirmedDecisions[todo.id] = decision
  }

  return confirmedDecisions
}

function getBulkDecisions(todos: Array<{ id: number }>, decision: MigrationDecision) {
  const confirmedDecisions: Record<number, MigrationDecision> = {}

  for (const todo of todos) {
    confirmedDecisions[todo.id] = decision
  }

  return confirmedDecisions
}

function getMigrationFlowBucketIds(
  pendingMigrationBuckets: Array<Pick<Bucket, 'id'>>,
  sourceBucket: Pick<Bucket, 'id'>,
) {
  const storedBucketIds = getStoredMigrationFlowBucketIds()

  if (storedBucketIds.includes(sourceBucket.id)) {
    return storedBucketIds
  }

  return pendingMigrationBuckets.map((bucket) => bucket.id)
}

function getMigrationStepIndex(migrationFlowBucketIds: Array<number>, sourceBucket: Pick<Bucket, 'id'>) {
  return Math.max(
    migrationFlowBucketIds.findIndex((bucketId) => bucketId === sourceBucket.id),
    0,
  )
}

function getUpcomingBucketNames({
  migrationFlowBucketIds,
  pendingMigrationBuckets,
  sourceBucket,
}: {
  migrationFlowBucketIds: Array<number>
  pendingMigrationBuckets: Array<Pick<Bucket, 'id' | 'period' | 'type'>>
  sourceBucket: Pick<Bucket, 'id'>
}) {
  const currentStepIndex = getMigrationStepIndex(migrationFlowBucketIds, sourceBucket)
  const pendingBucketsById = new Map(pendingMigrationBuckets.map((bucket) => [bucket.id, bucket]))

  return migrationFlowBucketIds
    .slice(currentStepIndex + 1)
    .map((bucketId) => pendingBucketsById.get(bucketId))
    .filter((bucket) => bucket !== undefined)
    .map(formatBucketName)
    .join(', ')
}
