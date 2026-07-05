import { Spinner } from '@shared/components/ui/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import z from 'zod'

import { userSessionQuery } from '@/features/authentication/queries/user-session'
import { BOARD_QUERY_KEY, BUCKETS_QUERY_KEY, TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'

const emailVerifiedSearchSchema = z.object({
  error: z.string().optional(),
})

export const Route = createFileRoute('/_auth-pages/email-verified')({
  validateSearch: emailVerifiedSearchSchema,
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const router = useRouter()
  const search = Route.useSearch()

  useEffect(() => {
    async function refreshAfterVerification() {
      await queryClient.invalidateQueries({ queryKey: userSessionQuery.key })
      queryClient.removeQueries({ queryKey: [BOARD_QUERY_KEY] })
      queryClient.removeQueries({ queryKey: [BUCKETS_QUERY_KEY] })
      queryClient.removeQueries({ queryKey: [TODOS_QUERY_KEY] })

      await router.invalidate()

      if (search.error) {
        await navigate({ to: '/email-confirmation' })
        return
      }

      await queryClient.prefetchQuery(getBoardQueryOptions)
      await navigate({ to: '/board' })
    }

    void refreshAfterVerification()
  }, [navigate, queryClient, router, search.error])

  return (
    <div className='flex items-center justify-center gap-3 text-sm text-muted-foreground' aria-live='polite'>
      <Spinner />
      <span>Finishing verification...</span>
    </div>
  )
}
