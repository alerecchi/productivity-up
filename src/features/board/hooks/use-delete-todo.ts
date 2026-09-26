import { useMutation, useQueryClient } from '@tanstack/react-query'

import { TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { Todo } from '@/lib/types/Todo'
import { deleteTodo } from '@/server/functions/todos'

export default function useDeleteTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTodo,
    onSuccess: (deletedTodo) => {
      queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, deletedTodo.previousBucketId], (old = []) =>
        old.filter((todo) => todo.id !== deletedTodo.todoId),
      )
    },
  })
}
