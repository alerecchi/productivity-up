import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Board } from '@/features/board/components/board'
import { BOARD_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { Bucket } from '@/lib/types/Bucket'
import type { BucketDb } from '@/server/db/types'
import {
  completeDay,
  confirmMigrationStep,
  getBoard,
  getMigrationStep,
  reconcileLifecycle,
} from '@/server/functions/board'
import { createTestQueryClient, render } from '@/test'

vi.mock('@/features/board/components/bucket-column', () => ({
  BucketColumn: ({ bucket, isPlanningBucket }: { bucket: Bucket; isPlanningBucket?: boolean }) => (
    <section aria-label={`${bucket.type} Bucket`} data-planning-bucket={isPlanningBucket} />
  ),
}))

vi.mock('@/features/board/components/todo-drag-drop-provider', () => ({
  TodoDragDropProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/server/functions/board', () => ({
  confirmMigrationStep: vi.fn(),
  completeDay: vi.fn(),
  getBoard: vi.fn(),
  getBuckets: vi.fn(),
  getMigrationStep: vi.fn(),
  reconcileLifecycle: vi.fn(),
}))

vi.mock('@/server/functions/todos', () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getTodos: vi.fn(() => Promise.resolve([])),
  moveTodo: vi.fn(),
  updateTodo: vi.fn(),
}))

const toast = vi.hoisted(() => ({
  error: vi.fn(),
}))

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast,
}))

const todayBuckets = [
  createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
  createBucket({ id: 2, period: '2026', type: 'yearly' }),
  createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
  createBucket({ id: 4, period: '2026-W27', type: 'weekly' }),
  createBucket({ id: 5, period: '2026-07-03', type: 'daily' }),
] satisfies Array<BucketDb>

const tomorrowBuckets = [
  todayBuckets[0],
  todayBuckets[1],
  todayBuckets[2],
  todayBuckets[3],
  createBucket({ id: 6, period: '2026-07-04', type: 'daily' }),
] satisfies Array<BucketDb>

const mockedCompleteDay = vi.mocked(completeDay)
const mockedConfirmMigrationStep = vi.mocked(confirmMigrationStep)
const mockedGetBoard = vi.mocked(getBoard)
const mockedGetMigrationStep = vi.mocked(getMigrationStep)
const mockedReconcileLifecycle = vi.mocked(reconcileLifecycle)

describe('Board lifecycle controls', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-03T15:30:00.000Z'))
    mockedCompleteDay.mockReset()
    mockedConfirmMigrationStep.mockReset()
    mockedGetBoard.mockReset()
    mockedGetMigrationStep.mockReset()
    mockedReconcileLifecycle.mockReset()
    navigate.mockReset()
    toast.error.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the Completion Recap after completing an all-done day', async () => {
    mockedCompleteDay.mockResolvedValue({
      buckets: tomorrowBuckets,
      planningDate: '2026-07-04',
      recap: {
        completedCount: 2,
        incompleteCount: 0,
        kind: 'all_complete',
      },
      status: 'completed',
      timeZone: 'Europe/Berlin',
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], {
      buckets: todayBuckets,
      planningDate: '2026-07-03',
      status: 'ready',
      timeZone: 'Europe/Berlin',
    })

    render(<Board />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Complete day' }))

    expect(await screen.findByRole('heading', { name: '2026-07-03 is wrapped' })).toBeInTheDocument()
    expect(screen.getByText('Review ended buckets')).toBeInTheDocument()
    expect(screen.getByText('No migration needed')).toBeInTheDocument()
    expect(screen.getByText('Open the board')).toBeInTheDocument()
    expect(screen.getByText('2 completed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue to migration' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close and plan tomorrow' }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '2026-07-03 is wrapped' })).not.toBeInTheDocument()
    })
    expect(mockedCompleteDay).toHaveBeenCalledWith({ data: { planningDate: '2026-07-03' } })
  })

  it('shows the Migration Recap immediately from the Complete day response when migration is required', async () => {
    const pendingBucket = createBucket({
      id: 7,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })
    mockedCompleteDay.mockResolvedValue({
      buckets: tomorrowBuckets,
      migrationRecap: {
        bucketBreakdown: [{ bucket: pendingBucket, completedCount: 1, incompleteCount: 2 }],
        completedCount: 1,
        incompleteCount: 2,
      },
      pendingMigrationBuckets: [pendingBucket],
      planningDate: '2026-07-04',
      status: 'migration_required',
      timeZone: 'Europe/Berlin',
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], {
      buckets: todayBuckets,
      planningDate: '2026-07-03',
      status: 'ready',
      timeZone: 'Europe/Berlin',
    })

    render(<Board />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Complete day' }))

    expect(await screen.findByRole('heading', { name: 'Migration required' })).toBeInTheDocument()
    expect(screen.getByText('Migrate unfinished todos')).toBeInTheDocument()
    expect(screen.getByText('1 completed')).toBeInTheDocument()
    expect(screen.getByText('2 incomplete')).toBeInTheDocument()
    expect(screen.getByText('Daily 2026-07-03')).toBeInTheDocument()
    expect(mockedGetMigrationStep).not.toHaveBeenCalled()
  })

  it('disables Complete day with planning-ahead feedback when Planning Date is tomorrow', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], {
      buckets: tomorrowBuckets,
      planningDate: '2026-07-04',
      status: 'ready',
      timeZone: 'Europe/Berlin',
    })

    render(<Board />, { queryClient })

    expect(screen.getByText('Planning tomorrow')).toBeInTheDocument()
    expect(screen.getAllByText('Complete day is disabled while planning ahead.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Complete day' })).toBeDisabled()
    expect(screen.getByLabelText('inbox Bucket')).toHaveAttribute('data-planning-bucket', 'false')
    expect(screen.getByLabelText('yearly Bucket')).toHaveAttribute('data-planning-bucket', 'true')
    expect(screen.getByLabelText('monthly Bucket')).toHaveAttribute('data-planning-bucket', 'true')
    expect(screen.getByLabelText('weekly Bucket')).toHaveAttribute('data-planning-bucket', 'true')
    expect(screen.getByLabelText('daily Bucket')).toHaveAttribute('data-planning-bucket', 'true')
  })

  it('runs Lifecycle Reconciliation when the board asks for it and shows the reconciled board', async () => {
    const reconciledBoard = {
      buckets: todayBuckets,
      planningDate: '2026-07-03',
      status: 'ready' as const,
      timeZone: 'Europe/Berlin',
    }
    mockedReconcileLifecycle.mockResolvedValue(reconciledBoard)
    mockedGetBoard.mockResolvedValue(reconciledBoard)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], { status: 'reconciliation_required' })

    render(<Board />, { queryClient })

    expect(await screen.findByRole('region', { name: 'daily Bucket' })).toBeInTheDocument()
    expect(screen.getByText('Planning today')).toBeInTheDocument()
    expect(mockedReconcileLifecycle).toHaveBeenCalledTimes(1)
  })

  it('offers a retry when Lifecycle Reconciliation fails', async () => {
    const reconciledBoard = {
      buckets: todayBuckets,
      planningDate: '2026-07-03',
      status: 'ready' as const,
      timeZone: 'Europe/Berlin',
    }
    mockedReconcileLifecycle.mockRejectedValueOnce(new Error('Network down')).mockResolvedValue(reconciledBoard)
    mockedGetBoard.mockResolvedValue(reconciledBoard)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], { status: 'reconciliation_required' })

    render(<Board />, { queryClient })

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('region', { name: 'daily Bucket' })).toBeInTheDocument()
  })

  it('shows toast feedback when Complete day fails', async () => {
    mockedCompleteDay.mockRejectedValue(new Error('Cannot complete day while Todos are incomplete'))
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], {
      buckets: todayBuckets,
      planningDate: '2026-07-03',
      status: 'ready',
      timeZone: 'Europe/Berlin',
    })

    render(<Board />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Complete day' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Cannot complete day while Todos are incomplete')
    })
    expect(screen.queryByRole('heading', { name: 'Day complete' })).not.toBeInTheDocument()
  })

  it('shows an undismissable Migration Recap dialog over a blurred board when migration is required', async () => {
    const pendingBucket = createBucket({
      id: 7,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })
    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: tomorrowBuckets[4],
      completedCount: 1,
      flowRecap: {
        bucketBreakdown: [{ bucket: pendingBucket, completedCount: 1, incompleteCount: 2 }],
        completedCount: 1,
        incompleteCount: 2,
      },
      incompleteCount: 2,
      moveBackDestination: tomorrowBuckets[3],
      pendingMigrationBuckets: [pendingBucket],
      sourceBucket: pendingBucket,
      todos: [],
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], {
      buckets: tomorrowBuckets,
      pendingMigrationBuckets: [pendingBucket],
      planningDate: '2026-07-04',
      status: 'migration_required',
      timeZone: 'Europe/Berlin',
    })

    render(<Board />, { queryClient })

    expect(screen.getByRole('heading', { name: 'Migration required' })).toBeInTheDocument()
    expect(screen.getByText('Preparing migration')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to migration' })).toBeDisabled()
    expect(await screen.findByRole('heading', { name: 'Migration required' })).toBeInTheDocument()
    expect(screen.getByText('Review ended buckets')).toBeInTheDocument()
    expect(await screen.findByText('Migrate unfinished todos')).toBeInTheDocument()
    expect(screen.getByText('Open the board')).toBeInTheDocument()
    expect(screen.getByText('1 completed')).toBeInTheDocument()
    expect(screen.getByText('2 incomplete')).toBeInTheDocument()
    expect(screen.getByText('Daily 2026-07-03')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to migration' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-todo-board]')).toHaveClass('blur-sm')
    expect(mockedConfirmMigrationStep).not.toHaveBeenCalled()
  })

  it('shows a retry action when the pending Migration Recap cannot load its Migration Step', async () => {
    const pendingBucket = createBucket({
      id: 7,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })
    mockedGetMigrationStep.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue({
      carryForwardDestination: tomorrowBuckets[4],
      completedCount: 0,
      flowRecap: {
        bucketBreakdown: [{ bucket: pendingBucket, completedCount: 0, incompleteCount: 1 }],
        completedCount: 0,
        incompleteCount: 1,
      },
      incompleteCount: 1,
      moveBackDestination: tomorrowBuckets[3],
      pendingMigrationBuckets: [pendingBucket],
      sourceBucket: pendingBucket,
      todos: [],
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], {
      buckets: tomorrowBuckets,
      pendingMigrationBuckets: [pendingBucket],
      planningDate: '2026-07-04',
      status: 'migration_required',
      timeZone: 'Europe/Berlin',
    })

    render(<Board />, { queryClient })

    expect(await screen.findByRole('heading', { name: 'Migration could not load' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry migration' }))

    expect(await screen.findByRole('heading', { name: 'Migration required' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to migration' })).toBeEnabled()
  })
})

function createBucket({
  id,
  period,
  status = 'active',
  type,
}: Pick<Bucket, 'id' | 'period' | 'type'> & { status?: BucketDb['status'] }): BucketDb {
  return {
    archivedAt: null,
    createdAt: new Date('2026-07-03T08:00:00.000Z'),
    id,
    period,
    status,
    type,
    userId: 'user-1',
  }
}
