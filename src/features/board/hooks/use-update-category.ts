import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { updateCategory } from '@/server/functions/categories'

export default function useUpdateCategory() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: updateCategory,
    onError: (error) => {
      void cache.recover(error, { type: 'categories' })
    },
    onSuccess: async (category) => {
      await cache.apply({ category, type: 'category-saved' })
    },
  })
}
