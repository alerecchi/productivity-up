// PROTOTYPE (throwaway): variant B, "Horizon ladder".
// Phone: one vertical list, nearest Bucket first, with a jump bar. Every todo steps one horizon Sooner or Later,
// or jumps anywhere through Move to. Desktop: the kanban with the same step buttons.
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ellipsis, GripVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import CreateTodoButton from '@/features/board/components/create-todo-button'
import {
  TodoCheck,
  useBucketDroppable,
  useIsDesktop,
  useMoveToBucket,
  useTodoDraggable,
} from '@/features/board/prototype/board-prototype-shared'
import type { BucketView, VariantProps } from '@/features/board/prototype/board-prototype-shared'
import { Button } from '@/features/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/features/shared/components/ui/dropdown-menu'
import { cn } from '@/features/shared/utils/tailwind'
import type { Todo } from '@/lib/types/Todo'

export const name = 'Horizon ladder'

export function VariantB({ bucketViews, onEdit }: VariantProps) {
  const isDesktop = useIsDesktop()

  if (isDesktop) {
    return (
      <div className='flex h-full min-h-0 gap-4 overflow-x-auto px-6 py-4'>
        {bucketViews.map((view, index) => (
          <LadderColumn key={view.bucket.id} bucketViews={bucketViews} index={index} view={view} onEdit={onEdit} />
        ))}
      </div>
    )
  }

  return <MobileLadder bucketViews={bucketViews} onEdit={onEdit} />
}

function MobileLadder({ bucketViews, onEdit }: VariantProps) {
  // Nearest first on the phone: Today at the top, Inbox at the bottom.
  const nearestFirst = bucketViews.toReversed()
  const [currentId, setCurrentId] = useState(nearestFirst[0].bucket.id)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b))
          setCurrentId(Number((top.target as HTMLElement).dataset.ladderBucket))
        }
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    )
    root.querySelectorAll('[data-ladder-bucket]').forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const jumpTo = (bucketId: number) => {
    setCurrentId(bucketId)
    const section = scrollRef.current?.querySelector<HTMLElement>(`[data-ladder-bucket="${bucketId}"]`)
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <nav aria-label='Jump to a Bucket' className='shrink-0 border-b bg-card'>
        <ul className='flex gap-2 overflow-x-auto px-4 py-2'>
          {nearestFirst.map((view) => (
            <li key={view.bucket.id}>
              <JumpChip isCurrent={view.bucket.id === currentId} view={view} onJump={() => jumpTo(view.bucket.id)} />
            </li>
          ))}
        </ul>
      </nav>
      <div ref={scrollRef} className='min-h-0 flex-1 overflow-y-auto pb-24'>
        {nearestFirst.map((view) => {
          const index = bucketViews.indexOf(view)
          const headingId = `ladder-${view.bucket.id}-heading`

          return (
            <section key={view.bucket.id} aria-labelledby={headingId} data-ladder-bucket={view.bucket.id}>
              <header className='sticky top-0 z-10 flex items-center gap-2 bg-background/95 px-4 py-2 backdrop-blur-sm'>
                <view.icon aria-hidden className='size-5 text-primary' />
                <h2 className='min-w-0 flex-1 outline-none' id={headingId} tabIndex={-1}>
                  <span className='font-bold'>{view.name}</span>{' '}
                  <span className='text-sm font-normal text-muted-foreground'>{view.periodLabel}</span>
                </h2>
                <span className='text-sm font-semibold text-muted-foreground tabular-nums'>{view.todos.length}</span>
                <CreateTodoButton bucketId={view.bucket.id} buckets={bucketViews.map(({ bucket }) => bucket)} />
              </header>
              <ul className='flex flex-col gap-2 px-4 pt-1 pb-4'>
                {view.todos.length === 0 && (
                  <li className='rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground'>
                    Nothing in {view.name.toLowerCase()} yet.
                  </li>
                )}
                {view.todos.map((todo) => (
                  <li key={todo.id}>
                    <LadderCard bucketViews={bucketViews} index={index} layout='vertical' todo={todo} onEdit={onEdit} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function JumpChip({ isCurrent, onJump, view }: { isCurrent: boolean; onJump: () => void; view: BucketView }) {
  const { isDropTarget, ref } = useBucketDroppable(`ladder-chip-${view.bucket.id}`, view.bucket.id)

  return (
    <button
      ref={ref}
      aria-current={isCurrent ? 'location' : undefined}
      className={cn(
        'flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        isCurrent ? 'border-primary bg-primary text-primary-foreground' : 'bg-background',
        isDropTarget && 'ring-[3px] ring-primary',
      )}
      type='button'
      onClick={onJump}
    >
      {view.name}
      <span className='tabular-nums opacity-80'>{view.todos.length}</span>
    </button>
  )
}

function LadderColumn({
  bucketViews,
  index,
  onEdit,
  view,
}: {
  bucketViews: Array<BucketView>
  index: number
  onEdit: (todo: Todo) => void
  view: BucketView
}) {
  const { isDropTarget, ref } = useBucketDroppable(`ladder-column-${view.bucket.id}`, view.bucket.id)
  const headingId = `ladder-column-${view.bucket.id}-heading`

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        'flex min-h-0 w-72 shrink-0 flex-col gap-2 border-r pr-4 last:border-r-0 lg:w-auto lg:flex-1',
        view.isPlanningBucket && 'bg-primary/5',
        isDropTarget && 'rounded-xl ring-2 ring-primary',
      )}
    >
      <header className='flex items-center gap-2 py-1'>
        <view.icon aria-hidden className='size-5 text-primary' />
        <h2 className='min-w-0 flex-1' id={headingId}>
          <span className='block font-bold'>{view.name}</span>
          <span className='block text-xs text-muted-foreground'>{view.periodLabel}</span>
        </h2>
        <span className='text-sm font-semibold text-muted-foreground tabular-nums'>{view.todos.length}</span>
        <CreateTodoButton bucketId={view.bucket.id} buckets={bucketViews.map(({ bucket }) => bucket)} />
      </header>
      <ul className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'>
        {view.todos.map((todo) => (
          <li key={todo.id}>
            <LadderCard bucketViews={bucketViews} index={index} layout='horizontal' todo={todo} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function LadderCard({
  bucketViews,
  index,
  layout,
  onEdit,
  todo,
}: {
  bucketViews: Array<BucketView>
  index: number
  /** Which way "sooner" points: down a vertical list, or right across the kanban. */
  layout: 'horizontal' | 'vertical'
  onEdit: (todo: Todo) => void
  todo: Todo
}) {
  const moveToBucket = useMoveToBucket()
  const { handleRef, isDragging, ref } = useTodoDraggable(todo)
  const sooner = bucketViews.at(index + 1)
  const later = index > 0 ? bucketViews.at(index - 1) : undefined
  const SoonerIcon = layout === 'vertical' ? ArrowUp : ArrowRight
  const LaterIcon = layout === 'vertical' ? ArrowDown : ArrowLeft

  return (
    <div
      ref={ref}
      className={cn('rounded-xl border bg-card p-1 shadow-xs', isDragging && 'opacity-60')}
      data-completed={todo.completed}
    >
      <div className='flex items-start gap-1'>
        <TodoCheck todo={todo} />
        <button
          className={cn(
            'min-h-11 min-w-0 flex-1 rounded-md py-2.5 text-left text-[0.95rem] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            todo.completed && 'text-muted-foreground line-through',
          )}
          type='button'
          onClick={() => onEdit(todo)}
        >
          {todo.title}
        </button>
        <Button
          ref={handleRef}
          aria-label={`Drag “${todo.title}”`}
          className='size-11 cursor-grab touch-none text-muted-foreground'
          size='icon'
          variant='ghost'
        >
          <GripVertical />
        </Button>
      </div>
      <div className='flex flex-wrap items-center gap-1 pl-11'>
        {sooner && (
          <Button className='h-11' size='sm' variant='secondary' onClick={() => moveToBucket(todo, sooner)}>
            <SoonerIcon />
            {sooner.name}
          </Button>
        )}
        {later && (
          <Button className='h-11' size='sm' variant='ghost' onClick={() => moveToBucket(todo, later)}>
            <LaterIcon />
            {later.name}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label={`Move “${todo.title}” to…`} className='ml-auto size-11' size='icon' variant='ghost' />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {bucketViews.map((view) => (
                <DropdownMenuItem
                  key={view.bucket.id}
                  className='min-h-11'
                  disabled={view.bucket.id === todo.bucketId}
                  onClick={() => moveToBucket(todo, view)}
                >
                  <view.icon />
                  {view.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
