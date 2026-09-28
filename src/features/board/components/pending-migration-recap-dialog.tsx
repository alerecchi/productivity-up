import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { BucketLifecycleRecapDialog } from '@/features/board/components/bucket-lifecycle-recap-dialog'
import { storeMigrationFlowStarted } from '@/features/board/lib/migration-flow-started'
import { getMigrationStepQueryOptions } from '@/features/board/queries/migration-queries'
import type { Bucket } from '@/lib/types/Bucket'

export type MigrationRecap = {
  bucketBreakdown: Array<{
    bucket: Pick<Bucket, 'id' | 'period' | 'type'>
    completedCount: number
    incompleteCount: number
  }>
  completedCount: number
  incompleteCount: number
}

type MigrationRecapDialogProps = {
  isLoading?: boolean
  onContinue: () => void
  pendingMigrationBuckets: Array<Pick<Bucket, 'id'>>
  recap?: MigrationRecap
}

export function MigrationRecapDialog({
  isLoading = false,
  onContinue,
  pendingMigrationBuckets,
  recap,
}: MigrationRecapDialogProps) {
  return (
    <BucketLifecycleRecapDialog
      actionDisabled={isLoading}
      actionLabel='Continue to migration'
      bucketBreakdown={recap?.bucketBreakdown}
      completedCount={recap?.completedCount ?? 0}
      headline='Migration required'
      incompleteCount={recap?.incompleteCount ?? 0}
      migrationStepDetail={
        isLoading
          ? 'Loading unfinished todos before migration.'
          : 'Pick carry forward or move back for each unfinished todo.'
      }
      migrationStepTitle={isLoading ? 'Preparing migration' : 'Migrate unfinished todos'}
      onAction={() => {
        if (isLoading) {
          return
        }

        storeMigrationFlowStarted(pendingMigrationBuckets)
        onContinue()
      }}
      open
    />
  )
}

/** Recaps the pending Migration Flow; `sourceBucketId` is the canonical board's next Pending Migration Bucket. */
export function PendingMigrationRecapDialog({ sourceBucketId }: { sourceBucketId: number }) {
  const navigate = useNavigate()
  const { data: step, isError, isPending, refetch } = useQuery(getMigrationStepQueryOptions(sourceBucketId))

  if (isError) {
    return (
      <BucketLifecycleRecapDialog
        actionLabel='Retry migration'
        completedCount={0}
        headline='Migration could not load'
        incompleteCount={0}
        migrationStepDetail='Try loading the unfinished todos again before continuing.'
        migrationStepTitle='Migration unavailable'
        onAction={() => {
          void refetch()
        }}
        open
        showCloseButton
      />
    )
  }

  if (isPending) {
    return <MigrationRecapDialog isLoading onContinue={() => undefined} pendingMigrationBuckets={[]} />
  }

  return (
    <MigrationRecapDialog
      onContinue={() => navigate({ to: '/migration' })}
      pendingMigrationBuckets={step.pendingMigrationBuckets}
      recap={step.flowRecap}
    />
  )
}
