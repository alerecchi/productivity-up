import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useBoardCache } from '@/features/board/cache'
import type { Todo } from '@/lib/types/Todo'
import { updateTodo } from '@/server/functions/todos'

type UpdateTodoVariables = Parameters<typeof updateTodo>[0] & {
  sourceBucketId: number
}

/** Saves Todo edits from the dialog; the cache changes only after the server commits. */
export function useUpdateTodo() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: (variables: UpdateTodoVariables) => updateTodo({ data: variables.data }),
    onError: (error, variables) => {
      void cache.recover(error, {
        bucketIds: [...new Set([variables.sourceBucketId, variables.data.bucketId ?? variables.sourceBucketId])],
        type: 'todos',
      })
    },
    onSuccess: async ({ previousBucketId, todo }) => {
      await cache.apply({ previousBucketId, todo, type: 'todo-updated' })
    },
  })
}

/** Flips a Todo's completion optimistically. */
export function useToggleTodo() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: (todo: Todo) => updateTodo({ data: { completed: !todo.completed, id: todo.id } }),
    onMutate: async (todo) => ({
      pendingChange: await cache.begin({
        bucketId: todo.bucketId,
        changes: { completed: !todo.completed },
        todoId: todo.id,
        type: 'todo-edited',
      }),
    }),
    onError: (error, _todo, context) => {
      void context?.pendingChange.rollback(error)
      toast.error('Could not update Todo', { description: 'Your change was undone. Please try again.' })
    },
    onSuccess: async ({ previousBucketId, todo }, _variables, context) => {
      await context.pendingChange.confirm({ previousBucketId, todo, type: 'todo-updated' })
    },
  })
}
