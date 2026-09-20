import { useQueryClient } from '@tanstack/react-query'

import { createBoardCache } from '@/features/board/cache/board-cache'

export function useBoardCache() {
  return createBoardCache(useQueryClient())
}
