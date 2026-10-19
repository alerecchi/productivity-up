// PROTOTYPE (throwaway): shared plumbing for the /board?variant= prototypes. See variants.tsx.
import { useDraggable, useDroppable } from '@dnd-kit/react'
import { useSuspenseQueries } from '@tanstack/react-query'
import { Inbox, ListTodo, Map, Mountain, Signpost } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { TodoDragData } from '@/features/board/components/sortable-todo-card'
import { useMoveTodo } from '@/features/board/hooks/use-move-todo'
import { useToggleTodo } from '@/features/board/hooks/use-update-todo'
import { getTodosQueryOptions } from '@/features/board/queries/todo-queries'
import { Checkbox } from '@/features/shared/components/ui/checkbox'
import { formatBucketLabel } from '@/lib/periods'
import type { Bucket, BucketType } from '@/lib/types/Bucket'
import type { Todo } from '@/lib/types/Todo'

export type BucketView = {
  bucket: Bucket
  /** Full, plain name: "This week". */
  name: string
  /** Short name for tight navigation: "Week". */
  shortName: string
  /** The period label the board shows today: "Week 43 (19-25)". */
  periodLabel: string
  icon: LucideIcon
  todos: Array<Todo>
  isPlanningBucket: boolean
}

const BUCKET_ORDER: Array<BucketType> = ['inbox', 'yearly', 'monthly', 'weekly', 'daily']

const BUCKET_NAMES: Record<BucketType, { icon: LucideIcon; name: string; shortName: string }> = {
  inbox: { icon: Inbox, name: 'Inbox', shortName: 'Inbox' },
  yearly: { icon: Mountain, name: 'This year', shortName: 'Year' },
  monthly: { icon: Map, name: 'This month', shortName: 'Month' },
  weekly: { icon: Signpost, name: 'This week', shortName: 'Week' },
  daily: { icon: ListTodo, name: 'Today', shortName: 'Today' },
}

/** Buckets in board order (Inbox → Today) with their todos. */
export function useBucketViews({
  buckets,
  isPlanningBucket,
  isPlanningTomorrow,
}: {
  buckets: Array<Bucket>
  isPlanningBucket: (bucket: Bucket) => boolean
  isPlanningTomorrow: boolean
}): Array<BucketView> {
  const sorted = buckets.toSorted((a, b) => BUCKET_ORDER.indexOf(a.type) - BUCKET_ORDER.indexOf(b.type))
  const results = useSuspenseQueries({ queries: sorted.map((bucket) => getTodosQueryOptions(bucket.id)) })

  return sorted.map((bucket, index) => {
    const meta = BUCKET_NAMES[bucket.type]
    const isTomorrow = bucket.type === 'daily' && isPlanningTomorrow

    return {
      bucket,
      icon: meta.icon,
      isPlanningBucket: isPlanningBucket(bucket),
      name: isTomorrow ? 'Tomorrow' : meta.name,
      periodLabel: formatBucketLabel({ periodKey: bucket.period, type: bucket.type }),
      shortName: isTomorrow ? 'Tomorrow' : meta.shortName,
      todos: results[index].data,
    }
  })
}

/** Moves a todo to the end of another Bucket without dragging, and confirms it in a polite toast. */
export function useMoveToBucket() {
  const { mutate } = useMoveTodo()

  return (todo: Todo, target: BucketView) => {
    if (todo.bucketId === target.bucket.id) {
      return
    }

    mutate(
      { data: { id: todo.id, targetBucketId: target.bucket.id }, sourceBucketId: todo.bucketId },
      { onSuccess: () => toast(`Moved “${todo.title}” to ${target.name}`) },
    )
  }
}

/** Makes a todo draggable; the drop lands at the end of whichever Bucket target it is released on. */
export function useTodoDraggable(todo: Todo) {
  return useDraggable<TodoDragData>({
    data: { bucketId: todo.bucketId, kind: 'todo', todo },
    id: `todo-${todo.id}`,
  })
}

/** A whole-Bucket drop target (tab, chip, header or column). `id` must be unique on the page. */
export function useBucketDroppable(id: string, bucketId: number) {
  return useDroppable({ data: { bucketId, kind: 'todo-insertion' }, id })
}

export function useIsDesktop() {
  const query = '(min-width: 768px)'
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setIsDesktop(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}

export type VariantProps = {
  bucketViews: Array<BucketView>
  onEdit: (todo: Todo) => void
}

/** Completion checkbox with a 44px hit area and a name that says which todo it completes. */
export function TodoCheck({ todo }: { todo: Todo }) {
  const { mutate: toggleTodo } = useToggleTodo()

  return (
    <span className='flex size-11 shrink-0 items-center justify-center md:pointer-fine:size-9'>
      <Checkbox
        aria-label={todo.completed ? `Mark “${todo.title}” as not done` : `Mark “${todo.title}” as done`}
        checked={todo.completed}
        className='size-6 rounded-full border-2 after:-inset-2.5'
        onCheckedChange={() => toggleTodo(todo)}
      />
    </span>
  )
}
