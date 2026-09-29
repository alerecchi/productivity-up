import { describe, expect, it } from 'vitest'

import { RealtimeHintSchema } from '@/lib/realtime'
import type { Todo } from '@/lib/types/Todo'
import { todoHints } from '@/server/functions/todos/realtime-hints'

const todo: Todo = {
  bucketId: 2,
  category: null,
  categoryId: null,
  completed: false,
  createdAt: new Date('2026-09-28T10:00:00Z'),
  description: 'Private Todo content',
  id: 9,
  position: 2048,
  tags: [],
  title: 'Private Todo title',
}

describe('Todo realtime hints', () => {
  it.each([
    ['a created Todo refreshes its Bucket', todoHints.create(todo), [{ bucketIds: [2], type: 'todo-created' }]],
    [
      'an edit or toggle within one Bucket refreshes that Bucket once',
      todoHints.update({ previousBucketId: 2, todo }),
      [{ bucketIds: [2], type: 'todo-updated' }],
    ],
    [
      'an edit that changes Bucket refreshes the previous and current Buckets',
      todoHints.update({ previousBucketId: 1, todo }),
      [{ bucketIds: [1, 2], type: 'todo-updated' }],
    ],
    [
      'a move, including a rebalance, refreshes every affected Bucket',
      todoHints.move({
        affectedBucketIds: [1, 2],
        positions: [
          { bucketId: 2, id: 4, position: 1024 },
          { bucketId: 2, id: 9, position: 2048 },
        ],
        sourceBucketId: 1,
        todo,
      }),
      [{ bucketIds: [1, 2], type: 'todo-moved' }],
    ],
    [
      'a deleted Todo refreshes its previous Bucket',
      todoHints.delete({ previousBucketId: 2, todoId: 9 }),
      [{ bucketIds: [2], type: 'todo-deleted' }],
    ],
  ])('%s', (_case, hints, expected) => {
    expect(hints).toEqual(expected)
    expect(hints.every((hint) => RealtimeHintSchema.safeParse(hint).success)).toBe(true)
    expect(JSON.stringify(hints)).not.toMatch(/Private Todo|user|queryKey|todos/i)
  })
})
