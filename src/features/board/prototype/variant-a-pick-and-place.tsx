// PROTOTYPE (throwaway): variant A, "Pick up and place".
// Tap Move on a todo to pick it up, then tap a Bucket to place it. Dragging onto a Bucket does the same.
import { ArrowRightLeft, GripVertical, X } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { cn } from '@/features/shared/utils/tailwind'
import type { Todo } from '@/lib/types/Todo'

export const name = 'Pick up and place'

export function VariantA({ bucketViews, onEdit }: VariantProps) {
  const isDesktop = useIsDesktop()
  const moveToBucket = useMoveToBucket()
  const [picked, setPicked] = useState<Todo | null>(null)
  const [activeBucketId, setActiveBucketId] = useState(
    () => bucketViews.find(({ bucket }) => bucket.type === 'daily')?.bucket.id ?? bucketViews[0].bucket.id,
  )

  useEffect(() => {
    if (!picked) return
    document.querySelector<HTMLElement>('[data-place-target]:not(:disabled)')?.focus()
  }, [picked])

  useEffect(() => {
    if (!picked) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        document.querySelector<HTMLElement>(`[data-pick-button="${picked.id}"]`)?.focus()
        setPicked(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [picked])

  const place = (target: BucketView) => {
    if (!picked) return
    moveToBucket(picked, target)
    setPicked(null)
  }

  const cardProps = { onEdit, onPick: setPicked, pickedId: picked?.id }

  if (isDesktop) {
    return (
      <div className='flex h-full min-h-0 flex-col'>
        <p aria-live='polite' className='sr-only'>
          {picked ? `Moving “${picked.title}”. Choose a Bucket, or press Escape to cancel.` : ''}
        </p>
        {picked && <PickedBanner picked={picked} onCancel={() => setPicked(null)} />}
        <div className='flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 py-4'>
          {bucketViews.map((view) => (
            <DesktopColumn key={view.bucket.id} bucketViews={bucketViews} picked={picked} view={view} onPlace={place}>
              {view.todos.map((todo) => (
                <PickCard key={todo.id} todo={todo} {...cardProps} />
              ))}
            </DesktopColumn>
          ))}
        </div>
      </div>
    )
  }

  const active = bucketViews.find(({ bucket }) => bucket.id === activeBucketId) ?? bucketViews[0]

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex shrink-0 items-center gap-3 px-4 pt-4 pb-2'>
        <active.icon aria-hidden className='size-6 text-primary' />
        <div className='min-w-0 flex-1'>
          <h2 className='text-2xl font-bold' id='pick-active-bucket'>
            {active.name}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {[active.periodLabel !== active.name && active.periodLabel, `${active.todos.length} ${active.todos.length === 1 ? 'todo' : 'todos'}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <CreateTodoButton
          bucketId={active.bucket.id}
          bucketName={active.name}
          buckets={bucketViews.map(({ bucket }) => bucket)}
        />
      </div>
      <ul aria-labelledby='pick-active-bucket' className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4'>
        {active.todos.length === 0 && (
          <li className='rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground'>
            Nothing here yet.
          </li>
        )}
        {active.todos.map((todo) => (
          <li key={todo.id}>
            <PickCard todo={todo} {...cardProps} />
          </li>
        ))}
      </ul>
      <p aria-live='polite' className='sr-only'>
        {picked ? `Moving “${picked.title}”. Choose a Bucket, or press Escape to cancel.` : ''}
      </p>
      {picked && <PickedBanner picked={picked} onCancel={() => setPicked(null)} />}
      <nav
        aria-label={picked ? `Choose where to move “${picked.title}”` : 'Buckets'}
        className='grid shrink-0 grid-cols-5 gap-1 border-t bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      >
        {bucketViews.map((view) => (
          <BucketTab
            key={view.bucket.id}
            isActive={view.bucket.id === active.bucket.id}
            picked={picked}
            view={view}
            onSelect={() => (picked ? place(view) : setActiveBucketId(view.bucket.id))}
          />
        ))}
      </nav>
    </div>
  )
}

function PickedBanner({ onCancel, picked }: { onCancel: () => void; picked: Todo }) {
  return (
    <div
      className='mx-4 mb-2 flex shrink-0 items-center gap-3 rounded-xl bg-foreground py-1 pr-1 pl-4 text-sm text-background md:mx-6 md:mt-3 md:mb-0'
    >
      <span aria-hidden className='min-w-0 flex-1 py-2 [overflow-wrap:anywhere]'>
        Moving “{picked.title}”. Choose a Bucket, or press Escape to cancel.
      </span>
      <Button
        className='h-11 text-background hover:bg-background/10 hover:text-background'
        variant='ghost'
        onClick={onCancel}
      >
        <X />
        Cancel
      </Button>
    </div>
  )
}

function BucketTab({
  isActive,
  onSelect,
  picked,
  view,
}: {
  isActive: boolean
  onSelect: () => void
  picked: Todo | null
  view: BucketView
}) {
  const { isDropTarget, ref } = useBucketDroppable(`pick-tab-${view.bucket.id}`, view.bucket.id, view.name)
  const isSource = picked?.bucketId === view.bucket.id
  const isTarget = picked !== null && !isSource

  return (
    <button
      ref={ref}
      aria-current={!picked && isActive ? 'page' : undefined}
      data-place-target={isTarget || undefined}
      aria-label={isTarget ? `Move to ${view.name}` : `${view.name}, ${view.todos.length} todos`}
      className={cn(
        'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        !picked && isActive && 'bg-accent text-primary',
        isTarget && 'border-2 border-dashed border-primary bg-primary/5 text-primary',
        isSource && 'opacity-50',
        isDropTarget && 'bg-primary text-primary-foreground',
      )}
      disabled={isSource}
      type='button'
      onClick={onSelect}
    >
      <view.icon aria-hidden className='size-5' />
      <span>{view.shortName}</span>
      <span className='text-[0.7rem] font-bold tabular-nums'>{view.todos.length}</span>
    </button>
  )
}

function DesktopColumn({
  bucketViews,
  children,
  onPlace,
  picked,
  view,
}: {
  bucketViews: Array<BucketView>
  children: React.ReactNode
  onPlace: (view: BucketView) => void
  picked: Todo | null
  view: BucketView
}) {
  const { isDropTarget, ref } = useBucketDroppable(`pick-column-${view.bucket.id}`, view.bucket.id, view.name)
  const headingId = `pick-column-${view.bucket.id}-heading`
  const isTarget = picked !== null && picked.bucketId !== view.bucket.id

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        'flex min-h-0 w-72 shrink-0 flex-col gap-2 rounded-xl bg-secondary/60 p-2 transition-colors lg:w-auto lg:flex-1',
        view.isPlanningBucket && 'bg-primary/5',
        isDropTarget && 'ring-2 ring-primary',
      )}
    >
      <header className='flex items-center gap-2 px-1 py-1'>
        <view.icon aria-hidden className='size-5 text-primary' />
        <h2 className='min-w-0 flex-1' id={headingId}>
          <span className='block font-bold'>{view.name}</span>
          {view.periodLabel !== view.name && (
            <span className='block text-xs font-normal text-muted-foreground'>{view.periodLabel}</span>
          )}
        </h2>
        <span className='text-sm font-semibold text-muted-foreground tabular-nums'>{view.todos.length}</span>
        <CreateTodoButton bucketId={view.bucket.id} bucketName={view.name} buckets={bucketViews.map(({ bucket }) => bucket)} />
      </header>
      {isTarget && (
        <Button
          className='h-11 border-2 border-dashed border-primary text-primary dark:border-primary'
          data-place-target
          variant='outline'
          onClick={() => onPlace(view)}
        >
          Move here
        </Button>
      )}
      <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'>{children}</div>
    </section>
  )
}

function PickCard({
  onEdit,
  onPick,
  pickedId,
  todo,
}: {
  onEdit: (todo: Todo) => void
  onPick: (todo: Todo | null) => void
  pickedId: number | undefined
  todo: Todo
}) {
  const { handleRef, isDragging, ref } = useTodoDraggable(todo)
  const isPicked = pickedId === todo.id

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-1 rounded-xl bg-card py-1 pr-1 shadow-sm transition-[box-shadow,transform]',
        isPicked && 'scale-[1.01] ring-[3px] ring-primary motion-reduce:scale-100',
        isDragging && 'opacity-60',
      )}
    >
      <TodoCheck todo={todo} />
      <button
        className={cn(
          'min-h-11 min-w-0 flex-1 rounded-md py-2 text-left font-semibold [overflow-wrap:anywhere] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:pointer-fine:min-h-9',
          todo.completed && 'text-muted-foreground line-through',
        )}
        type='button'
        onClick={() => onEdit(todo)}
      >
        {todo.title}
        {todo.category && (
          <span className='mt-0.5 block text-xs font-medium text-muted-foreground'>{todo.category.name}</span>
        )}
      </button>
      <Button
        aria-label={isPicked ? `Stop moving “${todo.title}”` : `Move “${todo.title}”`}
        aria-pressed={isPicked}
        className='size-11 md:pointer-fine:size-9'
        data-pick-button={todo.id}
        size='icon'
        variant={isPicked ? 'default' : 'ghost'}
        onClick={() => onPick(isPicked ? null : todo)}
      >
        <ArrowRightLeft />
      </Button>
      <Button
        ref={handleRef}
        aria-label={`Drag “${todo.title}”`}
        className='size-11 cursor-grab touch-none text-muted-foreground active:cursor-grabbing md:pointer-fine:size-9'
        size='icon'
        variant='ghost'
      >
        <GripVertical />
      </Button>
    </div>
  )
}
