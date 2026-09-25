import { Button } from '@/features/shared/components/ui/button'
import { Spinner } from '@/features/shared/components/ui/spinner'

type LifecycleReconciliationStatusProps = {
  isFailed: boolean
  retry: () => void
}

/** Placeholder shown while the board catches up to today's Planning Date. */
export function LifecycleReconciliationStatus({ isFailed, retry }: LifecycleReconciliationStatusProps) {
  return (
    <main className='flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-4 px-4'>
      {isFailed ? (
        <>
          <p className='text-sm text-muted-foreground'>Your board could not be updated for today.</p>
          <Button onClick={retry}>Retry</Button>
        </>
      ) : (
        <>
          <Spinner className='size-6' />
          <p className='text-sm text-muted-foreground'>Updating your board for today…</p>
        </>
      )}
    </main>
  )
}
