import { createFileRoute } from '@tanstack/react-router'

import { redirectIfNotAuthenticated } from '@/features/authentication/utils/redirects'
import { MigrationRouteContent } from '@/features/board/components/migration-route-content'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'

export const Route = createFileRoute('/_authenticated/migration')({
  ssr: false,
  beforeLoad: ({ context, location }) => {
    redirectIfNotAuthenticated(context.user, location.href)
  },
  loader: ({ context }) => context.queryClient.fetchQuery(getBoardQueryOptions),
  component: MigrationRouteContent,
})
