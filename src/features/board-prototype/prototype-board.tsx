import { move } from '@dnd-kit/helpers'
// PROTOTYPE, throwaway. In-memory board state shared by every variant, plus drag-and-drop wiring.
import { DragDropProvider, useDroppable } from '@dnd-kit/react'
import type { DragDropEventHandlers } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { createContext, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { BUCKET_IDS, createSeedState } from './prototype-data'
import type { BoardState, BucketId, CategoryId, Todo } from './prototype-data'

type Position = 'start' | 'end'

type BoardApi = {
  state: BoardState
  todosIn: (bucketId: BucketId) => Array<Todo>
  bucketOf: (todoId: string) => BucketId
  toggleDone: (todoId: string) => void
  moveTo: (todoId: string, bucketId: BucketId, position?: Position) => void
  shift: (todoId: string, delta: -1 | 1) => void
  add: (bucketId: BucketId, todo: { title: string; categoryId?: CategoryId; tags?: Array<string> }) => string
  sinkDone: (todoId: string) => void
  /** Keeps open todos before done ones in a bucket, for variants that render done todos separately. */
  partitionDone: (bucketId: BucketId) => void
  setOrder: (order: BoardState['order']) => void
  reset: () => void
  /** Id of the todo being dragged, if any. */
  draggingId: string | null
}

const BoardContext = createContext<BoardApi | null>(null)

export function useBoard() {
  const api = useContext(BoardContext)
  if (!api) throw new Error('useBoard must be used inside PrototypeBoardProvider')
  return api
}

/** Runs a state change inside a view transition so non-drag moves animate too. */
export function withViewTransition(update: () => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!('startViewTransition' in document) || reduced) {
    update()
    return
  }
  document.startViewTransition(() => flushSync(update))
}

const DROP_PREFIX = 'drop:'

/** A target that is not a rendered list, like a tab or a collapsed bucket. Dropping adds the todo to it. */
type DropTargetOptions = { position?: Position; key?: string }

function dropTargetId(bucketId: BucketId, { position = 'end', key = '' }: DropTargetOptions = {}) {
  return `${DROP_PREFIX}${bucketId}:${position}:${key}`
}

function parseDropTarget(id: unknown) {
  if (typeof id !== 'string' || !id.startsWith(DROP_PREFIX)) return null
  const [bucketId, position] = id.slice(DROP_PREFIX.length).split(':')
  return { bucketId: bucketId as BucketId, position: position as Position }
}

export function PrototypeBoardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createSeedState)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const orderBeforeDrag = useRef(state.order)

  const bucketOf = (todoId: string) => BUCKET_IDS.find((id) => state.order[id].includes(todoId)) ?? 'inbox'

  const moveTo = (todoId: string, bucketId: BucketId, position: Position = 'end') => {
    setState((prev) => {
      const order = { ...prev.order }
      for (const id of BUCKET_IDS) order[id] = order[id].filter((t) => t !== todoId)
      order[bucketId] = position === 'start' ? [todoId, ...order[bucketId]] : [...order[bucketId], todoId]
      return { ...prev, order }
    })
  }

  const api: BoardApi = {
    state,
    draggingId,
    bucketOf,
    todosIn: (bucketId) => state.order[bucketId].map((id) => state.todos[id]),
    toggleDone: (todoId) =>
      setState((prev) => ({
        ...prev,
        todos: { ...prev.todos, [todoId]: { ...prev.todos[todoId], done: !prev.todos[todoId].done } },
      })),
    moveTo,
    shift: (todoId, delta) =>
      setState((prev) => {
        const bucketId = BUCKET_IDS.find((id) => prev.order[id].includes(todoId))!
        const list = [...prev.order[bucketId]]
        const from = list.indexOf(todoId)
        const to = Math.min(list.length - 1, Math.max(0, from + delta))
        list.splice(to, 0, ...list.splice(from, 1))
        return { ...prev, order: { ...prev.order, [bucketId]: list } }
      }),
    add: (bucketId, { title, categoryId, tags = [] }) => {
      const id = `new-${crypto.randomUUID()}`
      setState((prev) => ({
        todos: { ...prev.todos, [id]: { id, title, categoryId, tags, done: false } },
        order: { ...prev.order, [bucketId]: [...prev.order[bucketId], id] },
      }))
      return id
    },
    sinkDone: (todoId) =>
      setState((prev) => {
        const bucketId = BUCKET_IDS.find((id) => prev.order[id].includes(todoId))!
        const rest = prev.order[bucketId].filter((t) => t !== todoId)
        return { ...prev, order: { ...prev.order, [bucketId]: [...rest, todoId] } }
      }),
    partitionDone: (bucketId) =>
      setState((prev) => {
        const list = prev.order[bucketId]
        const sorted = [...list.filter((id) => !prev.todos[id].done), ...list.filter((id) => prev.todos[id].done)]
        if (sorted.every((id, i) => id === list[i])) return prev
        return { ...prev, order: { ...prev.order, [bucketId]: sorted } }
      }),
    setOrder: (order) => setState((prev) => ({ ...prev, order })),
    reset: () => setState(createSeedState()),
  }

  const onDragStart: DragDropEventHandlers['onDragStart'] = (event) => {
    orderBeforeDrag.current = state.order
    setDraggingId(String(event.operation.source?.id ?? ''))
  }

  const onDragOver: DragDropEventHandlers['onDragOver'] = (event) => {
    if (parseDropTarget(event.operation.target?.id)) return
    setState((prev) => ({ ...prev, order: move(prev.order, event) }))
  }

  const onDragEnd: DragDropEventHandlers['onDragEnd'] = (event) => {
    setDraggingId(null)
    if (event.canceled) {
      setState((prev) => ({ ...prev, order: orderBeforeDrag.current }))
      return
    }
    const drop = parseDropTarget(event.operation.target?.id)
    const sourceId = event.operation.source?.id
    if (drop && typeof sourceId === 'string') moveTo(sourceId, drop.bucketId, drop.position)
  }

  return (
    <BoardContext value={api}>
      <DragDropProvider onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        {children}
      </DragDropProvider>
    </BoardContext>
  )
}

/** A todo that can be dragged within and between rendered bucket lists. */
export function useTodoSortable(todoId: string, bucketId: BucketId, index: number) {
  return useSortable({
    id: todoId,
    index,
    group: bucketId,
    type: 'todo',
    accept: 'todo',
    transition: { duration: 250, easing: 'cubic-bezier(0.2, 0, 0, 1)', idle: false },
  })
}

/** The list element of a rendered bucket, so empty buckets still accept drops. */
export function useBucketList(bucketId: BucketId) {
  return useDroppable({ id: bucketId, type: 'bucket', accept: 'todo', collisionPriority: 1 })
}

/** A tab, chip or collapsed header that a todo can be dropped onto. */
export function useBucketDropTarget(bucketId: BucketId, options?: DropTargetOptions) {
  return useDroppable({
    id: dropTargetId(bucketId, options),
    type: 'bucket-target',
    accept: 'todo',
    collisionPriority: 3,
  })
}
