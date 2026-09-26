import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { Todo } from '@/lib/types/Todo'
import { updateTodo } from '@/server/functions/todos'

export function useUpdateTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateTodo,
    onSuccess: ({ previousBucketId, todo: updatedTodo }) => {
      if (previousBucketId !== updatedTodo.bucketId) {
        moveTodo(queryClient, previousBucketId, updatedTodo)
        return
      }

      replaceTodo(queryClient, updatedTodo.bucketId, updatedTodo)
    },
  })
}

export function useToggleTodo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateTodo,
    onSuccess: ({ todo: updatedTodo }) => {
      replaceTodo(queryClient, updatedTodo.bucketId, updatedTodo)
    },
  })
}

function replaceTodo(queryClient: QueryClient, bucketId: number, updatedTodo: Todo) {
  queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucketId], (cache = []) =>
    cache.map((todo) => (todo.id === updatedTodo.id ? updatedTodo : todo)),
  )
}

function moveTodo(queryClient: QueryClient, oldBucketId: number, updatedTodo: Todo) {
  queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, oldBucketId], (cache = []) =>
    cache.filter((todo) => todo.id !== updatedTodo.id),
  )
  queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, updatedTodo.bucketId], (cache = []) =>
    [...cache.filter((todo) => todo.id !== updatedTodo.id), updatedTodo].toSorted(compareTodoPosition),
  )
}

function compareTodoPosition(left: Todo, right: Todo) {
  return left.position - right.position || left.id - right.id
}
