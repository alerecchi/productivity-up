import { Button } from '@/features/shared/components/ui/button'
import { Spinner } from '@/features/shared/components/ui/spinner'

type BoardInitializationStatusProps = {
  isFailed: boolean
  retry: () => void
}

/** Feedback while the User's first board is created, with recovery after a failed attempt. */
export function BoardInitializationStatus({ isFailed, retry }: BoardInitializationStatusProps) {
  return (
    <main className='flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-4 px-4'>
      {isFailed ? (
        <>
          <p role='alert' className='text-sm text-muted-foreground'>
            We could not create your board. Please try again.
          </p>
          <Button onClick={retry}>Retry</Button>
        </>
      ) : (
        <>
          <Spinner className='size-6' aria-hidden='true' />
          <p role='status' className='text-sm text-muted-foreground'>
            We are creating your board
          </p>
        </>
      )}
    </main>
  )
}
