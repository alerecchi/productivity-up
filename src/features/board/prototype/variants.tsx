// PROTOTYPE (throwaway): three board variants, switchable via `?variant=` on the existing /board route.
// A: Pick up and place · B: Horizon ladder · C: Today first, pull from above. No `variant` shows today's board.
import { useState } from 'react'

import TodoDialog from '@/features/board/components/todo-dialog'
import { useBucketViews } from '@/features/board/prototype/board-prototype-shared'
import { VariantA, name as nameA } from '@/features/board/prototype/variant-a-pick-and-place'
import { VariantB, name as nameB } from '@/features/board/prototype/variant-b-horizon-ladder'
import { VariantC, name as nameC } from '@/features/board/prototype/variant-c-today-first'
import type { Bucket } from '@/lib/types/Bucket'
import type { Todo } from '@/lib/types/Todo'

export const BOARD_VARIANTS = [
  { component: VariantA, key: 'A', name: nameA },
  { component: VariantB, key: 'B', name: nameB },
  { component: VariantC, key: 'C', name: nameC },
] as const

export type BoardVariantKey = (typeof BOARD_VARIANTS)[number]['key']

export function BoardVariant({
  buckets,
  isPlanningBucket,
  isPlanningTomorrow,
  variant,
}: {
  buckets: Array<Bucket>
  isPlanningBucket: (bucket: Bucket) => boolean
  isPlanningTomorrow: boolean
  variant: BoardVariantKey
}) {
  const bucketViews = useBucketViews({ buckets, isPlanningBucket, isPlanningTomorrow })
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const Variant = BOARD_VARIANTS.find(({ key }) => key === variant)!.component

  return (
    <>
      <Variant bucketViews={bucketViews} onEdit={setEditingTodo} />
      <TodoDialog
        buckets={buckets}
        defaultBucketId={editingTodo?.bucketId ?? buckets[0].id}
        editingTodo={editingTodo}
        isOpen={editingTodo !== null}
        setOpen={(open) => {
          if (!open) setEditingTodo(null)
        }}
      />
    </>
  )
}
