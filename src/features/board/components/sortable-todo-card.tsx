import { useDraggable } from '@dnd-kit/react'

import TodoCard from '@/features/board/components/todo-card'
import type { Todo } from '@/lib/types/Todo'

export type TodoDragData = {
  bucketId: number
  kind: 'todo'
  todo: Todo
}

export function SortableTodoCard({
  bucketId,
  onEdit,
  todo,
}: {
  bucketId: number
  onEdit: (todo: Todo) => void
  todo: Todo
}) {
  const { handleRef, isDragging, ref } = useDraggable<TodoDragData>({
    data: {
      bucketId,
      kind: 'todo',
      todo,
    },
    id: `todo-${todo.id}`,
  })

  return <TodoCard dragHandleRef={handleRef} draggableRef={ref} isDragging={isDragging} todo={todo} onEdit={onEdit} />
}
