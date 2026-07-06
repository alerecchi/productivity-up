import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, Route as RouteIcon } from 'lucide-react'

import { MigrationFlow } from '@/features/board/components/migration-flow'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'
import { buttonVariants } from '@/features/shared/components/ui/button'

export function MigrationRouteContent() {
  const { data: board } = useSuspenseQuery(getBoardQueryOptions)

  if (board.status === 'migration_required') {
    return <MigrationFlow />
  }

  return (
    <main className='flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-muted/35 px-4 py-10'>
      <section className='w-full max-w-xl rounded-lg border border-border bg-background p-8 text-center'>
        <span className='mx-auto flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary'>
          <RouteIcon className='size-6' aria-hidden='true' />
        </span>
        <h1 className='mt-4 text-2xl font-semibold'>No migration needed</h1>
        <p className='mt-2 text-sm leading-6 text-muted-foreground'>Your board has no pending bucket migrations.</p>
        <a href='/board' className={buttonVariants({ className: 'mt-6' })}>
          <ArrowLeft aria-hidden='true' />
          Back to board
        </a>
      </section>
    </main>
  )
}
