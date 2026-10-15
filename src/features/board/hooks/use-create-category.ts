import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { createCategory } from '@/server/functions/categories'

export default function useCreateCategory() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: createCategory,
    onError: (error) => {
      void cache.recover(error, { type: 'categories' })
    },
    onSuccess: async (category) => {
      await cache.apply({ category, type: 'category-saved' })
    },
  })
}
