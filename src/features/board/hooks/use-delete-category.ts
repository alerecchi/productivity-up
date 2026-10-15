import { useMutation } from '@tanstack/react-query'

import { useBoardCache } from '@/features/board/cache'
import { deleteCategory } from '@/server/functions/categories'

export default function useDeleteCategory() {
  const cache = useBoardCache()

  return useMutation({
    mutationFn: deleteCategory,
    onError: (error) => {
      void cache.recover(error, { type: 'categories' })
    },
    onSuccess: async ({ categoryId }) => {
      await cache.apply({ categoryId, type: 'category-deleted' })
    },
  })
}
