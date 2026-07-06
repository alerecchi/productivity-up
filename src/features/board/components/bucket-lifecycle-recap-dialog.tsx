import { ArrowRight, CheckCircle2, ClipboardCheck, ListChecks, Sunrise } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/features/shared/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/features/shared/components/ui/dialog'
import { cn } from '@/features/shared/utils/tailwind'
import type { Bucket } from '@/lib/types/Bucket'

type BucketRecapRow = {
  bucket: Pick<Bucket, 'id' | 'period' | 'type'>
  completedCount: number
  incompleteCount: number
}

type BucketLifecycleRecapDialogProps = {
  actionDisabled?: boolean
  actionLabel: string
  bucketBreakdown?: Array<BucketRecapRow>
  completedCount: number
  headline: string
  incompleteCount: number
  migrationStepDetail: string
  migrationStepTitle: string
  onAction: () => void
  open: boolean
  showCloseButton?: boolean
}

export function BucketLifecycleRecapDialog({
  actionDisabled = false,
  actionLabel,
  bucketBreakdown = [],
  completedCount,
  headline,
  incompleteCount,
  migrationStepDetail,
  migrationStepTitle,
  onAction,
  open,
  showCloseButton = false,
}: BucketLifecycleRecapDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && showCloseButton && !actionDisabled) {
          onAction()
        }
      }}
    >
      <DialogContent className='max-w-3xl sm:max-w-3xl' showCloseButton={showCloseButton}>
        <div className='text-center'>
          <div className='mx-auto flex size-14 items-center justify-center rounded-full bg-sky-100 text-sky-700'>
            <Sunrise className='size-7' aria-hidden='true' />
          </div>
          <h2 className='mt-4 text-2xl font-semibold'>{headline}</h2>
          <p className='mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground'>
            Review the bucket lifecycle before moving on.
          </p>
        </div>

        <div className='relative mx-auto flex w-full max-w-xl flex-col gap-3'>
          <TimelineStep
            active
            icon={<ClipboardCheck aria-hidden='true' />}
            title='Review ended buckets'
            detail='Capture the close of each bucket before choosing what happens next.'
            summary={<ReviewSummary completedCount={completedCount} incompleteCount={incompleteCount} />}
          />
          <TimelineStep
            active={incompleteCount > 0}
            icon={<ListChecks aria-hidden='true' />}
            title={migrationStepTitle}
            detail={migrationStepDetail}
          />
          <TimelineStep
            active
            icon={<ArrowRight aria-hidden='true' />}
            title='Open the board'
            detail='The board opens after this lifecycle step is resolved.'
          />
        </div>

        {bucketBreakdown.length > 0 ? (
          <div className='mx-auto w-full max-w-xl divide-y rounded-lg border border-border'>
            {bucketBreakdown.map((row) => (
              <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-4' key={row.bucket.id}>
                <h3 className='truncate text-sm font-medium'>{formatBucketName(row.bucket)}</h3>
                <p className='text-sm text-muted-foreground'>
                  {row.completedCount} completed, {row.incompleteCount} incomplete
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
            <ArrowRight aria-hidden='true' />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TimelineStep({
  active,
  detail,
  icon,
  summary,
  title,
}: {
  active: boolean
  detail: string
  icon: ReactNode
  summary?: ReactNode
  title: string
}) {
  return (
    <div className={cn('flex gap-3 rounded-lg border p-4', active ? 'bg-background' : 'bg-muted/60 opacity-60')}>
      <span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4'>
        {icon}
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <p className='text-sm font-semibold'>{title}</p>
            <p className='mt-1 text-sm text-muted-foreground'>{detail}</p>
          </div>
          {summary}
        </div>
      </div>
    </div>
  )
}

function ReviewSummary({ completedCount, incompleteCount }: { completedCount: number; incompleteCount: number }) {
  return (
    <div className='flex shrink-0 items-center gap-2'>
      <span className='inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800'>
        <CheckCircle2 className='size-3.5' aria-hidden='true' />
        {completedCount} completed
      </span>
      {incompleteCount > 0 ? (
        <span className='inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800'>
          <ListChecks className='size-3.5' aria-hidden='true' />
          {incompleteCount} incomplete
        </span>
      ) : null}
    </div>
  )
}

function formatBucketName(bucket: Pick<Bucket, 'period' | 'type'>) {
  if (bucket.type === 'inbox') {
    return 'Inbox'
  }

  return `${bucket.type[0].toUpperCase()}${bucket.type.slice(1)} ${bucket.period}`
}
