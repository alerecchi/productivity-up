import { Spinner } from '@shared/components/ui/spinner'
import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

const emailVerifiedSearchSchema = z.object({
  error: z.string().optional(),
})

export const Route = createFileRoute('/_auth-pages/email-verified')({
  validateSearch: emailVerifiedSearchSchema,
  beforeLoad: ({ search }) => redirectAfterVerification({ search }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className='flex items-center justify-center gap-3 text-sm text-muted-foreground' aria-live='polite'>
      <Spinner />
      <span>Finishing verification...</span>
    </div>
  )
}

export function redirectAfterVerification({ search }: { search: z.infer<typeof emailVerifiedSearchSchema> }) {
  if (search.error) {
    throw redirect({ to: '/email-confirmation' })
  }

  throw redirect({ reloadDocument: true, to: '/board' })
}
