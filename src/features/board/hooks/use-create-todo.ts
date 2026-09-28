import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { scrollBucketTodoListToEnd } from '@/features/board/lib/bucket-todo-list-scroll'
import { useRealtimeOriginHeaders } from '@/features/board/realtime'
import { createTodo } from '@/server/functions/todos'

export default function useCreateTodo() {
  const cache = useBoardCache()
  const headers = useRealtimeOriginHeaders()

  return useMutation({
    mutationFn: ({ data }: Parameters<typeof createTodo>[0]) => createTodo({ data, headers }),
    onError: (error, variables) => {
      void cache.recover(error, { bucketIds: [variables.data.bucketId], type: 'todos' })
    },
    onSuccess: async (todo) => {
      await cache.apply({ todo, type: 'todo-created' })
      scrollBucketTodoListToEnd(todo.bucketId)
    },
  })
}
