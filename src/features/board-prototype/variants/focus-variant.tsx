// PROTOTYPE variant "Today + tray": the screen is only Today. Every broader bucket waits in a tray
// (side rail on desktop, bottom sheet on phones) that you pull work out of, by tap or by drag.
import { ArrowUpLeft, ChevronDown, ChevronUp, PartyPopper } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'

import { Button } from '@/features/shared/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/features/shared/components/ui/tabs'
import { cn } from '@/features/shared/utils/tailwind'

import { useBoard, useBucketList, useTodoSortable, withViewTransition } from '../prototype-board'
import { BUCKET_META, periodLabel, plural } from '../prototype-data'
import type { BucketId, Todo } from '../prototype-data'
import {
  CategoryChip,
  CategoryDot,
  DayCompleteMoment,
  DoneCheck,
  QuickAdd,
  Tags,
  TodoMenu,
  useMediaQuery,
  useTodayStats,
} from '../prototype-parts'

type TrayBucket = Exclude<BucketId, 'today'>
const TRAY_BUCKETS: Array<TrayBucket> = ['week', 'month', 'year', 'inbox']

export function FocusVariant() {
  const desktop = useMediaQuery('(min-width: 64rem)')
  const [dayOpen, setDayOpen] = useState(false)
  const [trayOpen, setTrayOpen] = useState(false)
  const [trayBucket, setTrayBucket] = useState<TrayBucket>('week')
  const { draggingId, partitionDone } = useBoard()

  // Done todos live in their own group under the open ones, so Today's order keeps them last.
  useEffect(() => {
    if (!draggingId) partitionDone('today')
  })

  const tray = <Tray bucketId={trayBucket} onBucketChange={setTrayBucket} showHeading={desktop} />

  return (
    <main
      className={cn(
        'bg-background',
        desktop ? 'grid h-[calc(100dvh-3.5rem)] grid-cols-[minmax(0,1fr)_25rem]' : 'min-h-[calc(100dvh-3.5rem)]',
      )}
    >
      <div className={cn(desktop && 'min-h-0 overflow-y-auto overscroll-y-contain')}>
        <TodayFocus
          onCompleteDay={() => setDayOpen(true)}
          onOpenTray={() => setTrayOpen(true)}
          desktop={desktop}
          bottomInset={!desktop}
        />
      </div>
      {desktop ? (
        <aside
          aria-label='Pull into today'
          className='m-3 ms-0 flex min-h-0 flex-col rounded-[1.75rem] bg-muted p-2 pb-20'
        >
          {tray}
        </aside>
      ) : (
        <PhoneTray open={trayOpen} onOpenChange={setTrayOpen} bucketId={trayBucket}>
          {tray}
        </PhoneTray>
      )}
      <DayCompleteMoment open={dayOpen} onOpenChange={setDayOpen} />
    </main>
  )
}

function TodayFocus({
  onCompleteDay,
  onOpenTray,
  desktop,
  bottomInset,
}: {
  onCompleteDay: () => void
  onOpenTray: () => void
  desktop: boolean
  bottomInset: boolean
}) {
  const { todosIn } = useBoard()
  const todos = todosIn('today')
  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)
  const { left, allDone } = useTodayStats()
  const { ref, isDropTarget } = useBucketList('today')
  const [showDone, setShowDone] = useState(true)
  const now = new Date()

  return (
    <section
      aria-labelledby='focus-today'
      className={cn(
        'mx-auto flex w-full max-w-2xl flex-col px-5 pt-8 sm:px-8 sm:pt-14',
        bottomInset ? 'pb-48' : 'pb-24',
      )}
    >
      <p className='text-sm font-semibold text-primary'>
        {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(now)}
      </p>
      <h2 id='focus-today' className='text-5xl leading-[1.05] font-black tracking-[-0.03em] sm:text-7xl'>
        {new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now)}
      </h2>
      <p className='mt-2 text-lg text-muted-foreground'>
        {todos.length === 0
          ? 'Nothing planned yet.'
          : allDone
            ? 'All done. Lovely.'
            : plural(left, '# thing to do today.', '# things to do today.')}
      </p>

      <QuickAdd
        bucketId='today'
        placeholder='What else today? e.g. Call the bank #phone'
        className='mt-8'
        inputClassName='h-12 rounded-2xl bg-muted px-4 text-base'
      />

      <ol
        ref={ref}
        aria-label='Today’s todos'
        className={cn(
          'mt-4 flex min-h-24 flex-col gap-0.5 rounded-2xl p-1 transition-[background-color] duration-150',
          isDropTarget && 'bg-primary/10',
        )}
      >
        {open.map((todo, index) => (
          <FocusRow key={todo.id} todo={todo} index={index} />
        ))}
        {open.length === 0 ? (
          <li className='flex flex-col items-center gap-3 px-4 py-10 text-center'>
            {todos.length === 0 ? (
              <>
                <p className='text-lg font-semibold'>Today’s clear! Grab something from this week.</p>
                {!desktop ? (
                  <Button variant='outline' onClick={onOpenTray}>
                    <ChevronUp /> Open the tray
                  </Button>
                ) : (
                  <p className='text-sm text-muted-foreground'>Drag it in from the tray, or tap its arrow.</p>
                )}
              </>
            ) : (
              <>
                <PartyPopper aria-hidden className='size-8 text-primary' />
                <p className='text-lg font-semibold'>Everything’s done. Ready to close the day?</p>
              </>
            )}
          </li>
        ) : null}
      </ol>

      {done.length > 0 ? (
        <div className='mt-4'>
          <button
            type='button'
            aria-expanded={showDone}
            onClick={() => setShowDone((s) => !s)}
            className='flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-[background-color] duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'
          >
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-[rotate] duration-200', !showDone && '-rotate-90')}
            />
            Done today · <span className='tabular-nums'>{done.length}</span>
          </button>
          <AnimatePresence initial={false}>
            {showDone ? (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
                className='overflow-hidden'
                aria-label='Done today'
              >
                {done.map((todo) => (
                  <DoneRow key={todo.id} todo={todo} />
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      <div className='mt-10 flex justify-center'>
        <Button
          size='lg'
          onClick={onCompleteDay}
          variant={allDone ? 'default' : 'outline'}
          className='h-12 rounded-full px-8 text-base font-semibold enabled:active:scale-[0.96]'
        >
          Complete the day
        </Button>
      </div>
    </section>
  )
}

function FocusRow({ todo, index }: { todo: Todo; index: number }) {
  const { ref, isDragging } = useTodoSortable(todo.id, 'today', index)
  const titleId = useId()
  return (
    <li
      ref={ref}
      role='listitem'
      style={{ viewTransitionName: `todo-${todo.id}` }}
      className={cn(
        'group/row flex touch-manipulation items-start gap-4 rounded-2xl bg-background px-3 py-3.5 transition-[background-color] duration-150 select-none hover:bg-muted/60',
        isDragging && 'z-10 bg-card shadow-[0_16px_36px_-10px_rgb(0_0_0/0.35)]',
      )}
    >
      <span className='flex pt-0.5'>
        <DoneCheck todo={todo} labelledBy={titleId} className='size-6' />
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <span id={titleId} className='text-lg leading-[1.35] font-medium text-pretty'>
          {todo.title}
        </span>
        {todo.categoryId || todo.tags.length > 0 ? (
          <span className='flex flex-wrap items-center gap-x-2.5 gap-y-1'>
            <CategoryChip categoryId={todo.categoryId} />
            <Tags tags={todo.tags} />
          </span>
        ) : null}
      </div>
      <TodoMenu todo={todo} className='shrink-0' />
    </li>
  )
}

/** Done todos shrink to a single quiet line: still there, no longer asking for attention. */
function DoneRow({ todo }: { todo: Todo }) {
  const titleId = useId()
  return (
    <li
      style={{ viewTransitionName: `todo-${todo.id}` }}
      className='flex items-center gap-3 rounded-xl px-3 py-1.5 text-muted-foreground'
    >
      <DoneCheck todo={todo} labelledBy={titleId} className='size-4' />
      <span
        id={titleId}
        className='min-w-0 flex-1 truncate text-sm line-through decoration-muted-foreground/50'
        title={todo.title}
      >
        {todo.title}
      </span>
      <CategoryDot categoryId={todo.categoryId} className='hidden sm:inline-flex' />
    </li>
  )
}

function Tray({
  bucketId,
  onBucketChange,
  showHeading,
}: {
  bucketId: TrayBucket
  onBucketChange: (id: TrayBucket) => void
  showHeading: boolean
}) {
  const { todosIn } = useBoard()
  const todos = todosIn(bucketId)
  const { ref, isDropTarget } = useBucketList(bucketId)

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='px-2 pt-2'>
        {showHeading ? <h2 className='text-sm font-semibold'>Pull into today</h2> : null}
        <p className='text-xs text-muted-foreground'>Tap the arrow, or drag a todo across.</p>
      </div>
      <Tabs value={bucketId} onValueChange={(value) => onBucketChange(value as TrayBucket)}>
        <TabsList className='w-full'>
          {TRAY_BUCKETS.map((id) => (
            <TabsTrigger key={id} value={id} className='gap-1'>
              {BUCKET_META[id].short}
              <span className='text-xs tabular-nums opacity-60'>{todosIn(id).filter((t) => !t.done).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className='px-2 text-xs text-muted-foreground'>{periodLabel(bucketId)}</p>
      <ol
        ref={ref}
        key={bucketId}
        aria-label={`${BUCKET_META[bucketId].name} todos`}
        className={cn(
          'flex min-h-16 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-y-contain rounded-2xl p-0.5 transition-[background-color] duration-150',
          isDropTarget && 'bg-primary/10',
        )}
      >
        {todos.map((todo, index) => (
          <TrayRow key={todo.id} todo={todo} bucketId={bucketId} index={index} />
        ))}
        {todos.length === 0 ? (
          <li className='px-3 py-6 text-center text-sm text-muted-foreground'>Nothing waiting here.</li>
        ) : null}
      </ol>
      <QuickAdd
        bucketId={bucketId}
        placeholder={`Add to ${BUCKET_META[bucketId].name.toLowerCase()}`}
        inputClassName='h-10 rounded-xl bg-card'
      />
    </div>
  )
}

function TrayRow({ todo, bucketId, index }: { todo: Todo; bucketId: BucketId; index: number }) {
  const { ref, isDragging } = useTodoSortable(todo.id, bucketId, index)
  const { moveTo } = useBoard()
  const titleId = useId()
  return (
    <li
      ref={ref}
      role='listitem'
      style={{ viewTransitionName: `todo-${todo.id}` }}
      className={cn(
        'flex touch-manipulation items-center gap-2.5 rounded-xl bg-card py-2 ps-3 pe-1.5 select-none dark:bg-secondary',
        todo.done && 'bg-card/50',
        isDragging && 'z-10 shadow-[0_16px_36px_-10px_rgb(0_0_0/0.35)]',
      )}
    >
      <DoneCheck todo={todo} labelledBy={titleId} className='size-4' />
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span
          id={titleId}
          className={cn('text-sm leading-[1.4] font-medium', todo.done && 'text-muted-foreground line-through')}
        >
          {todo.title}
        </span>
        {!todo.done && (todo.categoryId || todo.tags.length > 0) ? (
          <span className='flex flex-wrap items-center gap-x-2 gap-y-0.5'>
            <CategoryDot categoryId={todo.categoryId} className='text-muted-foreground' />
            <Tags tags={todo.tags} />
          </span>
        ) : null}
      </div>
      {!todo.done ? (
        <Button
          variant='ghost'
          size='icon'
          aria-label={`Move ${todo.title} to today`}
          onClick={() => withViewTransition(() => moveTo(todo.id, 'today', 'start'))}
          className='shrink-0 text-primary hover:bg-primary/10 hover:text-primary enabled:active:scale-[0.96]'
        >
          <ArrowUpLeft />
        </Button>
      ) : null}
      <TodoMenu todo={todo} className='shrink-0' />
    </li>
  )
}

/** Non-modal bottom sheet: Today stays visible above it, so todos can be dragged straight up. */
function PhoneTray({
  open,
  onOpenChange,
  bucketId,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bucketId: TrayBucket
  children: React.ReactNode
}) {
  const { todosIn } = useBoard()
  const waiting = todosIn(bucketId).filter((t) => !t.done).length
  const panelId = useId()

  return (
    <motion.aside
      aria-label='Pull into today'
      initial={false}
      animate={{ height: open ? '62dvh' : 'auto' }}
      transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      className='fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[1.75rem] border-t border-border bg-muted pb-[calc(4.25rem+env(safe-area-inset-bottom))]'
    >
      <button
        type='button'
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className='flex shrink-0 flex-col items-center gap-1.5 px-5 pt-2 pb-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset'
      >
        <span aria-hidden className='h-1 w-9 rounded-full bg-foreground/20' />
        <span className='flex w-full items-center gap-2 text-sm font-semibold'>
          <span className='flex-1 text-start'>
            {open ? 'Pull into today' : `Pull from ${BUCKET_META[bucketId].name.toLowerCase()}`}
            {!open ? <span className='font-normal text-muted-foreground tabular-nums'> · {waiting}</span> : null}
          </span>
          {open ? <ChevronDown aria-hidden className='size-4' /> : <ChevronUp aria-hidden className='size-4' />}
        </span>
      </button>
      <div id={panelId} hidden={!open} className='flex min-h-0 flex-1 flex-col px-2'>
        {open ? children : null}
      </div>
    </motion.aside>
  )
}
