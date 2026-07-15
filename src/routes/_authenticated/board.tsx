import { createFileRoute } from '@tanstack/react-router'

import { redirectIfNotAuthenticated } from '@/features/authentication/utils/redirects'
import { Board } from '@/features/board/components/board'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'

export const Route = createFileRoute('/_authenticated/board')({
  ssr: false,
  beforeLoad: ({ context, location }) => {
    redirectIfNotAuthenticated(context.user, location.href)
  },
  loader: ({ context }) => context.queryClient.fetchQuery(getBoardQueryOptions),
  component: RouteComponent,
})

function RouteComponent() {
  return <Board />
}
