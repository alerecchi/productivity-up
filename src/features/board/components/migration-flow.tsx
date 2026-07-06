import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { BOARD_QUERY_KEY, MIGRATION_STEP_QUERY_KEY } from '@/features/board/queries/query-keys'
import { Badge } from '@/features/shared/components/ui/badge'
import { Button } from '@/features/shared/components/ui/button'
import type { Bucket } from '@/lib/types/Bucket'
import { confirmMigrationStep, getMigrationStep } from '@/server/functions/board'

type MigrationDecision = 'carry_forward' | 'move_back'
const MIGRATION_FLOW_STARTED_STORAGE_KEY = 'todo-buckets:migration-flow-started'

export function MigrationFlow() {
  const queryClient = useQueryClient()
  const [hasStartedFlow, setHasStartedFlow] = useState(false)
  const [hasStoredFlowStarted, setHasStoredFlowStarted] = useState<boolean | null>(null)
  const [decisions, setDecisions] = useState<Partial<Record<number, MigrationDecision>>>({})
  const { data: step } = useSuspenseQuery(
    queryOptions({
      queryKey: [MIGRATION_STEP_QUERY_KEY],
      queryFn: () => getMigrationStep({ data: {} }),
    }),
  )
  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmMigrationStep({
        data: {
          decisions: getConfirmedDecisions(step.todos, decisions),
          sourceBucketId: step.sourceBucket.id,
        },
      }),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not confirm migration')
    },
    onSuccess: (result) => {
      if (result.board.status === 'ready') {
        clearStoredFlowStarted()
        setHasStartedFlow(false)
        setHasStoredFlowStarted(false)
      }

      queryClient.setQueryData([BOARD_QUERY_KEY], result.board)
      queryClient.invalidateQueries({ queryKey: [MIGRATION_STEP_QUERY_KEY] })
    },
  })
  const hasAllDecisions = step.todos.every((todo) => decisions[todo.id] !== undefined)
  const currentStepIndex = getMigrationStepIndex(step.pendingMigrationBuckets, step.sourceBucket)
  const upcomingBucketNames = step.pendingMigrationBuckets
    .slice(currentStepIndex + 1)
    .map(formatBucketName)
    .join(', ')

  useEffect(() => {
    setDecisions({})
  }, [step.sourceBucket.id])

  useEffect(() => {
    setHasStoredFlowStarted(isStoredFlowStarted(step.pendingMigrationBuckets))
  }, [step.pendingMigrationBuckets])

  if (hasStoredFlowStarted === null) {
    return (
      <main className='flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-background'>
        <p className='text-sm text-muted-foreground'>Loading migration</p>
      </main>
    )
  }

  if (!hasStartedFlow && !hasStoredFlowStarted) {
    return (
      <main className='flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background'>
        <header className='border-b px-6 py-5'>
          <div className='mx-auto flex max-w-6xl flex-col gap-1'>
            <p className='text-sm font-medium text-muted-foreground'>Migration required</p>
            <h1 className='text-2xl font-semibold'>Completion Recap</h1>
            <p className='text-sm text-muted-foreground'>
              Review what ended before choosing where incomplete Todos go next.
            </p>
          </div>
        </header>
        <section className='mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6'>
          <dl className='grid gap-3 sm:grid-cols-2'>
            <div className='rounded-md bg-secondary p-3'>
              <dt className='text-sm text-muted-foreground'>Completed</dt>
              <dd className='text-lg font-semibold'>{step.flowRecap.completedCount} completed</dd>
            </div>
            <div className='rounded-md bg-secondary p-3'>
              <dt className='text-sm text-muted-foreground'>Incomplete</dt>
              <dd className='text-lg font-semibold'>{step.flowRecap.incompleteCount} incomplete</dd>
            </div>
          </dl>
          <div className='divide-y rounded-md border'>
            {step.flowRecap.bucketBreakdown.map((row) => (
              <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-4' key={row.bucket.id}>
                <h2 className='truncate text-sm font-medium'>{formatBucketName(row.bucket)}</h2>
                <p className='text-sm text-muted-foreground'>
                  {row.completedCount} completed, {row.incompleteCount} incomplete
                </p>
              </div>
            ))}
          </div>
          <div className='flex justify-end'>
            <Button
              onClick={() => {
                storeFlowStarted(step.pendingMigrationBuckets)
                setHasStoredFlowStarted(true)
                setHasStartedFlow(true)
              }}
            >
              Start migration
            </Button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className='flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background'>
      <header className='border-b px-6 py-5'>
        <div className='mx-auto flex max-w-6xl flex-col gap-1'>
          <p className='text-sm font-medium text-muted-foreground'>
            Step {currentStepIndex + 1} of {step.pendingMigrationBuckets.length}
          </p>
          <h1 className='text-2xl font-semibold'>Migration required</h1>
          <p className='text-sm text-muted-foreground'>
            {upcomingBucketNames ? `Up next: ${upcomingBucketNames}` : 'This is the last Pending Migration Bucket.'}
          </p>
        </div>
      </header>
      <div className='mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]'>
        <section className='min-w-0'>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <div>
              <h2 className='text-lg font-semibold'>{formatBucketName(step.sourceBucket)}</h2>
              <p className='text-sm text-muted-foreground'>
                Step {currentStepIndex + 1} of {step.pendingMigrationBuckets.length}. Choose a destination for each
                incomplete Todo.
              </p>
            </div>
            <Button disabled={!hasAllDecisions || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
              <CheckCircle2 />
              Confirm choices
            </Button>
          </div>
          <div className='divide-y rounded-md border'>
            {step.todos.map((todo) => (
              <article className='grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-4' key={todo.id}>
                <div className='min-w-0 space-y-2'>
                  <h3 className='truncate font-medium'>{todo.title}</h3>
                  <div className='flex flex-wrap items-center gap-2'>
                    {todo.category && <Badge variant='secondary'>{todo.category.name}</Badge>}
                    {todo.tags.map((tag) => (
                      <Badge key={tag.id} variant='outline'>
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className='flex flex-wrap items-center justify-end gap-2'>
                  <Button
                    aria-pressed={decisions[todo.id] === 'move_back'}
                    onClick={() => setDecisions((current) => ({ ...current, [todo.id]: 'move_back' }))}
                    type='button'
                    variant={decisions[todo.id] === 'move_back' ? 'default' : 'outline'}
                  >
                    <ArrowLeft />
                    Move back
                  </Button>
                  <Button
                    aria-pressed={decisions[todo.id] === 'carry_forward'}
                    onClick={() => setDecisions((current) => ({ ...current, [todo.id]: 'carry_forward' }))}
                    type='button'
                    variant={decisions[todo.id] === 'carry_forward' ? 'default' : 'outline'}
                  >
                    Carry forward
                    <ArrowRight />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <aside className='space-y-4 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6'>
          <div>
            <h2 className='text-sm font-semibold'>Destinations</h2>
            <dl className='mt-3 space-y-3 text-sm'>
              <div>
                <dt className='text-muted-foreground'>Move back</dt>
                <dd className='font-medium'>{formatBucketName(step.moveBackDestination)}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground'>Carry forward</dt>
                <dd className='font-medium'>{formatBucketName(step.carryForwardDestination)}</dd>
              </div>
            </dl>
          </div>
          <p className='text-sm text-muted-foreground'>
            Completed Todos stay in the source Bucket. After confirmation, you can adjust migrated Todos on the board.
          </p>
        </aside>
      </div>
    </main>
  )
}

function formatBucketName(bucket: Pick<Bucket, 'period' | 'type'>) {
  if (bucket.type === 'inbox') {
    return 'Inbox'
  }

  return `${bucket.type[0].toUpperCase()}${bucket.type.slice(1)} ${bucket.period}`
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

function getMigrationStepIndex(pendingMigrationBuckets: Array<Pick<Bucket, 'id'>>, sourceBucket: Pick<Bucket, 'id'>) {
  return Math.max(
    pendingMigrationBuckets.findIndex((bucket) => bucket.id === sourceBucket.id),
    0,
  )
}

function isStoredFlowStarted(pendingMigrationBuckets: Array<Pick<Bucket, 'id'>>) {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const storedBucketIds = window.sessionStorage.getItem(MIGRATION_FLOW_STARTED_STORAGE_KEY)?.split(',') ?? []

    return pendingMigrationBuckets.every((bucket) => storedBucketIds.includes(String(bucket.id)))
  } catch {
    return false
  }
}

function storeFlowStarted(pendingMigrationBuckets: Array<Pick<Bucket, 'id'>>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(
      MIGRATION_FLOW_STARTED_STORAGE_KEY,
      pendingMigrationBuckets.map((bucket) => bucket.id).join(','),
    )
  } catch {
    // The in-memory state still lets the current flow continue when storage is blocked.
  }
}

function clearStoredFlowStarted() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(MIGRATION_FLOW_STARTED_STORAGE_KEY)
  } catch {
    // Best-effort cleanup only.
  }
}
