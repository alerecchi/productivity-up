import { Accessibility, KeyboardSensor } from '@dnd-kit/dom'
import { DragDropProvider } from '@dnd-kit/react'
import type { DragEndEvent } from '@dnd-kit/react'
import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'

import type { TodoDragData } from '@/features/board/components/sortable-todo-card'
import { useMoveTodo } from '@/features/board/hooks/use-move-todo'
import { scrollTodoBoard } from '@/features/board/lib/board-auto-scroll'
import { scrollBucketTodoListToEnd } from '@/features/board/lib/bucket-todo-list-scroll'
import type { Todo } from '@/lib/types/Todo'

type TodoInsertionData = {
  afterTodoId?: number
  beforeTodoId?: number
  bucketId: number
  bucketName?: string
  kind: 'todo-insertion'
}

type AnnouncementOperation = { source: { data?: unknown } | null; target: { data?: unknown } | null }

const todoTitle = (operation: AnnouncementOperation) =>
  isTodoDragData(operation.source?.data) ? `“${operation.source.data.todo.title}”` : 'Todo'
const bucketName = (operation: AnnouncementOperation) =>
  isTodoInsertionData(operation.target?.data) ? (operation.target.data.bucketName ?? 'a Bucket') : undefined

/** Screen-reader messages that name the todo and the Bucket instead of dnd-kit's internal ids. */
const accessibility = Accessibility.configure({
  announcements: {
    dragend: ({ canceled, operation }: { canceled: boolean; operation: AnnouncementOperation }) => {
      if (canceled) return `Move cancelled. ${todoTitle(operation)} stayed where it was.`
      const target = bucketName(operation)
      return target ? `${todoTitle(operation)} moved to ${target}.` : `${todoTitle(operation)} dropped outside a Bucket. Nothing moved.`
    },
    dragover: ({ operation }: { operation: AnnouncementOperation }) => {
      const target = bucketName(operation)
      return target ? `Over ${target}.` : 'Not over a Bucket.'
    },
    dragstart: ({ operation }: { operation: AnnouncementOperation }) => `Picked up ${todoTitle(operation)}. Use the arrow keys to choose a Bucket.`,
  },
  screenReaderInstructions: {
    draggable:
      'To drag, press Space, then use the left and right arrow keys to move between Buckets and press Space again to drop, or Escape to cancel. You can also use the Move button.',
  },
})

/** Left/right arrows jump roughly one Bucket column; up/down step through a Bucket's todos. */
const keyboardSensor = KeyboardSensor.configure({ offset: { x: 310, y: 56 } })

export type PendingTodoMove = {
  afterTodoId?: number
  beforeTodoId?: number
  sourceBucketId: number
  targetBucketId: number
  todo: Todo
}

const PendingTodoMoveContext = createContext<PendingTodoMove | null>(null)

export function TodoDragDropProvider({ children }: { children: ReactNode }) {
  const { mutate: moveTodo } = useMoveTodo()
  const [pendingTodoMove, setPendingTodoMove] = useState<PendingTodoMove | null>(null)

  const handleDragMove = (event: unknown, manager: unknown) => {
    if (typeof document === 'undefined') {
      return
    }

    const targetData = getDragMoveTargetData(event)
    const currentBucketId = isTodoInsertionData(targetData) ? targetData.bucketId : undefined

    scrollTodoBoard({
      board: document.querySelector<HTMLElement>('[data-todo-board]'),
      bucketLists: Array.from(document.querySelectorAll<HTMLElement>('[data-bucket-todo-list]')),
      currentBucketId,
      pointer: getDragMovePointer(manager),
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled) {
      return
    }

    const sourceData = event.operation.source?.data
    const targetData = event.operation.target?.data

    if (!isTodoDragData(sourceData) || !isTodoInsertionData(targetData)) {
      return
    }

    const movedTodo = sourceData.todo

    if (targetData.beforeTodoId === movedTodo.id || targetData.afterTodoId === movedTodo.id) {
      return
    }

    flushSync(() => {
      setPendingTodoMove(
        removeUndefinedValues({
          afterTodoId: targetData.afterTodoId,
          beforeTodoId: targetData.beforeTodoId,
          sourceBucketId: sourceData.bucketId,
          targetBucketId: targetData.bucketId,
          todo: { ...movedTodo, bucketId: targetData.bucketId },
        }),
      )
    })

    moveTodo(
      {
        data: removeUndefinedValues({
          afterTodoId: targetData.afterTodoId,
          beforeTodoId: targetData.beforeTodoId,
          id: movedTodo.id,
          targetBucketId: targetData.bucketId,
        }),
        sourceBucketId: sourceData.bucketId,
      },
      {
        onSettled: () => {
          setPendingTodoMove(null)
        },
      },
    )

    if (isFinalBucketInsertion(targetData)) {
      scrollBucketTodoListToEnd(targetData.bucketId)
    }
  }

  return (
    <PendingTodoMoveContext value={pendingTodoMove}>
      <DragDropProvider
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        plugins={(defaults) => [...defaults.filter((plugin) => plugin !== Accessibility), accessibility]}
        sensors={(defaults) => defaults.map((sensor) => (sensor === KeyboardSensor ? keyboardSensor : sensor))}
      >
        {children}
      </DragDropProvider>
    </PendingTodoMoveContext>
  )
}

export function usePendingTodoMove() {
  return useContext(PendingTodoMoveContext)
}

function isTodoDragData(data: unknown): data is TodoDragData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'kind' in data &&
    data.kind === 'todo' &&
    'bucketId' in data &&
    typeof data.bucketId === 'number' &&
    'todo' in data &&
    typeof data.todo === 'object' &&
    data.todo !== null
  )
}

function isTodoInsertionData(data: unknown): data is TodoInsertionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'kind' in data &&
    data.kind === 'todo-insertion' &&
    'bucketId' in data &&
    typeof data.bucketId === 'number'
  )
}

function removeUndefinedValues<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as T
}

function isFinalBucketInsertion(targetData: TodoInsertionData) {
  return targetData.beforeTodoId !== undefined && targetData.afterTodoId === undefined
}

function getDragMoveTargetData(event: unknown) {
  if (typeof event !== 'object' || event === null || !('operation' in event)) {
    return undefined
  }

  const operation = event.operation

  if (typeof operation !== 'object' || operation === null || !('target' in operation)) {
    return undefined
  }

  const target = operation.target

  if (typeof target !== 'object' || target === null || !('data' in target)) {
    return undefined
  }

  return target.data
}

function getDragMovePointer(manager: unknown) {
  if (typeof manager !== 'object' || manager === null || !('dragOperation' in manager)) {
    return null
  }

  const dragOperation = manager.dragOperation

  if (typeof dragOperation !== 'object' || dragOperation === null || !('position' in dragOperation)) {
    return null
  }

  const position = dragOperation.position

  if (typeof position !== 'object' || position === null || !('current' in position)) {
    return null
  }

  const pointer = position.current

  if (
    typeof pointer !== 'object' ||
    pointer === null ||
    !('x' in pointer) ||
    typeof pointer.x !== 'number' ||
    !('y' in pointer) ||
    typeof pointer.y !== 'number'
  ) {
    return null
  }

  return {
    x: pointer.x,
    y: pointer.y,
  }
}
