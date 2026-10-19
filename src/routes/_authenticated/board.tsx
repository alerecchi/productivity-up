import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { redirectIfNotAuthenticated } from '@/features/authentication/utils/redirects'
import { Board } from '@/features/board/components/board'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'

// PROTOTYPE: `variant` switches between the board prototypes (see features/board/prototype/variants.tsx).
const BoardSearchSchema = z.object({ variant: z.enum(['A', 'B', 'C']).optional().catch(undefined) })

export const Route = createFileRoute('/_authenticated/board')({
  validateSearch: BoardSearchSchema,
  ssr: false,
  beforeLoad: ({ context, location }) => {
    redirectIfNotAuthenticated(context.user, location.href)
  },
  loader: ({ context }) => context.queryClient.fetchQuery(getBoardQueryOptions),
  component: RouteComponent,
})

function RouteComponent() {
  const { variant } = Route.useSearch()
  return <Board variant={variant} />
}
