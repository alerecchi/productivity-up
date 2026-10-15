import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { updateTag } from '@/server/functions/tags'

export default function useUpdateTag() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: updateTag,
    onError: (error) => {
      void cache.recover(error, { type: 'tags' })
    },
    onSuccess: async (tag) => {
      await cache.apply({ tag, type: 'tag-saved' })
    },
  })
}
