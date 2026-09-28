import type { z } from 'zod'

import type { RealtimeHint } from '@/lib/realtime'
import type {
  DeleteTodoResponse,
  MoveTodoResponse,
  TodoResponse,
  UpdateTodoResponse,
} from '@/server/functions/todos/schemas'

/** The Buckets each committed Todo command changed, for the User's other clients to refetch. */
export const todoHints = {
  create: (todo: z.output<typeof TodoResponse>): Array<RealtimeHint> => [
    { bucketIds: [todo.bucketId], type: 'todo-created' },
  ],
  delete: ({ previousBucketId }: z.output<typeof DeleteTodoResponse>): Array<RealtimeHint> => [
    { bucketIds: [previousBucketId], type: 'todo-deleted' },
  ],
  move: ({ affectedBucketIds }: z.output<typeof MoveTodoResponse>): Array<RealtimeHint> => [
    { bucketIds: affectedBucketIds, type: 'todo-moved' },
  ],
  update: ({ previousBucketId, todo }: z.output<typeof UpdateTodoResponse>): Array<RealtimeHint> => [
    { bucketIds: [...new Set([previousBucketId, todo.bucketId])], type: 'todo-updated' },
  ],
}
