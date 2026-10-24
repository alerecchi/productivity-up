// PROTOTYPE variant "Telescope": Today is a bright hero lens; every broader horizon is a narrower,
// quieter, more collapsed layer stacked beneath it. Work is pulled upward, toward the light.
import { ChevronDown, GripVertical, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'

import { Button } from '@/features/shared/components/ui/button'
import { Progress } from '@/features/shared/components/ui/progress'
import { cn } from '@/features/shared/utils/tailwind'

import { useBoard, useBucketDropTarget, useBucketList, useTodoSortable, withViewTransition } from '../prototype-board'
import { BUCKET_META, periodLabel, plural } from '../prototype-data'
import type { BucketId, Todo } from '../prototype-data'
import { CategoryChip, DayCompleteMoment, DoneCheck, QuickAdd, Tags, TodoMenu, useTodayStats } from '../prototype-parts'

const LAYERS: Array<{ id: Exclude<BucketId, 'today'>; depth: 1 | 2 | 3 | 4 }> = [
  { id: 'week', depth: 1 },
  { id: 'month', depth: 2 },
  { id: 'year', depth: 3 },
  { id: 'inbox', depth: 4 },
]

const LAYER_STYLE = {
  1: { surface: 'bg-card', heading: 'text-xl font-bold text-foreground', row: 'text-[0.9375rem]' },
  2: { surface: 'bg-card/70', heading: 'text-lg font-semibold text-foreground', row: 'text-sm' },
  3: { surface: 'bg-muted', heading: 'text-base font-semibold text-muted-foreground', row: 'text-sm' },
  4: {
    surface: 'bg-transparent border border-dashed border-border',
    heading: 'text-sm font-semibold text-muted-foreground',
    row: 'text-sm',
  },
} as const

export function TelescopeVariant() {
  const [dayOpen, setDayOpen] = useState(false)

  return (
    <main className='min-h-[calc(100dvh-3.5rem)] bg-background pb-28'>
      <div className='mx-auto flex max-w-3xl flex-col gap-3 px-3 pt-4 [--lens-step:0.5rem] sm:px-6 sm:pt-8 sm:[--lens-step:1.75rem]'>
        <TodayLens onCompleteDay={() => setDayOpen(true)} />
        <p className='mt-4 mb-1 px-2 text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase'>
          Further out
        </p>
        {LAYERS.map((layer) => (
          <HorizonLayer key={layer.id} bucketId={layer.id} depth={layer.depth} />
        ))}
      </div>
      <DayCompleteMoment open={dayOpen} onOpenChange={setDayOpen} />
    </main>
  )
}

function TodayLens({ onCompleteDay }: { onCompleteDay: () => void }) {
  const { todosIn } = useBoard()
  const todos = todosIn('today')
  const { done, total, left, allDone } = useTodayStats()
  const { ref, isDropTarget } = useBucketList('today')
  const now = new Date()

  return (
    <section
      aria-labelledby='lens-today'
      className='relative overflow-hidden rounded-[1.75rem] bg-primary p-2 text-primary-foreground sm:p-3'
    >
      <header className='flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-3 pt-3 pb-4 sm:px-4 sm:pt-4'>
        <div>
          <p className='text-xs font-semibold tracking-[0.05em] uppercase opacity-80'>Today</p>
          <h2 id='lens-today' className='text-4xl leading-[1.1] font-extrabold tracking-[-0.02em] sm:text-5xl'>
            {new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now)}
          </h2>
          <p className='mt-1 text-sm font-medium opacity-80'>
            {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(now)}
          </p>
        </div>
        {total > 0 ? (
          <div className='flex min-w-36 flex-1 flex-col gap-1.5 sm:max-w-48'>
            <p className='text-sm font-medium tabular-nums'>
              {allDone ? 'All done' : plural(left, '# to go', '# to go')}
              <span className='opacity-70'> · {plural(done, '# done', '# done')}</span>
            </p>
            <Progress
              value={(done / total) * 100}
              aria-label='Today’s progress'
              className='[&_[data-slot=progress-indicator]]:bg-primary-foreground [&_[data-slot=progress-track]]:bg-primary-foreground/25'
            />
          </div>
        ) : null}
      </header>

      <ol
        ref={ref}
        aria-label='Today’s todos'
        className={cn(
          'flex min-h-16 flex-col gap-1.5 rounded-[1.25rem] transition-[background-color] duration-150',
          isDropTarget && 'bg-primary-foreground/15',
        )}
      >
        {todos.map((todo, index) => (
          <LensRow key={todo.id} todo={todo} bucketId='today' index={index} level='today' />
        ))}
        {todos.length === 0 ? (
          <li className='flex flex-col items-center gap-1 px-4 py-6 text-center'>
            <Sparkles aria-hidden className='size-5' />
            <p className='font-semibold'>Today’s clear!</p>
            <p className='text-sm opacity-80'>Drag something up from this week, or add it below.</p>
          </li>
        ) : null}
      </ol>

      <div className='mt-2 flex flex-col gap-2 sm:flex-row sm:items-center'>
        <QuickAdd
          bucketId='today'
          placeholder='Add to today, e.g. Call the bank #phone @work'
          className='flex-1'
          inputClassName='h-11 rounded-[1.25rem] bg-primary-foreground/15 text-primary-foreground placeholder:text-primary-foreground/70 focus-visible:ring-primary-foreground/60'
        />
        <Button
          size='lg'
          onClick={onCompleteDay}
          className={cn(
            'h-11 rounded-[1.25rem] bg-primary-foreground px-5 font-semibold text-primary transition-[background-color,scale] duration-150 ease-out hover:bg-primary-foreground/90 enabled:active:scale-[0.96]',
            allDone && 'motion-safe:animate-[lens-glow_1.6s_ease-out_1]',
          )}
        >
          Complete the day
        </Button>
      </div>
      <style>{`@keyframes lens-glow { 0% { box-shadow: 0 0 0 0 oklch(1 0 0 / 0.6) } 100% { box-shadow: 0 0 0 14px oklch(1 0 0 / 0) } }`}</style>
    </section>
  )
}

function HorizonLayer({ bucketId, depth }: { bucketId: Exclude<BucketId, 'today'>; depth: 1 | 2 | 3 | 4 }) {
  const { todosIn, draggingId } = useBoard()
  const todos = todosIn(bucketId)
  const [open, setOpen] = useState(depth === 1)
  const style = LAYER_STYLE[depth]
  const headingId = useId()
  const panelId = useId()
  const headerDrop = useBucketDropTarget(bucketId, { position: 'start' })
  const openTodos = todos.filter((t) => !t.done)

  return (
    <section
      aria-labelledby={headingId}
      style={{ marginInline: `calc(${depth} * var(--lens-step))` }}
      className={cn(
        'rounded-[1.5rem] p-1.5 transition-[background-color,box-shadow] duration-150',
        style.surface,
        headerDrop.isDropTarget && 'ring-2 ring-primary',
      )}
    >
      <h3 id={headingId} className='m-0'>
        <button
          ref={headerDrop.ref}
          type='button'
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className='flex w-full items-center gap-3 rounded-[1.125rem] px-3 py-2.5 text-start transition-[background-color] duration-150 outline-none hover:bg-foreground/5 focus-visible:ring-[3px] focus-visible:ring-ring/50'
        >
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className={cn('leading-[1.25]', style.heading)}>{BUCKET_META[bucketId].name}</span>
            <span className='truncate text-xs text-muted-foreground'>
              {periodLabel(bucketId)}
              {!open && openTodos.length > 0 ? (
                <>
                  {' · '}
                  {openTodos
                    .slice(0, 2)
                    .map((t) => t.title)
                    .join(', ')}
                  {openTodos.length > 2 ? '…' : ''}
                </>
              ) : null}
            </span>
          </span>
          {headerDrop.isDropTarget ? (
            <span className='text-xs font-semibold text-primary'>Drop to add</span>
          ) : (
            <span className='rounded-full bg-foreground/5 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums'>
              {todos.length}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-[rotate] duration-200 ease-out',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key='panel'
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
            className='overflow-hidden'
          >
            <LayerList bucketId={bucketId} todos={todos} rowClass={style.row} dragging={draggingId !== null} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}

function LayerList({
  bucketId,
  todos,
  rowClass,
  dragging,
}: {
  bucketId: BucketId
  todos: Array<Todo>
  rowClass: string
  dragging: boolean
}) {
  const { ref, isDropTarget } = useBucketList(bucketId)
  return (
    <div className='flex flex-col gap-1 px-1.5 pb-1.5'>
      <ol
        ref={ref}
        aria-label={`${BUCKET_META[bucketId].name} todos`}
        className={cn(
          'flex min-h-10 flex-col gap-1 rounded-[1rem] transition-[background-color] duration-150',
          isDropTarget && dragging && 'bg-primary/10',
        )}
      >
        {todos.map((todo, index) => (
          <LensRow key={todo.id} todo={todo} bucketId={bucketId} index={index} level='layer' textClass={rowClass} />
        ))}
        {todos.length === 0 ? <li className='px-3 py-2 text-sm text-muted-foreground'>Nothing here yet.</li> : null}
      </ol>
      <QuickAdd
        bucketId={bucketId}
        placeholder={`Add to ${BUCKET_META[bucketId].name.toLowerCase()}`}
        inputClassName='h-9 rounded-[0.875rem] hover:bg-foreground/5 focus:bg-background'
      />
    </div>
  )
}

function LensRow({
  todo,
  bucketId,
  index,
  level,
  textClass,
}: {
  todo: Todo
  bucketId: BucketId
  index: number
  level: 'today' | 'layer'
  textClass?: string
}) {
  const { ref, isDragging } = useTodoSortable(todo.id, bucketId, index)
  const { sinkDone } = useBoard()
  const titleId = useId()
  const isToday = level === 'today'

  return (
    <li
      ref={ref}
      role='listitem'
      style={{ viewTransitionName: `todo-${todo.id}` }}
      className={cn(
        'group/row relative flex touch-manipulation items-start gap-3 rounded-[1.125rem] bg-card text-card-foreground select-none',
        isToday ? 'px-3.5 py-3' : 'px-3 py-2',
        !isToday && 'bg-background/60',
        todo.done && 'bg-card/60',
        isDragging && 'z-10 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.35)]',
      )}
    >
      <GripVertical
        aria-hidden
        className='absolute top-1/2 -left-0.5 hidden size-3.5 -translate-y-1/2 text-muted-foreground/60 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 sm:block'
      />
      <span className={cn('flex', isToday ? 'pt-0.5' : 'pt-px')}>
        <DoneCheck
          todo={todo}
          labelledBy={titleId}
          onToggled={(done) => {
            if (done) setTimeout(() => withViewTransition(() => sinkDone(todo.id)), 450)
          }}
        />
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <span
          id={titleId}
          className={cn(
            'leading-[1.4] text-pretty transition-[color] duration-150',
            isToday ? 'text-base font-semibold' : cn('font-medium', textClass),
            todo.done && 'text-muted-foreground line-through decoration-muted-foreground/60',
          )}
        >
          {todo.title}
        </span>
        {(todo.categoryId || todo.tags.length > 0) && !(todo.done && !isToday) ? (
          <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', todo.done && 'opacity-60')}>
            <CategoryChip categoryId={todo.categoryId} />
            <Tags tags={todo.tags} />
          </span>
        ) : null}
      </div>
      <TodoMenu todo={todo} className='-my-1 -me-1.5 shrink-0' />
    </li>
  )
}
