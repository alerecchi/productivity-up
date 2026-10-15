import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { deleteTag } from '@/server/functions/tags'

export default function useDeleteTag() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: deleteTag,
    onError: (error) => {
      void cache.recover(error, { type: 'tags' })
    },
    onSuccess: async ({ tagId }) => {
      await cache.apply({ tagId, type: 'tag-deleted' })
    },
  })
}
