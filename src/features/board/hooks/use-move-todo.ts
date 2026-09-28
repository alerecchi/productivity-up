import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useBoardCache } from '@/features/board/cache'
import { isStaleMoveConflict } from '@/features/board/hooks/move-todo-errors'
import { useRealtimeOriginHeaders } from '@/features/board/realtime'
import { moveTodo } from '@/server/functions/todos'

type MoveTodoVariables = Parameters<typeof moveTodo>[0] & {
  sourceBucketId: number
}

/** Moves a Todo optimistically to its drop position; the server decides its canonical Todo Position. */
export function useMoveTodo() {
  const cache = useBoardCache()
  const headers = useRealtimeOriginHeaders()

  return useMutation({
    mutationFn: (variables: MoveTodoVariables) => moveTodo({ data: variables.data, headers }),
    onMutate: async ({ data, sourceBucketId }) => ({
      pendingChange: await cache.begin({
        ...(data.afterTodoId === undefined ? {} : { afterTodoId: data.afterTodoId }),
        ...(data.beforeTodoId === undefined ? {} : { beforeTodoId: data.beforeTodoId }),
        sourceBucketId,
        targetBucketId: data.targetBucketId,
        todoId: data.id,
        type: 'todo-moved',
      }),
    }),
    onError: async (error, _variables, context) => {
      // The snapshot is restored immediately; the canonical refetch finishes in the background.
      void context?.pendingChange.rollback(error)

      if (await isStaleMoveConflict(error)) {
        toast.error('Board refreshed', {
          description: 'Todo positions changed before your move completed. Review the latest order and try again.',
        })
        return
      }

      toast.error('Could not move Todo', {
        description: 'Your board was restored. Refreshing affected Buckets now.',
      })
    },
    onSuccess: async (result, _variables, context) => {
      await context.pendingChange.confirm({ ...result, type: 'todo-moved' })
    },
  })
}
