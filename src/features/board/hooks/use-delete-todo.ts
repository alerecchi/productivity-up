import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { deleteTodo } from '@/server/functions/todos'

type DeleteTodoVariables = Parameters<typeof deleteTodo>[0] & {
  bucketId: number
}

export default function useDeleteTodo() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: (variables: DeleteTodoVariables) => deleteTodo({ data: variables.data }),
    onError: (error, variables) => {
      void cache.recover(error, { bucketIds: [variables.bucketId], type: 'todos' })
    },
    onSuccess: async ({ previousBucketId, todoId }) => {
      await cache.apply({ previousBucketId, todoId, type: 'todo-deleted' })
    },
  })
}
