import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MigrationFlow } from '@/features/board/components/migration-flow'
import type { BucketDb } from '@/server/db/types'
import { confirmMigrationStep, getMigrationStep } from '@/server/functions/board'
import { render } from '@/test'

vi.mock('@/server/functions/board', () => ({
  confirmMigrationStep: vi.fn(),
  getMigrationStep: vi.fn(),
}))

const toast = vi.hoisted(() => ({
  error: vi.fn(),
}))

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast,
}))

const mockedConfirmMigrationStep = vi.mocked(confirmMigrationStep)
const mockedGetMigrationStep = vi.mocked(getMigrationStep)

describe('MigrationFlow', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    mockedConfirmMigrationStep.mockReset()
    mockedGetMigrationStep.mockReset()
    toast.error.mockReset()
  })

  it('shows one aggregate Completion Recap before a multi-step Migration Flow with progress and upcoming Buckets', async () => {
    const dailyBucket = createBucket({
      id: 10,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })
    const weeklyBucket = createBucket({
      id: 11,
      period: '2026-W27',
      status: 'pending_migration',
      type: 'weekly',
    })
    const monthlyBucket = createBucket({
      id: 12,
      period: '2026-06',
      status: 'pending_migration',
      type: 'monthly',
    })

    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
      completedCount: 1,
      flowRecap: {
        bucketBreakdown: [
          { bucket: dailyBucket, completedCount: 1, incompleteCount: 2 },
          { bucket: weeklyBucket, completedCount: 3, incompleteCount: 1 },
          { bucket: monthlyBucket, completedCount: 0, incompleteCount: 4 },
        ],
        completedCount: 4,
        incompleteCount: 7,
      },
      incompleteCount: 2,
      moveBackDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      pendingMigrationBuckets: [dailyBucket, weeklyBucket, monthlyBucket],
      sourceBucket: dailyBucket,
      todos: [createTodo({ bucketId: dailyBucket.id, id: 20, title: 'Carry draft onward' })],
    })

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow />
      </Suspense>,
    )

    expect(await screen.findByRole('heading', { name: 'Completion Recap' })).toBeInTheDocument()
    expect(screen.getByText('4 completed')).toBeInTheDocument()
    expect(screen.getByText('7 incomplete')).toBeInTheDocument()
    expect(screen.getByText('Daily 2026-07-03')).toBeInTheDocument()
    expect(screen.getByText('1 completed, 2 incomplete')).toBeInTheDocument()
    expect(screen.getByText('Weekly 2026-W27')).toBeInTheDocument()
    expect(screen.getByText('3 completed, 1 incomplete')).toBeInTheDocument()
    expect(screen.getByText('Monthly 2026-06')).toBeInTheDocument()
    expect(screen.getByText('0 completed, 4 incomplete')).toBeInTheDocument()
    expect(screen.queryByText('Carry draft onward')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start migration' }))

    expect(screen.getByRole('heading', { name: 'Daily 2026-07-03' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Up next: Weekly 2026-W27, Monthly 2026-06')).toBeInTheDocument()
    expect(screen.getByText('Carry draft onward')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Completion Recap' })).not.toBeInTheDocument()
  })

  it('advances to the next unresolved Migration Step without showing another Completion Recap', async () => {
    const dailyBucket = createBucket({
      id: 10,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })
    const weeklyBucket = createBucket({
      id: 11,
      period: '2026-W27',
      status: 'pending_migration',
      type: 'weekly',
    })

    mockedGetMigrationStep
      .mockResolvedValueOnce({
        carryForwardDestination: createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
        completedCount: 0,
        flowRecap: {
          bucketBreakdown: [
            { bucket: dailyBucket, completedCount: 0, incompleteCount: 1 },
            { bucket: weeklyBucket, completedCount: 2, incompleteCount: 1 },
          ],
          completedCount: 2,
          incompleteCount: 2,
        },
        incompleteCount: 1,
        moveBackDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
        pendingMigrationBuckets: [dailyBucket, weeklyBucket],
        sourceBucket: dailyBucket,
        todos: [createTodo({ bucketId: dailyBucket.id, id: 20, title: 'Daily carry' })],
      })
      .mockResolvedValue({
        carryForwardDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
        completedCount: 2,
        flowRecap: {
          bucketBreakdown: [{ bucket: weeklyBucket, completedCount: 2, incompleteCount: 1 }],
          completedCount: 2,
          incompleteCount: 1,
        },
        incompleteCount: 1,
        moveBackDestination: createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
        pendingMigrationBuckets: [weeklyBucket],
        sourceBucket: weeklyBucket,
        todos: [createTodo({ bucketId: weeklyBucket.id, id: 21, title: 'Weekly move' })],
      })
    mockedConfirmMigrationStep.mockResolvedValue({
      board: {
        buckets: [
          createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
          createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
          createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
          createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
        ],
        pendingMigrationBuckets: [weeklyBucket],
        planningDate: '2026-07-04',
        status: 'migration_required',
        timeZone: 'Europe/Berlin',
      },
      migratedTodoPositions: [{ bucketId: 5, id: 20, position: 1024 }],
      status: 'confirmed',
    })

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow />
      </Suspense>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Start migration' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm choices' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Weekly 2026-W27' })).toBeInTheDocument()
    })
    expect(screen.getByText('Step 1 of 1')).toBeInTheDocument()
    expect(screen.getByText('This is the last Pending Migration Bucket.')).toBeInTheDocument()
    expect(screen.getByText('Weekly move')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Completion Recap' })).not.toBeInTheDocument()
  })

  it('resumes after refresh at the next unresolved Migration Step without repeating the Completion Recap', async () => {
    const dailyBucket = createBucket({
      id: 10,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })
    const weeklyBucket = createBucket({
      id: 11,
      period: '2026-W27',
      status: 'pending_migration',
      type: 'weekly',
    })
    mockedGetMigrationStep.mockResolvedValueOnce({
      carryForwardDestination: createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
      completedCount: 0,
      flowRecap: {
        bucketBreakdown: [
          { bucket: dailyBucket, completedCount: 0, incompleteCount: 1 },
          { bucket: weeklyBucket, completedCount: 2, incompleteCount: 1 },
        ],
        completedCount: 2,
        incompleteCount: 2,
      },
      incompleteCount: 1,
      moveBackDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      pendingMigrationBuckets: [dailyBucket, weeklyBucket],
      sourceBucket: dailyBucket,
      todos: [createTodo({ bucketId: dailyBucket.id, id: 20, title: 'Daily carry' })],
    })
    mockedConfirmMigrationStep.mockResolvedValue({
      board: {
        buckets: [
          createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
          createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
          createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
          createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
        ],
        pendingMigrationBuckets: [weeklyBucket],
        planningDate: '2026-07-04',
        status: 'migration_required',
        timeZone: 'Europe/Berlin',
      },
      migratedTodoPositions: [{ bucketId: 5, id: 20, position: 1024 }],
      status: 'confirmed',
    })

    const { unmount } = render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow />
      </Suspense>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Start migration' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm choices' }))

    await waitFor(() => {
      expect(mockedConfirmMigrationStep).toHaveBeenCalledWith({
        data: {
          decisions: {
            20: 'carry_forward',
          },
          sourceBucketId: 10,
        },
      })
    })
    unmount()

    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      completedCount: 2,
      flowRecap: {
        bucketBreakdown: [{ bucket: weeklyBucket, completedCount: 2, incompleteCount: 1 }],
        completedCount: 2,
        incompleteCount: 1,
      },
      incompleteCount: 1,
      moveBackDestination: createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
      pendingMigrationBuckets: [weeklyBucket],
      sourceBucket: weeklyBucket,
      todos: [createTodo({ bucketId: weeklyBucket.id, id: 21, title: 'Weekly move' })],
    })

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow />
      </Suspense>,
    )

    expect(await screen.findByRole('heading', { name: 'Weekly 2026-W27' })).toBeInTheDocument()
    expect(screen.getByText('Weekly move')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Completion Recap' })).not.toBeInTheDocument()
  })
})

function createBucket({
  id,
  period,
  status = 'active',
  type,
}: Pick<BucketDb, 'id' | 'period' | 'type'> & { status?: BucketDb['status'] }): BucketDb {
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

function createTodo({ bucketId, id, title }: { bucketId: number; id: number; title: string }) {
  return {
    bucketId,
    category: null,
    categoryId: null,
    completed: false,
    createdAt: new Date('2026-07-03T08:30:00.000Z'),
    description: '',
    id,
    position: id * 1024,
    tags: [],
    title,
    userId: 'user-1',
  }
}
