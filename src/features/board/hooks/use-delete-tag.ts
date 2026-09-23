import { useMutation, useQueryClient } from '@tanstack/react-query'

import { TAGS_QUERY_KEY, TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { TagDisplay } from '@/lib/types/Tag'
import type { Todo } from '@/lib/types/Todo'
import { deleteTag } from '@/server/functions/tags'

export default function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTag,
    onSuccess: (deletedTag) => {
      queryClient.setQueryData<Array<TagDisplay>>([TAGS_QUERY_KEY], (old = []) =>
        old.filter((tag) => tag.id !== deletedTag.tagId),
      )
      queryClient.setQueriesData<Array<Todo>>({ queryKey: [TODOS_QUERY_KEY] }, (old = []) =>
        old.map((todo) => ({
          ...todo,
          tags: todo.tags.filter((tag) => tag.id !== deletedTag.tagId),
        })),
      )
    },
  })
}
