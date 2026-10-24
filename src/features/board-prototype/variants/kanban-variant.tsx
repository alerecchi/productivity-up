// PROTOTYPE variant "Kanban": the classic board. Five columns side by side on desktop, one column per tab on
// phones. Today leads on the left and carries the accent; each broader column is a step quieter.
import { GripVertical, Plus } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/features/shared/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/features/shared/components/ui/tabs'
import { cn } from '@/features/shared/utils/tailwind'

import { useBoard, useBucketDropTarget, useBucketList, useTodoSortable } from '../prototype-board'
import { BUCKETS_BY_URGENCY, BUCKET_META, CATEGORIES, periodLabel, plural } from '../prototype-data'
import type { BucketId, Todo } from '../prototype-data'
import {
  CategoryChip,
  DayCompleteMoment,
  DoneCheck,
  QuickAdd,
  Tags,
  TodoMenu,
  useMediaQuery,
  useTodayStats,
} from '../prototype-parts'

// Each broader column is a step quieter: smaller name, softer surface, muted count.
const COLUMN: Record<BucketId, { surface: string; name: string; count: string; width: string }> = {
  today: {
    surface: 'bg-accent',
    name: 'text-2xl font-extrabold tracking-[-0.02em]',
    count: 'text-3xl font-extrabold text-primary',
    width: 'w-80',
  },
  week: {
    surface: 'bg-muted',
    name: 'text-xl font-bold tracking-[-0.01em]',
    count: 'text-2xl font-bold text-foreground',
    width: 'w-72',
  },
  month: {
    surface: 'bg-muted/70',
    name: 'text-lg font-semibold',
    count: 'text-xl font-semibold text-foreground/80',
    width: 'w-72',
  },
  year: {
    surface: 'bg-muted/45',
    name: 'text-base font-semibold text-muted-foreground',
    count: 'text-lg font-semibold text-muted-foreground',
    width: 'w-72',
  },
  inbox: {
    surface: 'border border-dashed border-border',
    name: 'text-base font-medium text-muted-foreground',
    count: 'text-lg font-medium text-muted-foreground',
    width: 'w-72',
  },
}

export function KanbanVariant() {
  const desktop = useMediaQuery('(min-width: 48rem)')
  const [dayOpen, setDayOpen] = useState(false)
  const openDay = () => setDayOpen(true)

  return (
    <main className='flex h-[calc(100dvh-3.5rem)] flex-col bg-background'>
      {desktop ? <DesktopBoard onCompleteDay={openDay} /> : <PhoneBoard onCompleteDay={openDay} />}
      <DayCompleteMoment open={dayOpen} onOpenChange={setDayOpen} />
    </main>
  )
}

function DesktopBoard({ onCompleteDay }: { onCompleteDay: () => void }) {
  return (
    <div className='relative flex min-h-0 flex-1 gap-3 overflow-x-auto overscroll-x-contain p-4 pb-20'>
      {BUCKETS_BY_URGENCY.map((bucketId) => (
        <Column key={bucketId} bucketId={bucketId} onCompleteDay={onCompleteDay} />
      ))}
    </div>
  )
}

function PhoneBoard({ onCompleteDay }: { onCompleteDay: () => void }) {
  const [tab, setTab] = useState<BucketId>('today')
  const { todosIn, draggingId } = useBoard()

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as BucketId)} className='flex min-h-0 flex-1 flex-col'>
      <div className='overflow-x-auto px-3 pt-3'>
        <TabsList className='h-11 w-full min-w-max justify-start gap-1 p-1'>
          {BUCKETS_BY_URGENCY.map((bucketId) => (
            <DroppableTab
              key={bucketId}
              bucketId={bucketId}
              count={todosIn(bucketId).filter((t) => !t.done).length}
              dragging={draggingId !== null && tab !== bucketId}
            />
          ))}
        </TabsList>
      </div>
      <p className='sr-only' aria-live='polite'>
        {draggingId ? 'Drop on a tab to move the todo to that bucket.' : ''}
      </p>
      <div className='flex min-h-0 flex-1 p-3 pb-20'>
        <Column key={tab} bucketId={tab} onCompleteDay={onCompleteDay} fill />
      </div>
    </Tabs>
  )
}

function DroppableTab({ bucketId, count, dragging }: { bucketId: BucketId; count: number; dragging: boolean }) {
  const { ref, isDropTarget } = useBucketDropTarget(bucketId)
  return (
    <TabsTrigger
      ref={ref}
      value={bucketId}
      className={cn(
        'h-9 flex-none gap-1.5 px-3 transition-[background-color,box-shadow] duration-150',
        bucketId === 'today' && 'font-semibold',
        dragging && 'ring-dashed ring-1 ring-primary/40',
        isDropTarget && 'bg-primary text-primary-foreground ring-2 ring-primary',
      )}
    >
      {BUCKET_META[bucketId].short}
      <span className='text-xs tabular-nums opacity-70'>{count}</span>
    </TabsTrigger>
  )
}

function Column({ bucketId, onCompleteDay, fill }: { bucketId: BucketId; onCompleteDay: () => void; fill?: boolean }) {
  const { todosIn, draggingId } = useBoard()
  const todos = todosIn(bucketId)
  const { ref, isDropTarget } = useBucketList(bucketId)
  const [adding, setAdding] = useState(false)
  const meta = COLUMN[bucketId]
  const headingId = useId()
  const isToday = bucketId === 'today'
  const openCount = todos.filter((t) => !t.done).length

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex max-h-full min-h-0 shrink-0 flex-col rounded-2xl p-2',
        fill ? 'w-full' : meta.width,
        meta.surface,
      )}
    >
      <header className='flex flex-col gap-2 px-2 pt-1.5 pb-3'>
        <div className='flex items-end gap-3'>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase'>
              {periodLabel(bucketId)}
            </p>
            <h2 id={headingId} className={cn('leading-[1.2]', meta.name)}>
              {BUCKET_META[bucketId].name}
            </h2>
          </div>
          <p className={cn('leading-none tabular-nums', meta.count)}>
            {openCount}
            <span className='sr-only'> {plural(openCount, 'open todo', 'open todos')}</span>
          </p>
        </div>
        <LoadPips todos={todos} />
      </header>

      <ol
        ref={ref}
        aria-label={`${BUCKET_META[bucketId].name} todos`}
        className={cn(
          'flex min-h-20 flex-1 flex-col gap-2 overflow-y-auto overscroll-y-contain rounded-xl p-0.5 transition-[background-color] duration-150',
          isDropTarget && draggingId && 'bg-primary/10',
        )}
      >
        {todos.map((todo, index) => (
          <KanbanCard key={todo.id} todo={todo} bucketId={bucketId} index={index} />
        ))}
        {todos.length === 0 ? (
          <li className='flex flex-1 items-center justify-center rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground'>
            {isToday ? 'Today’s clear! Grab something from this week.' : 'Drop todos here.'}
          </li>
        ) : null}
      </ol>

      <div className='flex flex-col gap-2 pt-2'>
        {adding ? (
          <QuickAdd
            bucketId={bucketId}
            autoFocus
            onDone={() => setAdding(false)}
            inputClassName='bg-card shadow-none ring-1 ring-ring/40'
          />
        ) : (
          <Button
            variant='ghost'
            onClick={() => setAdding(true)}
            className='justify-start text-muted-foreground enabled:active:scale-[0.96]'
          >
            <Plus /> Add a todo
          </Button>
        )}
        {isToday ? <CompleteDayButton onClick={onCompleteDay} /> : null}
      </div>
    </section>
  )
}

function CompleteDayButton({ onClick }: { onClick: () => void }) {
  const { allDone } = useTodayStats()
  return (
    <Button size='lg' onClick={onClick} className='h-10 font-semibold enabled:active:scale-[0.96]'>
      {allDone ? 'All done. Complete the day' : 'Complete the day'}
    </Button>
  )
}

function KanbanCard({ todo, bucketId, index }: { todo: Todo; bucketId: BucketId; index: number }) {
  const { ref, isDragging } = useTodoSortable(todo.id, bucketId, index)
  const titleId = useId()

  return (
    <li
      ref={ref}
      role='listitem'
      style={{ viewTransitionName: `todo-${todo.id}` }}
      className={cn(
        'group/card relative flex touch-manipulation flex-col gap-2 rounded-xl border p-3 select-none',
        todo.done
          ? 'border-dashed border-border bg-transparent'
          : 'border-transparent bg-card text-card-foreground dark:bg-secondary',
        isDragging && 'z-10 rotate-[1.5deg] shadow-[0_16px_36px_-10px_rgb(0_0_0/0.4)]',
      )}
    >
      <div className='flex items-start gap-2.5'>
        <span className='flex pt-px'>
          <DoneCheck todo={todo} labelledBy={titleId} />
        </span>
        <span
          id={titleId}
          className={cn(
            'min-w-0 flex-1 text-sm leading-[1.4] font-medium text-pretty',
            todo.done && 'text-muted-foreground line-through decoration-muted-foreground/60',
          )}
        >
          {todo.title}
        </span>
        <TodoMenu
          todo={todo}
          className='-me-1.5 -mt-1 size-7 opacity-100 transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:aria-expanded:opacity-100'
        />
      </div>
      {!todo.done && (todo.categoryId || todo.tags.length > 0) ? (
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1 ps-[1.875rem]'>
          <CategoryChip categoryId={todo.categoryId} />
          <Tags tags={todo.tags} />
        </div>
      ) : null}
      <GripVertical
        aria-hidden
        className='absolute end-1 bottom-1.5 size-3.5 text-muted-foreground/50 pointer-fine:hidden'
      />
    </li>
  )
}

/** One pip per todo in category colour; finished todos turn into hollow rings. Shows load and mix at a glance. */
function LoadPips({ todos }: { todos: Array<Todo> }) {
  if (todos.length === 0) return null
  const done = todos.filter((t) => t.done).length
  return (
    <div className='flex flex-wrap items-center gap-1'>
      <span className='sr-only'>{`${done} of ${todos.length} done`}</span>
      {todos.map((todo) => (
        <span
          key={todo.id}
          aria-hidden
          className={cn(
            'size-2 rounded-full transition-[background-color,box-shadow] duration-150',
            todo.done
              ? 'bg-transparent ring-1 ring-muted-foreground/50 ring-inset'
              : todo.categoryId
                ? CATEGORIES[todo.categoryId].dot
                : 'bg-muted-foreground/50',
          )}
        />
      ))}
    </div>
  )
}
