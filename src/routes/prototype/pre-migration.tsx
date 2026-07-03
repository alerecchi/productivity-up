import { Badge } from '@shared/components/ui/badge'
import { Button } from '@shared/components/ui/button'
import { Card, CardContent } from '@shared/components/ui/card'
import { cn } from '@shared/utils/tailwind'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, Circle, ClipboardCheck, Clock, ListChecks, Sunrise } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

const prototypePlan = 'C timeline handoff for the pre-migration step on the throwaway /prototype/pre-migration route.'

type Scenario = 'unfinished' | 'complete'

type TodoPreview = {
  completed: boolean
  title: string
}

type PreMigrationState = {
  bucketLabel: string
  completedCount: number
  dateLabel: string
  nextBucketLabel: string
  todos: Array<TodoPreview>
  unfinishedCount: number
}

export const Route = createFileRoute('/prototype/pre-migration')({
  component: RouteComponent,
})

function RouteComponent() {
  const [scenario, setScenario] = useState<Scenario>('unfinished')
  const state = getScenarioState(scenario)

  return (
    <main className='min-h-[calc(100vh-3.5rem)] bg-muted/30 px-4 py-8 sm:px-6'>
      <div className='mx-auto flex max-w-6xl flex-col gap-5'>
        <div className='rounded-lg border border-dashed border-foreground/15 bg-background p-4 text-sm'>
          <p className='font-medium'>PROTOTYPE - pre-migration dialog</p>
          <p className='mt-1 text-muted-foreground'>{prototypePlan}</p>
          <div className='mt-3 flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              size='sm'
              variant={scenario === 'unfinished' ? 'default' : 'outline'}
              onClick={() => setScenario('unfinished')}
            >
              With unfinished todos
            </Button>
            <Button
              type='button'
              size='sm'
              variant={scenario === 'complete' ? 'default' : 'outline'}
              onClick={() => setScenario('complete')}
            >
              Everything complete
            </Button>
            <Badge variant='outline'>
              State: {state.completedCount} completed / {state.unfinishedCount} unfinished
            </Badge>
          </div>
        </div>

        <MockBoard state={state} />
      </div>

      <div className='fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px]' aria-hidden='true' />
      <VariantC state={state} />
    </main>
  )
}

function VariantC({ state }: { state: PreMigrationState }) {
  const hasUnfinished = state.unfinishedCount > 0

  return (
    <ModalShell className='max-w-3xl'>
      <div className='text-center'>
        <div className='mx-auto flex size-14 items-center justify-center rounded-full bg-sky-100 text-sky-700'>
          <Sunrise className='size-7' aria-hidden='true' />
        </div>
        <h1 className='mt-4 text-2xl font-semibold'>{state.dateLabel} is wrapped</h1>
        <p className='mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground'>
          Close this daily bucket, then transition unfinished work toward {state.nextBucketLabel}.
        </p>
      </div>

      <div className='relative mx-auto flex max-w-xl flex-col gap-3'>
        <TimelineStep
          active
          icon={<ClipboardCheck aria-hidden='true' />}
          title='Review today'
          detail='Capture the end of this daily cycle before choosing what happens next.'
          summary={<ReviewSummary state={state} />}
        />
        <TimelineStep
          active={hasUnfinished}
          icon={<ListChecks aria-hidden='true' />}
          title={hasUnfinished ? 'Migrate unfinished todos' : 'No migration needed'}
          detail={
            hasUnfinished
              ? 'Pick carry forward or move back for each unfinished todo.'
              : 'All todos are completed, so this step is skipped.'
          }
        />
        <TimelineStep
          active
          icon={<ArrowRight aria-hidden='true' />}
          title={`Open ${state.nextBucketLabel}`}
          detail='The board moves to the next planning date after this flow.'
        />
      </div>

      <ModalActions primaryLabel={hasUnfinished ? 'Continue to migration' : 'Close and plan tomorrow'} />
    </ModalShell>
  )
}

function MockBoard({ state }: { state: PreMigrationState }) {
  const columns = ['Inbox', '2026', 'June', 'Week 26', state.bucketLabel]

  return (
    <div className='grid gap-4 overflow-hidden rounded-lg border border-border bg-background p-4 opacity-80 md:grid-cols-5'>
      {columns.map((column, columnIndex) => (
        <div key={column} className='min-h-72 rounded-lg bg-muted/50 p-3'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-semibold'>{column}</span>
            <Badge variant='secondary'>{columnIndex === 4 ? state.todos.length : columnIndex + 1}</Badge>
          </div>
          <div className='mt-4 flex flex-col gap-2'>
            {(columnIndex === 4 ? state.todos : state.todos.slice(0, 2)).map((todo) => (
              <Card key={`${column}-${todo.title}`} size='sm' className='gap-2 rounded-lg py-3'>
                <CardContent className='px-3'>
                  <div className='flex items-center gap-2'>
                    {todo.completed ? (
                      <CheckCircle2 className='size-4 text-emerald-600' aria-hidden='true' />
                    ) : (
                      <Circle className='size-4 text-muted-foreground' aria-hidden='true' />
                    )}
                    <span className={cn('text-xs', todo.completed && 'text-muted-foreground line-through')}>
                      {todo.title}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ModalShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      role='dialog'
      aria-modal='true'
      aria-label='Pre-migration prototype'
      className={cn(
        'fixed top-1/2 left-1/2 z-[60] flex max-h-[calc(100vh-8rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-auto rounded-xl bg-background p-6 text-foreground shadow-2xl ring-1 ring-foreground/10',
        className,
      )}
    >
      {children}
    </section>
  )
}

function ModalActions({ className, primaryLabel }: { className?: string; primaryLabel: string }) {
  return (
    <div className={cn('flex justify-end', className)}>
      <Button type='button'>
        {primaryLabel}
        <ArrowRight aria-hidden='true' />
      </Button>
    </div>
  )
}

function TimelineStep({
  active,
  detail,
  icon,
  summary,
  title,
}: {
  active: boolean
  detail: string
  icon: ReactNode
  summary?: ReactNode
  title: string
}) {
  return (
    <div className={cn('flex gap-3 rounded-lg border p-4', active ? 'bg-background' : 'bg-muted/60 opacity-60')}>
      <span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4'>
        {icon}
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <p className='text-sm font-semibold'>{title}</p>
            <p className='mt-1 text-sm text-muted-foreground'>{detail}</p>
          </div>
          {summary}
        </div>
      </div>
    </div>
  )
}

function ReviewSummary({ state }: { state: PreMigrationState }) {
  return (
    <div className='flex shrink-0 items-center gap-2'>
      <span className='inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800'>
        <CheckCircle2 className='size-3.5' aria-hidden='true' />
        {state.completedCount} completed
      </span>
      {state.unfinishedCount > 0 ? (
        <span className='inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800'>
          <Clock className='size-3.5' aria-hidden='true' />
          {state.unfinishedCount} unfinished
        </span>
      ) : null}
    </div>
  )
}

function getScenarioState(scenario: Scenario): PreMigrationState {
  const completedTodos = [
    { completed: true, title: 'Send project update' },
    { completed: true, title: 'Book dentist appointment' },
    { completed: true, title: 'Review auth PR notes' },
    { completed: true, title: 'Plan Friday focus block' },
    { completed: true, title: 'Pay electricity bill' },
  ]
  const unfinishedTodos =
    scenario === 'unfinished'
      ? [
          { completed: false, title: 'Draft bucket migration PRD' },
          { completed: false, title: 'Clean up seed bucket labels' },
          { completed: false, title: 'Prototype migration flow' },
        ]
      : []

  return {
    bucketLabel: 'Thursday 25',
    completedCount: completedTodos.length,
    dateLabel: 'Thursday, 25 June',
    nextBucketLabel: 'Friday 26',
    todos: [...completedTodos, ...unfinishedTodos],
    unfinishedCount: unfinishedTodos.length,
  }
}
