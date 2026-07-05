import { useSuspenseQuery } from '@tanstack/react-query'

import { BucketColumn } from '@/features/board/components/bucket-column'
import { TodoDragDropProvider } from '@/features/board/components/todo-drag-drop-provider'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'
import type { Bucket } from '@/lib/types/Bucket'

const BUCKET_TYPE_ORDER = ['inbox', 'yearly', 'monthly', 'weekly', 'daily']
// Helper for O(1) lookups during sort
const bucketPriority: Record<string, number> = BUCKET_TYPE_ORDER.reduce(
  (acc, type, index) => ({ ...acc, [type]: index }),
  {},
)

export function Board() {
  const { data: board } = useSuspenseQuery(getBoardQueryOptions)
  const bucketList = board.buckets
  // TODO: decide where the sorting should be (server, client before cache?, here)
  const sortedBuckets = bucketList.toSorted((a: Bucket, b: Bucket) => bucketPriority[a.type] - bucketPriority[b.type])

  return (
    <TodoDragDropProvider>
      <div
        aria-label='Todo Buckets board'
        className='flex h-[calc(100dvh-3.5rem)] flex-row gap-6 overflow-x-auto overflow-y-hidden px-6 py-6'
        data-todo-board
        role='region'
      >
        {sortedBuckets.map((bucket: Bucket) => (
          <BucketColumn key={bucket.id} bucket={bucket} buckets={sortedBuckets} />
        ))}
      </div>
    </TodoDragDropProvider>
  )
}
