import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { BOARD_QUERY_KEY, MIGRATION_STEP_QUERY_KEY } from '@/features/board/queries/query-keys'
import { Badge } from '@/features/shared/components/ui/badge'
import { Button } from '@/features/shared/components/ui/button'
import type { Bucket } from '@/lib/types/Bucket'
import { confirmMigrationStep, getMigrationStep } from '@/server/functions/board'

type MigrationDecision = 'carry_forward' | 'move_back'

export function MigrationFlow() {
  const queryClient = useQueryClient()
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
      queryClient.setQueryData([BOARD_QUERY_KEY], result.board)
      queryClient.invalidateQueries({ queryKey: [MIGRATION_STEP_QUERY_KEY] })
    },
  })
  const hasAllDecisions = step.todos.every((todo) => decisions[todo.id] !== undefined)

  return (
    <main className='flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background'>
      <header className='border-b px-6 py-5'>
        <div className='mx-auto flex max-w-6xl flex-col gap-1'>
          <p className='text-sm font-medium text-muted-foreground'>Completion Recap</p>
          <h1 className='text-2xl font-semibold'>Migration required</h1>
          <p className='text-sm text-muted-foreground'>
            {step.incompleteCount} incomplete and {step.completedCount} completed in{' '}
            {formatBucketName(step.sourceBucket)}.
          </p>
        </div>
      </header>
      <div className='mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]'>
        <section className='min-w-0'>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <div>
              <h2 className='text-lg font-semibold'>{formatBucketName(step.sourceBucket)}</h2>
              <p className='text-sm text-muted-foreground'>
                Step {getMigrationStepIndex(step.pendingMigrationBuckets, step.sourceBucket) + 1} of{' '}
                {step.pendingMigrationBuckets.length}. Choose a destination for each incomplete Todo.
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
