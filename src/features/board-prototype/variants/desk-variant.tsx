// PROTOTYPE variant "Triage desk": a planning session tool. "Later" (Inbox, Year, Month) sits on the left,
// "Soon" (Week, Today) on the right. Todos travel by keyboard (← later, → closer, T/W/M/Y/I), by swiping
// on touch, by nudge buttons, or by dragging the grip. Dense rows, built for clearing a backlog fast.
import { ChevronLeft, ChevronRight, Eye, EyeOff, GripVertical } from 'lucide-react'
import { motion, useDragControls } from 'motion/react'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

import { Button } from '@/features/shared/components/ui/button'
import { Kbd } from '@/features/shared/components/ui/kbd'
import { Tabs, TabsList, TabsTrigger } from '@/features/shared/components/ui/tabs'
import { cn } from '@/features/shared/utils/tailwind'

import { useBoard, useBucketList, useTodoSortable, withViewTransition } from '../prototype-board'
import { BUCKETS_BY_URGENCY, BUCKET_META, periodLabel, plural } from '../prototype-data'
import type { BoardState, BucketId, Todo } from '../prototype-data'
import { CategoryDot, DayCompleteMoment, DoneCheck, QuickAdd, Tags, TodoMenu, useMediaQuery } from '../prototype-parts'

type LaterBucket = 'inbox' | 'year' | 'month'
const LATER: Array<LaterBucket> = ['inbox', 'year', 'month']
const KEY_TO_BUCKET: Record<string, BucketId> = { t: 'today', w: 'week', m: 'month', y: 'year', i: 'inbox' }

function closer(bucketId: BucketId) {
  const i = BUCKETS_BY_URGENCY.indexOf(bucketId)
  return i > 0 ? BUCKETS_BY_URGENCY[i - 1] : null
}
function later(bucketId: BucketId) {
  const i = BUCKETS_BY_URGENCY.indexOf(bucketId)
  return i < BUCKETS_BY_URGENCY.length - 1 ? BUCKETS_BY_URGENCY[i + 1] : null
}

type LastMove = { title: string; to: BucketId; before: BoardState['order'] }

export function DeskVariant() {
  const desktop = useMediaQuery('(min-width: 56rem)')
  const [dayOpen, setDayOpen] = useState(false)
  const [laterTab, setLaterTab] = useState<LaterBucket>('inbox')
  const [phonePane, setPhonePane] = useState<'soon' | 'later'>('later')
  const [hideDone, setHideDone] = useState(false)
  const [lastMove, setLastMove] = useState<LastMove | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const { state, moveTo, setOrder, bucketOf } = useBoard()
  const deskRef = useRef<HTMLDivElement>(null)

  const send = (todo: Todo, to: BucketId | null) => {
    if (!to || to === bucketOf(todo.id)) return
    const rows = Array.from(deskRef.current?.querySelectorAll<HTMLElement>('[data-desk-row]') ?? [])
    const at = rows.findIndex((row) => row.dataset.deskRow === todo.id)
    const fallback = rows[at + 1]?.dataset.deskRow ?? rows[at - 1]?.dataset.deskRow
    setLastMove({ title: todo.title, to, before: state.order })
    withViewTransition(() => moveTo(todo.id, to, to === 'today' || to === 'week' ? 'end' : 'start'))
    // Keep the keyboard where it was: on the moved todo if it is still visible, else on its neighbour.
    requestAnimationFrame(() => {
      const moved = deskRef.current?.querySelector<HTMLElement>(`[data-desk-row="${todo.id}"]`)
      const next = moved ?? deskRef.current?.querySelector<HTMLElement>(`[data-desk-row="${fallback}"]`)
      if (document.activeElement === document.body || document.activeElement?.closest('[data-desk-row]') == null) {
        next?.focus()
        setFocusedId(next?.dataset.deskRow ?? null)
      }
    })
  }

  const ctx: RowContext = { send, focusedId, setFocusedId, hideDone, deskRef }

  return (
    <main className='flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background'>
      <div
        ref={deskRef}
        data-own-arrow-keys
        className={cn('flex min-h-0 flex-1 flex-col', desktop && 'h-[calc(100dvh-3.5rem)]')}
      >
        <Toolbar
          desktop={desktop}
          hideDone={hideDone}
          onHideDone={() => setHideDone((h) => !h)}
          onCompleteDay={() => setDayOpen(true)}
          lastMove={lastMove}
          onUndo={() => {
            if (!lastMove) return
            withViewTransition(() => setOrder(lastMove.before))
            setLastMove(null)
          }}
        />
        {desktop ? (
          <div className='grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3 px-4 pb-20'>
            <LaterPane tab={laterTab} onTab={setLaterTab} ctx={ctx} />
            <SoonPane ctx={ctx} />
          </div>
        ) : (
          <Tabs
            value={phonePane}
            onValueChange={(value) => setPhonePane(value as 'soon' | 'later')}
            className='flex min-h-0 flex-1 flex-col gap-3 px-3 pb-24'
          >
            <TabsList className='w-full'>
              <TabsTrigger value='later'>Later</TabsTrigger>
              <TabsTrigger value='soon'>Soon</TabsTrigger>
            </TabsList>
            <p className='px-1 text-xs text-muted-foreground'>
              Swipe a todo right to bring it closer, left to push it later.
            </p>
            {phonePane === 'later' ? (
              <LaterPane tab={laterTab} onTab={setLaterTab} ctx={ctx} />
            ) : (
              <SoonPane ctx={ctx} onCompleteDay={() => setDayOpen(true)} />
            )}
          </Tabs>
        )}
      </div>
      <DayCompleteMoment open={dayOpen} onOpenChange={setDayOpen} />
    </main>
  )
}

type RowContext = {
  send: (todo: Todo, to: BucketId | null) => void
  focusedId: string | null
  setFocusedId: (id: string | null) => void
  hideDone: boolean
  deskRef: React.RefObject<HTMLDivElement | null>
}

function Toolbar({
  desktop,
  hideDone,
  onHideDone,
  onCompleteDay,
  lastMove,
  onUndo,
}: {
  desktop: boolean
  hideDone: boolean
  onHideDone: () => void
  onCompleteDay: () => void
  lastMove: LastMove | null
  onUndo: () => void
}) {
  return (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3'>
      <h1 className='text-lg font-bold tracking-[-0.01em]'>Plan</h1>
      {desktop ? (
        <p className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> pick
          </span>
          <span>
            <Kbd>←</Kbd> later <Kbd>→</Kbd> closer
          </span>
          <span>
            <Kbd>T</Kbd> <Kbd>W</Kbd> <Kbd>M</Kbd> <Kbd>Y</Kbd> <Kbd>I</Kbd> send
          </span>
          <span>
            <Kbd>X</Kbd> done
          </span>
          <span>
            <Kbd>⌥</Kbd>
            <Kbd>↑↓</Kbd> reorder
          </span>
        </p>
      ) : null}
      <div className='ms-auto flex items-center gap-2'>
        <p role='status' className='flex items-center gap-1 text-sm text-muted-foreground'>
          {lastMove ? (
            <>
              <span className='max-w-56 truncate'>Sent to {BUCKET_META[lastMove.to].name.toLowerCase()}</span>
              <Button variant='link' size='sm' onClick={onUndo} className='px-1'>
                Undo
              </Button>
            </>
          ) : null}
        </p>
        <Button variant='ghost' size='sm' onClick={onHideDone} aria-pressed={hideDone}>
          {hideDone ? <Eye /> : <EyeOff />}
          {hideDone ? 'Show done' : 'Hide done'}
        </Button>
        {desktop ? (
          <Button size='sm' onClick={onCompleteDay} className='font-semibold enabled:active:scale-[0.96]'>
            Complete the day
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function LaterPane({ tab, onTab, ctx }: { tab: LaterBucket; onTab: (tab: LaterBucket) => void; ctx: RowContext }) {
  const { todosIn } = useBoard()
  return (
    <section aria-label='Later' className='flex min-h-0 flex-col gap-2 rounded-2xl bg-muted p-2'>
      <Tabs value={tab} onValueChange={(value) => onTab(value as LaterBucket)}>
        <TabsList className='w-full bg-background/60'>
          {LATER.map((id) => (
            <TabsTrigger key={id} value={id} className='gap-1'>
              {BUCKET_META[id].short}
              <span className='text-xs tabular-nums opacity-60'>{todosIn(id).filter((t) => !t.done).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DeskList key={tab} bucketId={tab} ctx={ctx} size='sm' className='flex-1' />
    </section>
  )
}

function SoonPane({ ctx, onCompleteDay }: { ctx: RowContext; onCompleteDay?: () => void }) {
  return (
    <div className='flex min-h-0 flex-col gap-3'>
      <section aria-labelledby='desk-today' className='flex min-h-0 flex-[1.4] flex-col rounded-2xl bg-accent p-2'>
        <PaneHeading id='desk-today' bucketId='today' big />
        <DeskList bucketId='today' ctx={ctx} size='lg' className='flex-1' />
        {onCompleteDay ? (
          <Button onClick={onCompleteDay} className='mt-2 font-semibold enabled:active:scale-[0.96]'>
            Complete the day
          </Button>
        ) : null}
      </section>
      <section aria-labelledby='desk-week' className='flex min-h-0 flex-1 flex-col rounded-2xl bg-muted p-2'>
        <PaneHeading id='desk-week' bucketId='week' />
        <DeskList bucketId='week' ctx={ctx} size='sm' className='flex-1' />
      </section>
    </div>
  )
}

function PaneHeading({ id, bucketId, big }: { id: string; bucketId: BucketId; big?: boolean }) {
  const { todosIn } = useBoard()
  const open = todosIn(bucketId).filter((t) => !t.done).length
  return (
    <header className='flex items-baseline gap-2 px-2 pt-1 pb-2'>
      <h2 id={id} className={cn('font-bold tracking-[-0.01em]', big ? 'text-2xl' : 'text-base')}>
        {BUCKET_META[bucketId].name}
      </h2>
      <span className='text-xs text-muted-foreground'>{periodLabel(bucketId)}</span>
      <span className='ms-auto text-xs text-muted-foreground tabular-nums'>{plural(open, '# open', '# open')}</span>
    </header>
  )
}

function DeskList({
  bucketId,
  ctx,
  size,
  className,
}: {
  bucketId: BucketId
  ctx: RowContext
  size: 'sm' | 'lg'
  className?: string
}) {
  const { todosIn, draggingId } = useBoard()
  const todos = todosIn(bucketId)
  const { ref, isDropTarget } = useBucketList(bucketId)

  return (
    <div className={cn('flex min-h-0 flex-col gap-1', className)}>
      <ol
        ref={ref}
        aria-label={`${BUCKET_META[bucketId].name} todos`}
        className={cn(
          'flex min-h-14 flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain rounded-xl p-0.5 transition-[background-color] duration-150',
          isDropTarget && draggingId && 'bg-primary/10',
        )}
      >
        {todos.map((todo, index) =>
          ctx.hideDone && todo.done ? null : (
            <DeskRow key={todo.id} todo={todo} bucketId={bucketId} index={index} ctx={ctx} size={size} />
          ),
        )}
        {todos.length === 0 ? (
          <li className='px-3 py-4 text-sm text-muted-foreground'>
            {bucketId === 'today' ? 'Today’s clear! Grab something from this week.' : 'All clear here.'}
          </li>
        ) : null}
      </ol>
      <QuickAdd
        bucketId={bucketId}
        placeholder={`Add to ${BUCKET_META[bucketId].name.toLowerCase()}`}
        inputClassName='h-9 rounded-lg hover:bg-background/60 focus:bg-background'
      />
    </div>
  )
}

const SWIPE_THRESHOLD = 88

function DeskRow({
  todo,
  bucketId,
  index,
  ctx,
  size,
}: {
  todo: Todo
  bucketId: BucketId
  index: number
  ctx: RowContext
  size: 'sm' | 'lg'
}) {
  const { ref, handleRef, isDragging } = useTodoSortable(todo.id, bucketId, index)
  const { toggleDone, shift } = useBoard()
  const dragControls = useDragControls()
  const [swipe, setSwipe] = useState<'closer' | 'later' | null>(null)
  const [swiping, setSwiping] = useState(false)
  const titleId = useId()
  const toCloser = closer(bucketId)
  const toLater = later(bucketId)
  const isFocusTarget = ctx.focusedId ? ctx.focusedId === todo.id : false

  const focusSibling = (delta: 1 | -1) => {
    const rows = Array.from(ctx.deskRef.current?.querySelectorAll<HTMLElement>('[data-desk-row]') ?? [])
    const i = rows.findIndex((row) => row.dataset.deskRow === todo.id)
    const next = rows.at(i + delta)
    if (next && i + delta >= 0) {
      next.focus()
      ctx.setFocusedId(next.dataset.deskRow ?? null)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey) return
    const key = event.key.toLowerCase()
    if (event.altKey && (key === 'arrowup' || key === 'arrowdown')) {
      event.preventDefault()
      withViewTransition(() => shift(todo.id, key === 'arrowup' ? -1 : 1))
      requestAnimationFrame(() =>
        ctx.deskRef.current?.querySelector<HTMLElement>(`[data-desk-row="${todo.id}"]`)?.focus(),
      )
    } else if (key === 'arrowdown' || key === 'j') {
      event.preventDefault()
      focusSibling(1)
    } else if (key === 'arrowup' || key === 'k') {
      event.preventDefault()
      focusSibling(-1)
    } else if (key === 'arrowright') {
      event.preventDefault()
      ctx.send(todo, toCloser)
    } else if (key === 'arrowleft') {
      event.preventDefault()
      ctx.send(todo, toLater)
    } else if (key in KEY_TO_BUCKET) {
      event.preventDefault()
      ctx.send(todo, KEY_TO_BUCKET[key])
    } else if (key === 'x' || key === ' ') {
      event.preventDefault()
      toggleDone(todo.id)
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return
    if ((event.target as Element).closest('button, input, [data-drag-handle]')) return
    dragControls.start(event)
  }

  return (
    <li
      ref={ref}
      data-desk-row={todo.id}
      tabIndex={isFocusTarget || (!ctx.focusedId && index === 0) ? 0 : -1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) ctx.setFocusedId(todo.id)
      }}
      onKeyDown={onKeyDown}
      aria-labelledby={titleId}
      style={{ viewTransitionName: `todo-${todo.id}` }}
      className={cn(
        'group/row relative overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging && 'z-10 shadow-[0_16px_36px_-10px_rgb(0_0_0/0.35)]',
      )}
    >
      {/* Revealed behind the row while swiping on touch. */}
      <div aria-hidden className='absolute inset-0 flex items-center justify-between px-4 text-sm font-semibold'>
        <span
          className={cn(
            'text-primary transition-opacity duration-150',
            swipe === 'closer' ? 'opacity-100' : swiping ? 'opacity-40' : 'opacity-0',
          )}
        >
          {toCloser ? `→ ${BUCKET_META[toCloser].name}` : ''}
        </span>
        <span
          className={cn(
            'text-muted-foreground transition-opacity duration-150',
            swipe === 'later' ? 'opacity-100' : swiping ? 'opacity-40' : 'opacity-0',
          )}
        >
          {toLater ? `${BUCKET_META[toLater].name} ←` : ''}
        </span>
      </div>
      <motion.div
        drag='x'
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onPointerDown={onPointerDown}
        onDragStart={() => setSwiping(true)}
        onDrag={(_, info) =>
          setSwipe(info.offset.x > SWIPE_THRESHOLD ? 'closer' : info.offset.x < -SWIPE_THRESHOLD ? 'later' : null)
        }
        onDragEnd={(_, info) => {
          setSwipe(null)
          setSwiping(false)
          if (info.offset.x > SWIPE_THRESHOLD) ctx.send(todo, toCloser)
          else if (info.offset.x < -SWIPE_THRESHOLD) ctx.send(todo, toLater)
        }}
        style={{ touchAction: 'pan-y' }}
        className={cn(
          'relative flex items-center gap-2.5 bg-card pe-1 select-none dark:bg-secondary',
          size === 'lg' ? 'min-h-12 py-2 ps-1' : 'min-h-10 py-1.5 ps-1',
        )}
      >
        <button
          ref={handleRef}
          type='button'
          data-drag-handle
          tabIndex={-1}
          aria-label={`Drag ${todo.title}`}
          className='flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 transition-opacity duration-150 active:cursor-grabbing pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-visible/row:opacity-100'
        >
          <GripVertical className='size-4' />
        </button>
        <DoneCheck todo={todo} labelledBy={titleId} className={size === 'lg' ? 'size-5' : 'size-4'} />
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 transition-opacity duration-150',
            todo.done && 'opacity-55',
          )}
        >
          <span
            id={titleId}
            className={cn(
              'line-clamp-2 leading-[1.4]',
              size === 'lg' ? 'text-[0.9375rem] font-semibold' : 'text-sm font-medium',
              todo.done && 'line-through',
            )}
            title={todo.title}
          >
            {todo.title}
          </span>
          <span className='flex flex-wrap items-baseline gap-x-2 text-muted-foreground'>
            <CategoryDot categoryId={todo.categoryId} />
            <Tags tags={todo.tags} />
          </span>
        </div>
        <span className='flex shrink-0 items-center transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-hover/row:opacity-100'>
          {toLater ? (
            <Button
              variant='ghost'
              size='icon-sm'
              tabIndex={-1}
              aria-label={`Move ${todo.title} to ${BUCKET_META[toLater].name.toLowerCase()}`}
              onClick={() => ctx.send(todo, toLater)}
              className='hidden text-muted-foreground pointer-fine:inline-flex'
            >
              <ChevronLeft />
            </Button>
          ) : null}
          {toCloser ? (
            <Button
              variant='ghost'
              size='icon-sm'
              tabIndex={-1}
              aria-label={`Move ${todo.title} to ${BUCKET_META[toCloser].name.toLowerCase()}`}
              onClick={() => ctx.send(todo, toCloser)}
              className='hidden text-primary hover:text-primary pointer-fine:inline-flex'
            >
              <ChevronRight />
            </Button>
          ) : null}
          <TodoMenu todo={todo} />
        </span>
      </motion.div>
    </li>
  )
}
