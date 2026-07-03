import { useDroppable } from '@dnd-kit/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Inbox, ListTodo, Map, Mountain, Signpost } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'

import AddTodoButton from '@/features/board/components/create-todo-button'
import { SortableTodoCard } from '@/features/board/components/sortable-todo-card'
import TodoDialog from '@/features/board/components/todo-dialog'
import { usePendingTodoMove } from '@/features/board/components/todo-drag-drop-provider'
import type { PendingTodoMove } from '@/features/board/components/todo-drag-drop-provider'
import { getTodosQueryOptions } from '@/features/board/queries/todo-queries'
import { Badge } from '@/features/shared/components/ui/badge'
import { cn } from '@/features/shared/utils/tailwind'
import { formatBucketLabel } from '@/lib/periods'
import type { Bucket, BucketType } from '@/lib/types/Bucket'
import type { Todo } from '@/lib/types/Todo'

interface BucketProps {
  bucket: Bucket
  buckets: Array<Bucket>
}

// TODO order for todos
export function BucketColumn({ bucket, buckets }: BucketProps) {
  const { data: todoList = [] } = useSuspenseQuery(getTodosQueryOptions(bucket.id))
  const pendingTodoMove = usePendingTodoMove()
  const displayedTodos = applyPendingTodoMove(todoList, bucket.id, pendingTodoMove)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const { icon: Icon, textColor, bgColor } = bucketStyles[bucket.type]
  const bucketLabel = formatBucketLabel({ periodKey: bucket.period, type: bucket.type })
  const headingId = `bucket-${bucket.id}-heading`

  return (
    <section aria-labelledby={headingId} className='flex h-full min-h-0 w-80 shrink-0 flex-col gap-4'>
      <header className='sticky top-0 z-10 flex shrink-0 flex-row items-center gap-2 bg-background py-1'>
        <div className={cn('rounded-sm p-2', textColor, bgColor)}>
          <Icon className='size-6' />
        </div>
        <h2 className={cn('block text-xl font-semibold capitalize', textColor)} id={headingId}>
          {bucketLabel}
        </h2>
        <Badge className={cn(textColor, bgColor)}>{displayedTodos.length}</Badge>
        <AddTodoButton bucketId={bucket.id} buckets={buckets} />
      </header>
      <div
        aria-label={`${bucketLabel} Todos`}
        className='flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-none rounded-lg bg-secondary pt-2'
        data-bucket-id={bucket.id}
        data-bucket-todo-list
        role='list'
      >
        <TodoInsertionLine bucketId={bucket.id} index={0} afterTodoId={displayedTodos[0]?.id} />
        {displayedTodos
          .map((todoItem) => (
            <SortableTodoCard key={todoItem.id} bucketId={bucket.id} todo={todoItem} onEdit={setEditingTodo} />
          ))
          .flatMap((todoCard, index) => [
            todoCard,
            <TodoInsertionLine
              key={`insertion-${index + 1}`}
              bucketId={bucket.id}
              index={index + 1}
              beforeTodoId={displayedTodos[index]?.id}
              afterTodoId={displayedTodos[index + 1]?.id}
            />,
          ])}
      </div>
      <TodoDialog
        buckets={buckets}
        defaultBucketId={bucket.id}
        editingTodo={editingTodo}
        isOpen={editingTodo !== null}
        setOpen={(open) => {
          if (!open) {
            setEditingTodo(null)
          }
        }}
      />
    </section>
  )
}

function applyPendingTodoMove(todoList: Array<Todo>, bucketId: number, pendingTodoMove: PendingTodoMove | null) {
  if (
    !pendingTodoMove ||
    (bucketId !== pendingTodoMove.sourceBucketId && bucketId !== pendingTodoMove.targetBucketId)
  ) {
    return todoList
  }

  const todoListWithoutMovedTodo = todoList.filter((todo) => todo.id !== pendingTodoMove.todo.id)

  if (bucketId !== pendingTodoMove.targetBucketId) {
    return todoListWithoutMovedTodo
  }

  return insertTodo(
    todoListWithoutMovedTodo,
    pendingTodoMove.todo,
    pendingTodoMove.beforeTodoId,
    pendingTodoMove.afterTodoId,
  )
}

function insertTodo(
  todoList: Array<Todo>,
  movedTodo: Todo,
  beforeTodoId: number | undefined,
  afterTodoId: number | undefined,
) {
  if (afterTodoId !== undefined) {
    const afterIndex = todoList.findIndex((todo) => todo.id === afterTodoId)
    return todoList.toSpliced(afterIndex === -1 ? todoList.length : afterIndex, 0, movedTodo)
  }

  if (beforeTodoId !== undefined) {
    const beforeIndex = todoList.findIndex((todo) => todo.id === beforeTodoId)
    return todoList.toSpliced(beforeIndex === -1 ? todoList.length : beforeIndex + 1, 0, movedTodo)
  }

  return [...todoList, movedTodo]
}

type TodoInsertionData = {
  afterTodoId?: number
  beforeTodoId?: number
  bucketId: number
  kind: 'todo-insertion'
}

function TodoInsertionLine({
  afterTodoId,
  beforeTodoId,
  bucketId,
  index,
}: {
  afterTodoId?: number
  beforeTodoId?: number
  bucketId: number
  index: number
}) {
  const id = `bucket-${bucketId}-insertion-${index}`
  const { isDropTarget, ref } = useDroppable<TodoInsertionData>({
    data: {
      afterTodoId,
      beforeTodoId,
      bucketId,
      kind: 'todo-insertion',
    },
    id,
  })

  return (
    <div
      aria-hidden='true'
      data-drop-target={isDropTarget}
      data-testid={id}
      ref={ref}
      className={cn(
        'mx-2 -my-1 h-2 shrink-0 rounded-full transition-colors',
        isDropTarget ? 'bg-primary' : 'bg-transparent',
      )}
    />
  )
}

type BucketStyle = {
  icon: LucideIcon
  textColor: string
  bgColor: string
}

const bucketStyles: Record<BucketType, BucketStyle> = {
  inbox: { icon: Inbox, textColor: 'text-slate-900', bgColor: 'bg-slate-900/50' },
  yearly: { icon: Mountain, textColor: 'text-violet-900', bgColor: 'bg-violet-900/50' },
  monthly: { icon: Map, textColor: 'text-blue-900', bgColor: 'bg-blue-900/50' },
  weekly: { icon: Signpost, textColor: 'text-amber-900', bgColor: 'bg-amber-900/50 ' },
  daily: { icon: ListTodo, textColor: 'text-green-900', bgColor: 'bg-green-900/50' },
}
