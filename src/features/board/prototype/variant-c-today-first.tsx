// PROTOTYPE (throwaway): variant C, "Today first, pull from above".
// Phone: the focused Bucket (Today by default) fills the screen; a bottom panel shows a broader Bucket to pull from.
// Desktop: broader Buckets as narrow columns on the left, the focused Bucket pinned wide on the right.
import { ArrowDownToLine, ChevronDown, ChevronUp, GripVertical, MoveRight } from 'lucide-react'
import { useState } from 'react'

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
import { Tabs, TabsList, TabsTrigger } from '@/features/shared/components/ui/tabs'
import { cn } from '@/features/shared/utils/tailwind'
import type { Todo } from '@/lib/types/Todo'

export const name = 'Today first, pull from above'

export function VariantC({ bucketViews, onEdit }: VariantProps) {
  const isDesktop = useIsDesktop()
  const daily = bucketViews.find(({ bucket }) => bucket.type === 'daily') ?? bucketViews.at(-1)!
  const [focusId, setFocusId] = useState(daily.bucket.id)
  const focus = bucketViews.find(({ bucket }) => bucket.id === focusId) ?? daily
  const focusIndex = bucketViews.indexOf(focus)
  const broader = bucketViews.slice(0, focusIndex)
  const [sourceId, setSourceId] = useState<number | undefined>(undefined)
  const source = broader.find(({ bucket }) => bucket.id === sourceId) ?? broader.at(-1)

  if (isDesktop) {
    return (
      <div className='flex h-full min-h-0 gap-3 overflow-x-auto px-6 py-4'>
        {broader.map((view) => (
          <SourceColumn key={view.bucket.id} bucketViews={bucketViews} focus={focus} view={view} onEdit={onEdit} />
        ))}
        <FocusPane bucketViews={bucketViews} className='min-w-[22rem] flex-[1.4]' focus={focus} onEdit={onEdit} />
      </div>
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <Tabs className='shrink-0 px-4 pt-3' value={focusId} onValueChange={(value) => setFocusId(Number(value))}>
        <TabsList aria-label='Buckets' className='h-12! w-full'>
          {bucketViews.map((view) => (
            <TabsTrigger key={view.bucket.id} className='h-11 px-1 text-xs' value={view.bucket.id}>
              {view.shortName}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FocusPane bucketViews={bucketViews} className='min-h-0 flex-1 px-4' focus={focus} onEdit={onEdit} />
      {source && (
        <PullPanel
          bucketViews={bucketViews}
          broader={broader}
          focus={focus}
          source={source}
          onEdit={onEdit}
          onSourceChange={setSourceId}
        />
      )}
    </div>
  )
}

function FocusPane({
  bucketViews,
  className,
  focus,
  onEdit,
}: {
  bucketViews: Array<BucketView>
  className?: string
  focus: BucketView
  onEdit: (todo: Todo) => void
}) {
  const { isDropTarget, ref } = useBucketDroppable(`today-focus-${focus.bucket.id}`, focus.bucket.id)
  const headingId = `today-focus-${focus.bucket.id}-heading`

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-2 rounded-2xl transition-colors', isDropTarget && 'bg-primary/10', className)}
    >
      <header className='flex items-center gap-3 pt-3'>
        <h2 className='min-w-0 flex-1' id={headingId}>
          <span className='block text-2xl font-bold'>{focus.name}</span>
          <span className='block text-sm text-muted-foreground'>
            {focus.periodLabel} · {focus.todos.length} {focus.todos.length === 1 ? 'todo' : 'todos'}
          </span>
        </h2>
        <CreateTodoButton bucketId={focus.bucket.id} buckets={bucketViews.map(({ bucket }) => bucket)} />
      </header>
      <ul className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4'>
        {focus.todos.length === 0 && (
          <li className='rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground'>
            Nothing here yet. Pull something in from a broader Bucket.
          </li>
        )}
        {focus.todos.map((todo) => (
          <li key={todo.id}>
            <FocusCard bucketViews={bucketViews} todo={todo} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function PullPanel({
  broader,
  bucketViews,
  focus,
  onEdit,
  onSourceChange,
  source,
}: {
  broader: Array<BucketView>
  bucketViews: Array<BucketView>
  focus: BucketView
  onEdit: (todo: Todo) => void
  onSourceChange: (bucketId: number) => void
  source: BucketView
}) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <section
      aria-label={`Pull from ${source.name}`}
      className='shrink-0 rounded-t-2xl border-t bg-card shadow-[0_-6px_24px_-12px_rgb(0_0_0/0.25)]'
    >
      <Button
        aria-expanded={isOpen}
        className='h-12 w-full justify-between rounded-none rounded-t-2xl px-4 text-base font-bold'
        variant='ghost'
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          Pull from {source.name.toLowerCase()} <span className='text-muted-foreground tabular-nums'>· {source.todos.length}</span>
        </span>
        {isOpen ? <ChevronDown /> : <ChevronUp />}
      </Button>
      {isOpen && (
        <div className='flex max-h-[40dvh] flex-col gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
          <div className='flex gap-2 overflow-x-auto' role='group' aria-label='Pull from'>
            {broader.toReversed().map((view) => (
              <Button
                key={view.bucket.id}
                aria-pressed={view.bucket.id === source.bucket.id}
                className='h-11 rounded-full'
                size='sm'
                variant={view.bucket.id === source.bucket.id ? 'default' : 'outline'}
                onClick={() => onSourceChange(view.bucket.id)}
              >
                {view.name}
              </Button>
            ))}
          </div>
          <ul className='flex min-h-0 flex-col gap-2 overflow-y-auto'>
            {source.todos.length === 0 && (
              <li className='p-3 text-center text-sm text-muted-foreground'>Nothing waiting in {source.name.toLowerCase()}.</li>
            )}
            {source.todos.map((todo) => (
              <li key={todo.id}>
                <SourceCard bucketViews={bucketViews} focus={focus} todo={todo} onEdit={onEdit} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function SourceColumn({
  bucketViews,
  focus,
  onEdit,
  view,
}: {
  bucketViews: Array<BucketView>
  focus: BucketView
  onEdit: (todo: Todo) => void
  view: BucketView
}) {
  const { isDropTarget, ref } = useBucketDroppable(`today-source-${view.bucket.id}`, view.bucket.id)
  const headingId = `today-source-${view.bucket.id}-heading`

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        'flex min-h-0 w-60 shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2 lg:w-auto lg:min-w-0 lg:flex-1',
        isDropTarget && 'ring-2 ring-primary',
      )}
    >
      <header className='flex items-center gap-2 px-1'>
        <view.icon aria-hidden className='size-4 text-muted-foreground' />
        <h2 className='min-w-0 flex-1' id={headingId}>
          <span className='block text-sm font-bold'>{view.name}</span>
          <span className='block text-xs text-muted-foreground'>{view.periodLabel}</span>
        </h2>
        <span className='text-xs font-semibold text-muted-foreground tabular-nums'>{view.todos.length}</span>
        <CreateTodoButton bucketId={view.bucket.id} buckets={bucketViews.map(({ bucket }) => bucket)} />
      </header>
      <ul className='flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto'>
        {view.todos.map((todo) => (
          <li key={todo.id}>
            <SourceCard bucketViews={bucketViews} focus={focus} isStacked todo={todo} onEdit={onEdit} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A todo in a broader Bucket: the main action pulls it into the focused Bucket. */
function SourceCard({
  bucketViews,
  focus,
  isStacked = false,
  onEdit,
  todo,
}: {
  bucketViews: Array<BucketView>
  focus: BucketView
  /** Narrow desktop columns put the actions on their own row. */
  isStacked?: boolean
  onEdit: (todo: Todo) => void
  todo: Todo
}) {
  const moveToBucket = useMoveToBucket()
  const { handleRef, isDragging, ref } = useTodoDraggable(todo)

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-1 rounded-lg bg-background py-0.5 pr-1 pl-1',
        isStacked && 'flex-wrap',
        isDragging && 'opacity-60',
      )}
    >
      <Button
        ref={handleRef}
        aria-label={`Drag “${todo.title}”`}
        className='size-11 shrink-0 cursor-grab touch-none text-muted-foreground'
        size='icon'
        variant='ghost'
      >
        <GripVertical />
      </Button>
      <button
        className={cn(
          'min-h-11 min-w-0 flex-1 rounded-md py-2 text-left text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          isStacked && 'basis-[calc(100%-3rem)]',
        )}
        type='button'
        onClick={() => onEdit(todo)}
      >
        {todo.title}
      </button>
      <Button
        aria-label={`Pull “${todo.title}” to ${focus.name}`}
        className={cn('h-11 shrink-0 rounded-full', isStacked && 'ml-auto')}
        size='sm'
        onClick={() => moveToBucket(todo, focus)}
      >
        <ArrowDownToLine />
        {focus.shortName}
      </Button>
      <MoveMenu bucketViews={bucketViews} todo={todo} />
    </div>
  )
}

/** A todo in the focused Bucket: checkbox first, Move menu for anything else. */
function FocusCard({
  bucketViews,
  onEdit,
  todo,
}: {
  bucketViews: Array<BucketView>
  onEdit: (todo: Todo) => void
  todo: Todo
}) {
  const { handleRef, isDragging, ref } = useTodoDraggable(todo)

  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-1 rounded-2xl border bg-card py-1.5 pr-1 shadow-sm', isDragging && 'opacity-60')}
    >
      <TodoCheck todo={todo} />
      <button
        className={cn(
          'min-h-11 min-w-0 flex-1 rounded-md py-2 text-left text-base font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          todo.completed && 'text-muted-foreground line-through',
        )}
        type='button'
        onClick={() => onEdit(todo)}
      >
        {todo.title}
        {todo.tags.length > 0 && (
          <span className='mt-0.5 block text-xs font-medium text-muted-foreground'>
            {todo.tags.map((tag) => tag.name).join(' · ')}
          </span>
        )}
      </button>
      <MoveMenu bucketViews={bucketViews} todo={todo} />
      <Button
        ref={handleRef}
        aria-label={`Drag “${todo.title}”`}
        className='size-11 shrink-0 cursor-grab touch-none text-muted-foreground'
        size='icon'
        variant='ghost'
      >
        <GripVertical />
      </Button>
    </div>
  )
}

function MoveMenu({ bucketViews, todo }: { bucketViews: Array<BucketView>; todo: Todo }) {
  const moveToBucket = useMoveToBucket()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label={`Move “${todo.title}” to…`} className='size-11 shrink-0' size='icon' variant='ghost' />}
      >
        <MoveRight />
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
  )
}
