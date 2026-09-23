import { useMutation, useQueryClient } from '@tanstack/react-query'

import { CATEGORIES_QUERY_KEY, TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { CategoryDisplay } from '@/lib/types/Category'
import type { Todo } from '@/lib/types/Todo'
import { deleteCategory } from '@/server/functions/categories'

export default function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: (deletedCategory) => {
      queryClient.setQueryData<Array<CategoryDisplay>>([CATEGORIES_QUERY_KEY], (old = []) =>
        old.filter((category) => category.id !== deletedCategory.categoryId),
      )
      queryClient.setQueriesData<Array<Todo>>({ queryKey: [TODOS_QUERY_KEY] }, (old = []) =>
        old.map((todo) =>
          todo.category?.id === deletedCategory.categoryId
            ? {
                ...todo,
                category: null,
                categoryId: null,
              }
            : todo,
        ),
      )
    },
  })
}
