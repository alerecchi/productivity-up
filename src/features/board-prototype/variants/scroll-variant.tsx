// PROTOTYPE variant "The scroll": one continuous page, like a paper planner. No cards, no columns.
// Hierarchy comes from type alone: Today's heading is huge, every broader horizon is set smaller and quieter.
import { GripVertical, Moon, Plus } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/features/shared/components/ui/button'
import { cn } from '@/features/shared/utils/tailwind'

import { useBoard, useBucketDropTarget, useBucketList, useTodoSortable } from '../prototype-board'
import { BUCKETS_BY_URGENCY, BUCKET_META, periodLabel, plural } from '../prototype-data'
import type { BucketId, Todo } from '../prototype-data'
import { CategoryDot, DayCompleteMoment, DoneCheck, QuickAdd, Tags, TodoMenu, useTodayStats } from '../prototype-parts'

const TYPE: Record<BucketId, { heading: string; row: string; gap: string; check: string }> = {
  today: {
    heading: 'text-5xl leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-6xl',
    row: 'text-lg font-medium',
    gap: 'py-3',
    check: 'size-5',
  },
  week: {
    heading: 'text-3xl leading-[1.1] font-bold tracking-[-0.02em] sm:text-4xl',
    row: 'text-base font-medium',
    gap: 'py-2.5',
    check: 'size-[1.125rem]',
  },
  month: {
    heading: 'text-2xl leading-[1.2] font-bold tracking-[-0.015em] sm:text-3xl',
    row: 'text-base',
    gap: 'py-2',
    check: 'size-4',
  },
  year: {
    heading: 'text-xl leading-[1.25] font-semibold tracking-[-0.01em] text-muted-foreground sm:text-2xl',
    row: 'text-[0.9375rem]',
    gap: 'py-1.5',
    check: 'size-4',
  },
  inbox: {
    heading: 'text-lg leading-[1.3] font-semibold text-muted-foreground',
    row: 'text-sm text-foreground/90',
    gap: 'py-1.5',
    check: 'size-4',
  },
}

function jumpTo(bucketId: BucketId) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document
    .getElementById(`scroll-${bucketId}`)
    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

export function ScrollVariant() {
  const [dayOpen, setDayOpen] = useState(false)

  return (
    <main className='min-h-[calc(100dvh-3.5rem)] bg-background pb-32'>
      <ChipStrip />
      <div className='mx-auto grid max-w-5xl gap-12 px-5 pt-6 sm:px-8 lg:grid-cols-[11rem_minmax(0,1fr)] lg:pt-12'>
        <Rail />
        <div className='flex max-w-2xl flex-col gap-14'>
          {BUCKETS_BY_URGENCY.map((bucketId) => (
            <ScrollSection key={bucketId} bucketId={bucketId} onCompleteDay={() => setDayOpen(true)} />
          ))}
        </div>
      </div>
      <DayCompleteMoment open={dayOpen} onOpenChange={setDayOpen} />
    </main>
  )
}

/** Desktop outline: jump links that double as drop targets. */
function Rail() {
  return (
    <nav aria-label='Horizons' className='hidden lg:block'>
      <ol className='sticky top-24 flex flex-col gap-1'>
        {BUCKETS_BY_URGENCY.map((bucketId) => (
          <RailLink key={bucketId} bucketId={bucketId} />
        ))}
      </ol>
    </nav>
  )
}

function RailLink({ bucketId }: { bucketId: BucketId }) {
  const { todosIn, draggingId } = useBoard()
  const { ref, isDropTarget } = useBucketDropTarget(bucketId, { key: 'rail' })
  const open = todosIn(bucketId).filter((t) => !t.done).length
  const weight = BUCKET_META[bucketId].weight

  return (
    <li>
      <button
        ref={ref}
        type='button'
        onClick={() => jumpTo(bucketId)}
        className={cn(
          'flex w-full items-baseline justify-between gap-2 rounded-lg px-3 py-1.5 text-start transition-[background-color,color] duration-150 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
          weight === 5
            ? 'text-base font-bold'
            : weight >= 3
              ? 'text-sm font-semibold'
              : 'text-sm text-muted-foreground',
          draggingId && 'ring-1 ring-border',
          isDropTarget && 'bg-primary text-primary-foreground ring-primary',
        )}
      >
        {BUCKET_META[bucketId].name}
        <span className='text-xs font-normal tabular-nums opacity-70'>{open}</span>
      </button>
    </li>
  )
}

/** Phone outline: the same jump links and drop targets, as a sticky strip. */
function ChipStrip() {
  return (
    <nav
      aria-label='Horizons'
      className='sticky top-14 z-20 overflow-x-auto border-b border-border bg-background/95 backdrop-blur lg:hidden'
    >
      <ol className='flex w-max gap-1.5 px-5 py-2.5'>
        {BUCKETS_BY_URGENCY.map((bucketId) => (
          <Chip key={bucketId} bucketId={bucketId} />
        ))}
      </ol>
    </nav>
  )
}

function Chip({ bucketId }: { bucketId: BucketId }) {
  const { todosIn } = useBoard()
  const { ref, isDropTarget } = useBucketDropTarget(bucketId, { key: 'chip' })
  const open = todosIn(bucketId).filter((t) => !t.done).length
  return (
    <li>
      <button
        ref={ref}
        type='button'
        onClick={() => jumpTo(bucketId)}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-[background-color,color] duration-150',
          bucketId === 'today' ? 'bg-foreground font-semibold text-background' : 'bg-muted text-foreground',
          isDropTarget && 'bg-primary text-primary-foreground',
        )}
      >
        {BUCKET_META[bucketId].short}
        <span className='text-xs tabular-nums opacity-70'>{open}</span>
      </button>
    </li>
  )
}

function ScrollSection({ bucketId, onCompleteDay }: { bucketId: BucketId; onCompleteDay: () => void }) {
  const { todosIn, draggingId } = useBoard()
  const todos = todosIn(bucketId)
  const { ref, isDropTarget } = useBucketList(bucketId)
  const type = TYPE[bucketId]
  const headingId = useId()
  const isToday = bucketId === 'today'
  const open = todos.filter((t) => !t.done).length

  return (
    <section id={`scroll-${bucketId}`} aria-labelledby={headingId} className='scroll-mt-32 lg:scroll-mt-24'>
      <header className='mb-3 flex flex-col gap-1'>
        <p className='text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase'>
          {periodLabel(bucketId)}
          {todos.length > 0 ? ` · ${plural(open, '# open', '# open')}` : ''}
        </p>
        <h2 id={headingId} className={cn('text-balance', type.heading)}>
          {BUCKET_META[bucketId].name}
        </h2>
      </header>

      <ol
        ref={ref}
        aria-label={`${BUCKET_META[bucketId].name} todos`}
        className={cn(
          '-mx-3 flex min-h-10 flex-col rounded-xl transition-[background-color] duration-150',
          isDropTarget && draggingId && 'bg-primary/8',
        )}
      >
        {todos.map((todo, index) => (
          <ScrollRow key={todo.id} todo={todo} bucketId={bucketId} index={index} />
        ))}
        {todos.length === 0 && isToday ? (
          <li className='px-3 py-3 text-lg text-muted-foreground'>Today’s clear! Grab something from this week.</li>
        ) : null}
      </ol>

      <div className='-mx-3 flex items-center gap-1 rounded-lg ps-3 text-muted-foreground focus-within:text-foreground'>
        <Plus aria-hidden className='size-4 shrink-0' />
        <QuickAdd
          bucketId={bucketId}
          placeholder={
            isToday
              ? 'Add a line, e.g. Call the bank #phone @work'
              : `Add to ${BUCKET_META[bucketId].name.toLowerCase()}`
          }
          className='flex-1'
          inputClassName={cn('px-2', isToday && 'h-12 text-lg sm:text-lg')}
        />
      </div>

      {isToday ? <SignOff onCompleteDay={onCompleteDay} /> : null}
    </section>
  )
}

function SignOff({ onCompleteDay }: { onCompleteDay: () => void }) {
  const { allDone, done } = useTodayStats()
  return (
    <div className='mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-border pt-5'>
      <Button size='lg' onClick={onCompleteDay} className='font-semibold enabled:active:scale-[0.96]'>
        <Moon /> Close the day
      </Button>
      <p className='text-sm text-pretty text-muted-foreground'>
        {allDone
          ? 'Every line is crossed out. Go enjoy the evening.'
          : done > 0
            ? plural(done, '# crossed out so far.', '# crossed out so far.')
            : 'Anything unfinished gets a fresh choice tomorrow.'}
      </p>
    </div>
  )
}

function ScrollRow({ todo, bucketId, index }: { todo: Todo; bucketId: BucketId; index: number }) {
  const { ref, isDragging } = useTodoSortable(todo.id, bucketId, index)
  const titleId = useId()
  const type = TYPE[bucketId]

  return (
    <li
      ref={ref}
      role='listitem'
      style={{ viewTransitionName: `todo-${todo.id}` }}
      className={cn(
        'group/row relative flex touch-manipulation items-start gap-3 rounded-xl px-3 select-none',
        type.gap,
        isDragging && 'z-10 bg-card shadow-[0_16px_36px_-10px_rgb(0_0_0/0.35)]',
      )}
    >
      <GripVertical
        aria-hidden
        className='absolute top-1/2 -left-3 size-4 -translate-y-1/2 text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 pointer-coarse:hidden'
      />
      <span className={cn('flex', bucketId === 'today' ? 'pt-1' : 'pt-0.5')}>
        <DoneCheck todo={todo} labelledBy={titleId} className={type.check} />
      </span>
      <div className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5'>
        <span
          id={titleId}
          className={cn(
            'leading-[1.4] text-pretty line-through decoration-transparent decoration-2 transition-[color,text-decoration-color] duration-300 ease-out',
            type.row,
            todo.done && 'text-muted-foreground decoration-foreground/50',
          )}
        >
          {todo.title}
        </span>
        <span
          className={cn(
            'flex flex-wrap items-baseline gap-x-2.5 text-muted-foreground transition-opacity duration-300',
            todo.done && 'opacity-50',
          )}
        >
          <CategoryDot categoryId={todo.categoryId} />
          <Tags tags={todo.tags} />
        </span>
      </div>
      <TodoMenu
        todo={todo}
        className='-my-1 shrink-0 transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:aria-expanded:opacity-100'
      />
    </li>
  )
}
