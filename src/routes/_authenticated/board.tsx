import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'
import { z } from 'zod'

import { redirectIfNotAuthenticated } from '@/features/authentication/utils/redirects'
import { Board } from '@/features/board/components/board'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'

// PROTOTYPE: /board?variant=<key> renders throwaway board variants instead of the real board (dev builds only).
const BoardPrototype = lazy(() =>
  import('@/features/board-prototype/board-prototype').then((module) => ({ default: module.BoardPrototype })),
)

export const Route = createFileRoute('/_authenticated/board')({
  ssr: false,
  validateSearch: z.object({ variant: z.string().optional() }),
  beforeLoad: ({ context, location }) => {
    redirectIfNotAuthenticated(context.user, location.href)
  },
  loader: ({ context }) => context.queryClient.fetchQuery(getBoardQueryOptions),
  component: RouteComponent,
})

function RouteComponent() {
  const { variant } = Route.useSearch()

  if (variant !== undefined && !import.meta.env.PROD) {
    return <BoardPrototype variant={variant} />
  }

  return <Board />
}
