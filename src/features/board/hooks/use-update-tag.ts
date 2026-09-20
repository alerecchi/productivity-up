import { useMutation, useQueryClient } from '@tanstack/react-query'

import { TAGS_QUERY_KEY, TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { TagDisplay } from '@/lib/types/Tag'
import type { Todo } from '@/lib/types/Todo'
import { updateTag } from '@/server/functions/tags'

export default function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateTag,
    onSuccess: (tag: TagDisplay) => {
      queryClient.setQueryData<Array<TagDisplay>>([TAGS_QUERY_KEY], (old = []) =>
        old
          .map((cachedTag) => (cachedTag.id === tag.id ? tag : cachedTag))
          .toSorted((a, b) => a.name.localeCompare(b.name)),
      )
      queryClient.setQueriesData<Array<Todo>>({ queryKey: [TODOS_QUERY_KEY] }, (old = []) =>
        old.map((todo) => ({
          ...todo,
          tags: todo.tags.map((todoTag) =>
            todoTag.id === tag.id
              ? {
                  colorKey: tag.colorKey,
                  id: tag.id,
                  name: tag.name,
                }
              : todoTag,
          ),
        })),
      )
    },
  })
}
