import { Badge } from '@shared/components/ui/badge'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/utils/tailwind'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  CornerUpLeft,
  FastForward,
  Layers3,
  Route as RouteIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

// PROTOTYPE: Throwaway UI for testing the todo migration flow. State is in memory only.
const prototypePlan =
  'Selected direction: a focused worklist with a persistent explanation of the two migration destinations.'

type Decision = 'back' | 'forward'
type Scenario = 'single' | 'multi'

type MigrationTodo = {
  category: { color: 'blue' | 'rose' | 'teal' | 'violet'; name: string }
  id: string
  tags: Array<{ color: 'amber' | 'blue' | 'orange' | 'rose'; name: string }>
  title: string
}

type MigrationStep = {
  backLabel: string
  bucketLabel: string
  destinationLabel: string
  eyebrow: string
  id: string
  todos: Array<MigrationTodo>
}

export const Route = createFileRoute('/prototype/migration')({
  component: RouteComponent,
})

function RouteComponent() {
  const [scenario, setScenario] = useState<Scenario>('multi')
  const [stepIndex, setStepIndex] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [isComplete, setIsComplete] = useState(false)
  const steps = scenario === 'single' ? [migrationSteps[0]] : migrationSteps
  const step = steps[stepIndex]
  const currentDecisions = step ? getStepDecisions(step, decisions) : []
  const decidedCount = currentDecisions.filter(Boolean).length

  function restart(nextScenario = scenario) {
    setScenario(nextScenario)
    setStepIndex(0)
    setDecisions({})
    setIsComplete(false)
  }

  function decide(todoId: string, decision: Decision) {
    setDecisions((previous) => ({ ...previous, [todoId]: decision }))
  }

  function resolveStep(decision?: Decision) {
    if (!step) {
      return
    }

    if (decision) {
      setDecisions((previous) => ({
        ...previous,
        ...Object.fromEntries(step.todos.map((todo) => [todo.id, decision])),
      }))
    }

    if (stepIndex === steps.length - 1) {
      setIsComplete(true)
      return
    }

    setStepIndex((previous) => previous + 1)
  }

  return (
    <main className='min-h-[calc(100vh-3.5rem)] bg-muted/35 px-4 py-6 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-6xl'>
        <section
          className='mb-6 rounded-lg border border-dashed border-foreground/15 bg-background px-4 py-3 text-sm'
          aria-label='Prototype controls'
        >
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <p className='font-medium'>PROTOTYPE - todo migration flow</p>
              <p className='mt-0.5 text-muted-foreground'>{prototypePlan}</p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                size='sm'
                variant={scenario === 'single' ? 'default' : 'outline'}
                onClick={() => restart('single')}
              >
                Single step
              </Button>
              <Button
                type='button'
                size='sm'
                variant={scenario === 'multi' ? 'default' : 'outline'}
                onClick={() => restart('multi')}
              >
                Multi-step flow
              </Button>
              <Badge variant='outline'>
                {isComplete ? 'Migration complete' : `Step ${stepIndex + 1} of ${steps.length}`}
              </Badge>
            </div>
          </div>
        </section>

        {isComplete ? (
          <MigrationComplete onRestart={() => restart()} />
        ) : step ? (
          <MigrationFlow
            decisions={currentDecisions}
            decidedCount={decidedCount}
            onDecide={decide}
            onResolveStep={resolveStep}
            step={step}
            stepCount={steps.length}
            stepIndex={stepIndex}
          />
        ) : null}
      </div>
    </main>
  )
}

type MigrationVariantProps = {
  decidedCount: number
  decisions: Array<Decision | undefined>
  onDecide: (todoId: string, decision: Decision) => void
  onResolveStep: (decision?: Decision) => void
  step: MigrationStep
  stepCount: number
  stepIndex: number
}

function MigrationFlow({
  decidedCount,
  decisions,
  onDecide,
  onResolveStep,
  step,
  stepCount,
  stepIndex,
}: MigrationVariantProps) {
  return (
    <section className='mx-auto flex max-w-6xl flex-col pb-44'>
      <MigrationHeader step={step} stepCount={stepCount} stepIndex={stepIndex} compact />

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
              <DestinationTodoRow
                key={todo.id}
                decision={decisions[index]}
                isLast={index === step.todos.length - 1}
                onDecide={onDecide}
                todo={todo}
              />
            ))}
          </div>
        </div>

        <aside className='self-start rounded-lg border border-border bg-background p-5 lg:sticky lg:top-20'>
          <span className='flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary'>
            <Layers3 className='size-5' aria-hidden='true' />
          </span>
          <h2 className='mt-4 text-base font-semibold'>{step.todos.length} todos need a new home</h2>
          <DestinationKey
            icon={<CornerUpLeft aria-hidden='true' />}
            label='Move back'
            value={step.backLabel}
            tone='back'
          />
          <DestinationKey
            icon={<ArrowRight aria-hidden='true' />}
            label='Carry forward'
            value={step.destinationLabel}
            tone='forward'
          />
          <div className='mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground'>
            The current bucket closes after every todo has one destination.
          </div>
        </aside>
      </div>

      <MigrationFooter decidedCount={decidedCount} onResolveStep={onResolveStep} total={step.todos.length} />
    </section>
  )
}

function MigrationHeader({
  compact = false,
  step,
  stepCount,
  stepIndex,
}: {
  compact?: boolean
  step: MigrationStep
  stepCount: number
  stepIndex: number
}) {
  return (
    <header>
      <div className='flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
        <RouteIcon className='size-3.5 text-primary' aria-hidden='true' />
        {step.eyebrow}
        {stepCount > 1 ? (
          <span className='text-muted-foreground/60'>
            - Step {stepIndex + 1} of {stepCount}
          </span>
        ) : null}
      </div>
      <h1 className={cn('mt-3 font-semibold tracking-normal', compact ? 'text-3xl' : 'text-4xl')}>
        Decide what moves on from {step.bucketLabel}.
      </h1>
      <p className='mt-3 max-w-2xl text-sm leading-6 text-muted-foreground'>
        This bucket has reached its end. Keep the work at the same horizon, or return it to a broader bucket for another
        pass.
      </p>
    </header>
  )
}

function DestinationTodoRow({
  decision,
  isLast,
  onDecide,
  todo,
}: {
  decision: Decision | undefined
  isLast: boolean
  onDecide: (todoId: string, decision: Decision) => void
  todo: MigrationTodo
}) {
  return (
    <article
      className={cn('grid gap-4 p-4 lg:grid-cols-[minmax(12rem,1fr)_auto]', !isLast && 'border-b border-border')}
    >
      <TodoIdentity todo={todo} />
      <DecisionButtons decision={decision} onDecide={onDecide} todo={todo} />
    </article>
  )
}

function TodoIdentity({ compact = false, todo }: { compact?: boolean; todo: MigrationTodo }) {
  const categoryTone = colorStyles[todo.category.color]

  return (
    <div className={cn('min-w-0 border-l-4 pl-3', categoryTone.border)}>
      <div className={cn('flex flex-wrap items-center gap-2', !compact && 'mb-2')}>
        <Badge className={cn('rounded-sm border-0 px-1.5 py-0 text-[11px] uppercase', categoryTone.badge)}>
          {todo.category.name}
        </Badge>
        {todo.tags.map((tag) => (
          <Badge
            key={tag.name}
            variant='outline'
            className={cn('rounded-sm px-1.5 py-0 text-[11px] uppercase', colorStyles[tag.color].tag)}
          >
            {tag.name}
          </Badge>
        ))}
      </div>
      <h2 className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>{todo.title}</h2>
    </div>
  )
}

function DecisionButtons({
  decision,
  onDecide,
  todo,
}: {
  decision: Decision | undefined
  onDecide: (todoId: string, decision: Decision) => void
  todo: MigrationTodo
}) {
  return (
    <div className='flex shrink-0 flex-col gap-2 sm:flex-row'>
      <Button
        type='button'
        size='sm'
        variant='outline'
        className={cn(
          'border-violet-200 text-violet-800 hover:bg-violet-50 hover:text-violet-900',
          decision === 'back' && 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700 hover:text-white',
        )}
        onClick={() => onDecide(todo.id, 'back')}
      >
        <CornerUpLeft aria-hidden='true' />
        Move back
      </Button>
      <Button
        type='button'
        size='sm'
        variant='outline'
        className={cn(
          'border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900',
          decision === 'forward' &&
            'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white',
        )}
        onClick={() => onDecide(todo.id, 'forward')}
      >
        <FastForward aria-hidden='true' />
        Carry forward
      </Button>
    </div>
  )
}

function DestinationKey({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode
  label: string
  tone: Decision
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

function MigrationFooter({
  decidedCount,
  onResolveStep,
  total,
}: {
  decidedCount: number
  onResolveStep: (decision?: Decision) => void
  total: number
}) {
  const isReady = decidedCount === total
  const percentage = Math.round((decidedCount / total) * 100)

  return (
    <footer className='fixed right-0 bottom-0 left-0 z-30 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgb(15_23_42/0.08)] backdrop-blur sm:px-6'>
      <div className='mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex min-w-0 items-center gap-3'>
          <div className='min-w-36'>
            <div className='mb-1 flex items-baseline justify-between gap-3 text-xs'>
              <span className='font-medium'>Decisions made</span>
              <span className='text-muted-foreground tabular-nums'>
                {decidedCount}/{total}
              </span>
            </div>
            <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
              <div className='h-full rounded-full bg-primary transition-[width]' style={{ width: `${percentage}%` }} />
            </div>
          </div>
          {isReady ? (
            <p className='hidden text-sm text-muted-foreground sm:block'>Every todo has a destination.</p>
          ) : null}
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='border-violet-200 text-violet-800 hover:bg-violet-50 hover:text-violet-900'
            onClick={() => onResolveStep('back')}
          >
            <ArrowDownToLine aria-hidden='true' />
            Move all back
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900'
            onClick={() => onResolveStep('forward')}
          >
            <FastForward aria-hidden='true' />
            Carry all forward
          </Button>
          <Button type='button' size='sm' disabled={!isReady} onClick={() => onResolveStep()}>
            Confirm choices
            <ChevronRight aria-hidden='true' />
          </Button>
        </div>
      </div>
    </footer>
  )
}

function MigrationComplete({ onRestart }: { onRestart: () => void }) {
  return (
    <section className='mx-auto mt-20 max-w-xl rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-950'>
      <span className='mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700'>
        <Check className='size-6' aria-hidden='true' />
      </span>
      <h1 className='mt-4 text-2xl font-semibold'>Every todo has a next home.</h1>
      <p className='mt-2 text-sm leading-6 text-emerald-900/75'>
        The prototype would now return the user to their board with the new planning buckets in place.
      </p>
      <Button type='button' className='mt-6' onClick={onRestart}>
        Restart prototype
      </Button>
    </section>
  )
}

function getStepDecisions(step: MigrationStep, decisions: Record<string, Decision>) {
  return step.todos.map((todo) => decisions[todo.id])
}

const migrationSteps: Array<MigrationStep> = [
  {
    id: 'daily',
    eyebrow: 'Daily migration',
    bucketLabel: 'Friday, 26 June',
    backLabel: 'Week 26 (22-28 Jun)',
    destinationLabel: 'Monday, 29 June',
    todos: [
      {
        id: 'daily-1',
        title: 'Draft the bucket migration PRD',
        category: { name: 'Work', color: 'blue' },
        tags: [{ name: 'focus', color: 'blue' }],
      },
      {
        id: 'daily-2',
        title: 'Book the dentist follow-up',
        category: { name: 'Personal', color: 'rose' },
        tags: [{ name: 'quick win', color: 'amber' }],
      },
      {
        id: 'daily-3',
        title: 'Clean up seed bucket labels',
        category: { name: 'Work', color: 'blue' },
        tags: [{ name: 'blocked', color: 'orange' }],
      },
      {
        id: 'daily-4',
        title: 'Prepare the Monday focus block',
        category: { name: 'Planning', color: 'teal' },
        tags: [{ name: 'important', color: 'rose' }],
      },
    ],
  },
  {
    id: 'weekly',
    eyebrow: 'Weekly migration',
    bucketLabel: 'Week 26 (22-28 Jun)',
    backLabel: 'June 2026',
    destinationLabel: 'Week 27 (29 Jun-5 Jul)',
    todos: [
      {
        id: 'weekly-1',
        title: 'Prepare the Q3 planning agenda',
        category: { name: 'Work', color: 'blue' },
        tags: [{ name: 'focus', color: 'blue' }],
      },
      {
        id: 'weekly-2',
        title: 'Reconcile project budget notes',
        category: { name: 'Finance', color: 'violet' },
        tags: [{ name: 'waiting', color: 'orange' }],
      },
      {
        id: 'weekly-3',
        title: 'Sort out the storage cupboard',
        category: { name: 'Home', color: 'teal' },
        tags: [{ name: 'weekend', color: 'amber' }],
      },
    ],
  },
  {
    id: 'monthly',
    eyebrow: 'Monthly migration',
    bucketLabel: 'June 2026',
    backLabel: '2026',
    destinationLabel: 'July 2026',
    todos: [
      {
        id: 'monthly-1',
        title: 'Decide the July product focus',
        category: { name: 'Work', color: 'blue' },
        tags: [{ name: 'strategy', color: 'rose' }],
      },
      {
        id: 'monthly-2',
        title: 'Schedule annual health check',
        category: { name: 'Personal', color: 'rose' },
        tags: [{ name: 'important', color: 'amber' }],
      },
    ],
  },
]

const colorStyles = {
  amber: {
    border: 'border-amber-500',
    badge: 'bg-amber-100 text-amber-800',
    tag: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  blue: {
    border: 'border-blue-500',
    badge: 'bg-blue-100 text-blue-800',
    tag: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  orange: {
    border: 'border-orange-500',
    badge: 'bg-orange-100 text-orange-800',
    tag: 'border-orange-200 bg-orange-50 text-orange-800',
  },
  rose: {
    border: 'border-rose-500',
    badge: 'bg-rose-100 text-rose-800',
    tag: 'border-rose-200 bg-rose-50 text-rose-800',
  },
  teal: {
    border: 'border-teal-500',
    badge: 'bg-teal-100 text-teal-800',
    tag: 'border-teal-200 bg-teal-50 text-teal-800',
  },
  violet: {
    border: 'border-violet-500',
    badge: 'bg-violet-100 text-violet-800',
    tag: 'border-violet-200 bg-violet-50 text-violet-800',
  },
} as const
