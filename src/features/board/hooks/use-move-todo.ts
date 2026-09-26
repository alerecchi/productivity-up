import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { isStaleMoveConflict } from '@/features/board/hooks/move-todo-errors'
import { TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { Todo } from '@/lib/types/Todo'
import { moveTodo } from '@/server/functions/todos'

type MoveTodoVariables = Parameters<typeof moveTodo>[0] & {
  sourceBucketId?: number
}

export function useMoveTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: MoveTodoVariables) => moveTodo({ data: variables.data }),
    onMutate: (variables) => {
      const affectedBucketIds = getAffectedBucketIds(variables.data.targetBucketId, variables.sourceBucketId)

      void Promise.all(
        affectedBucketIds.map((bucketId) => queryClient.cancelQueries({ queryKey: [TODOS_QUERY_KEY, bucketId] })),
      )

      const previousTargetTodos = queryClient.getQueryData<Array<Todo>>([
        TODOS_QUERY_KEY,
        variables.data.targetBucketId,
      ])
      const previousSourceTodos =
        variables.sourceBucketId === undefined || variables.sourceBucketId === variables.data.targetBucketId
          ? undefined
          : queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, variables.sourceBucketId])

      if (variables.sourceBucketId !== undefined && variables.sourceBucketId !== variables.data.targetBucketId) {
        const movedTodo = previousSourceTodos?.find((todo) => todo.id === variables.data.id)

        if (movedTodo) {
          queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, variables.sourceBucketId], (cache = []) =>
            cache.filter((todo) => todo.id !== variables.data.id),
          )
          queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, variables.data.targetBucketId], (cache = []) =>
            insertTodoInCache(
              cache,
              { ...movedTodo, bucketId: variables.data.targetBucketId },
              variables.data.beforeTodoId,
              variables.data.afterTodoId,
            ),
          )
        }

        return { previousSourceTodos, previousTargetTodos, sourceBucketId: variables.sourceBucketId }
      }

      queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, variables.data.targetBucketId], (cache = []) =>
        moveTodoInCache(cache, variables.data.id, variables.data.beforeTodoId, variables.data.afterTodoId),
      )

      return { previousTargetTodos }
    },
    onError: async (error, variables, context) => {
      queryClient.setQueryData([TODOS_QUERY_KEY, variables.data.targetBucketId], context?.previousTargetTodos)

      if (context?.sourceBucketId !== undefined) {
        queryClient.setQueryData([TODOS_QUERY_KEY, context.sourceBucketId], context.previousSourceTodos)
      }

      const affectedBucketIds = getAffectedBucketIds(variables.data.targetBucketId, context?.sourceBucketId)

      if (await isStaleMoveConflict(error)) {
        for (const bucketId of affectedBucketIds) {
          void queryClient.refetchQueries({ queryKey: [TODOS_QUERY_KEY, bucketId], type: 'active' }, {})
        }

        toast.error('Board refreshed', {
          description: 'Todo positions changed before your move completed. Review the latest order and try again.',
        })
        return
      }

      for (const bucketId of affectedBucketIds) {
        void queryClient.invalidateQueries({ queryKey: [TODOS_QUERY_KEY, bucketId] })
      }

      toast.error('Could not move Todo', {
        description: 'Your board was restored. Refreshing affected Buckets now.',
      })
    },
    onSuccess: (result) => {
      for (const bucketId of result.affectedBucketIds) {
        queryClient.setQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucketId], (cache = []) =>
          patchMovedTodoCache(bucketId, cache, result.todo, result.positions),
        )
      }
    },
  })
}

function moveTodoInCache(
  todos: Array<Todo>,
  movedTodoId: number,
  beforeTodoId: number | undefined,
  afterTodoId: number | undefined,
) {
  const movedTodo = todos.find((todo) => todo.id === movedTodoId)

  if (!movedTodo) {
    return todos
  }

  const remainingTodos = todos.filter((todo) => todo.id !== movedTodoId)

  return insertTodoInCache(remainingTodos, movedTodo, beforeTodoId, afterTodoId)
}

function insertTodoInCache(
  todos: Array<Todo>,
  movedTodo: Todo,
  beforeTodoId: number | undefined,
  afterTodoId: number | undefined,
) {
  const remainingTodos = todos.filter((todo) => todo.id !== movedTodo.id)
  const insertionIndex = getInsertionIndex(remainingTodos, beforeTodoId, afterTodoId)

  return remainingTodos.toSpliced(insertionIndex, 0, movedTodo)
}

function getInsertionIndex(todos: Array<Todo>, beforeTodoId: number | undefined, afterTodoId: number | undefined) {
  if (afterTodoId !== undefined) {
    const afterIndex = todos.findIndex((todo) => todo.id === afterTodoId)
    return afterIndex === -1 ? todos.length : afterIndex
  }

  if (beforeTodoId !== undefined) {
    const beforeIndex = todos.findIndex((todo) => todo.id === beforeTodoId)
    return beforeIndex === -1 ? todos.length : beforeIndex + 1
  }

  return todos.length
}

function patchMovedTodoCache(
  bucketId: number,
  todos: Array<Todo>,
  movedTodo: Todo,
  affectedTodoPositions: Array<Pick<Todo, 'bucketId' | 'id' | 'position'>>,
) {
  const positionsById = new Map(affectedTodoPositions.map((todoPosition) => [todoPosition.id, todoPosition.position]))
  const patchedTodos = todos
    .filter((todo) => bucketId === movedTodo.bucketId || todo.id !== movedTodo.id)
    .map((todo) => {
      if (todo.id === movedTodo.id) {
        return movedTodo
      }

      const position = positionsById.get(todo.id)

      return position === undefined ? todo : { ...todo, position }
    })

  if (bucketId !== movedTodo.bucketId) {
    return patchedTodos.toSorted(compareTodoPosition)
  }

  if (!patchedTodos.some((todo) => todo.id === movedTodo.id)) {
    return [...patchedTodos, movedTodo].toSorted(compareTodoPosition)
  }

  return patchedTodos.toSorted(compareTodoPosition)
}

function compareTodoPosition(left: Todo, right: Todo) {
  return left.position - right.position || left.id - right.id
}

function getAffectedBucketIds(targetBucketId: number, sourceBucketId: number | undefined) {
  return [...new Set([sourceBucketId, targetBucketId].filter((bucketId): bucketId is number => bucketId !== undefined))]
}
