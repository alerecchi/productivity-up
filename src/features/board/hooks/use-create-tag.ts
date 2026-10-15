import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { createTag } from '@/server/functions/tags'

export default function useCreateTag() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: createTag,
    onError: (error) => {
      void cache.recover(error, { type: 'tags' })
    },
    onSuccess: async (tag) => {
      await cache.apply({ tag, type: 'tag-saved' })
    },
  })
}
