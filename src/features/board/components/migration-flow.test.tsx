import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MigrationFlow } from '@/features/board/components/migration-flow'
import { storeMigrationFlowStarted } from '@/features/board/lib/migration-flow-started'
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
let onFlowComplete: ReturnType<typeof vi.fn<() => void>>

describe('MigrationFlow', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    onFlowComplete = vi.fn()
    mockedConfirmMigrationStep.mockReset()
    mockedGetMigrationStep.mockReset()
    toast.error.mockReset()
  })

  it('shows the first Migration Step with progress and upcoming Buckets', async () => {
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
    storeMigrationFlowStarted([dailyBucket, weeklyBucket, monthlyBucket])

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
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Place unfinished work' })).toBeInTheDocument()
    expect(screen.getByText('1 todo needs a new home')).toBeInTheDocument()
    expect(screen.getByText('0/1')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Up next: Weekly 2026-W27, Monthly 2026-06')).toBeInTheDocument()
    expect(screen.getByText('Carry draft onward')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Migration required' })).not.toBeInTheDocument()
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
    storeMigrationFlowStarted([dailyBucket, weeklyBucket])

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
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm choices' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Decide what moves on from Weekly 2026-W27.' })).toBeInTheDocument()
    })
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('This is the last Pending Migration Bucket.')).toBeInTheDocument()
    expect(screen.getByText('Weekly move')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Migration required' })).not.toBeInTheDocument()
    expect(onFlowComplete).not.toHaveBeenCalled()
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
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' }),
    ).toBeInTheDocument()
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
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Weekly 2026-W27.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Weekly move')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Migration required' })).not.toBeInTheDocument()
  })

  it('confirms Move all back only after the bulk confirmation dialog is accepted', async () => {
    const dailyBucket = createBucket({
      id: 10,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })

    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
      completedCount: 1,
      flowRecap: {
        bucketBreakdown: [{ bucket: dailyBucket, completedCount: 1, incompleteCount: 2 }],
        completedCount: 1,
        incompleteCount: 2,
      },
      incompleteCount: 2,
      moveBackDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      pendingMigrationBuckets: [dailyBucket],
      sourceBucket: dailyBucket,
      todos: [
        createTodo({ bucketId: dailyBucket.id, id: 20, title: 'Move first back' }),
        createTodo({ bucketId: dailyBucket.id, id: 21, title: 'Move second back' }),
      ],
    })
    mockedConfirmMigrationStep.mockResolvedValue({
      board: {
        buckets: [
          createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
          createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
          createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
        ],
        planningDate: '2026-07-04',
        status: 'ready',
        timeZone: 'Europe/Berlin',
      },
      migratedTodoPositions: [
        { bucketId: 4, id: 20, position: 1024 },
        { bucketId: 4, id: 21, position: 2048 },
      ],
      status: 'confirmed',
    })

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move all back' }))

    expect(screen.getByRole('dialog', { name: 'Move all back?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Move all back?' })).not.toBeInTheDocument()
    expect(mockedConfirmMigrationStep).not.toHaveBeenCalled()
    expect(screen.getByText('Move first back')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Move all back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm move all back' }))

    await waitFor(() => {
      expect(mockedConfirmMigrationStep).toHaveBeenCalledWith({
        data: {
          decisions: {
            20: 'move_back',
            21: 'move_back',
          },
          sourceBucketId: 10,
        },
      })
    })
    expect(onFlowComplete).toHaveBeenCalledTimes(1)
  })

  it('returns to the board after confirming individual choices for the final Migration Step', async () => {
    const dailyBucket = createBucket({
      id: 10,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })

    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
      completedCount: 0,
      flowRecap: {
        bucketBreakdown: [{ bucket: dailyBucket, completedCount: 0, incompleteCount: 1 }],
        completedCount: 0,
        incompleteCount: 1,
      },
      incompleteCount: 1,
      moveBackDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      pendingMigrationBuckets: [dailyBucket],
      sourceBucket: dailyBucket,
      todos: [createTodo({ bucketId: dailyBucket.id, id: 20, title: 'Finish final step' })],
    })
    mockedConfirmMigrationStep.mockResolvedValue({
      board: {
        buckets: [
          createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
          createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
          createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
        ],
        planningDate: '2026-07-04',
        status: 'ready',
        timeZone: 'Europe/Berlin',
      },
      migratedTodoPositions: [{ bucketId: 5, id: 20, position: 1024 }],
      status: 'confirmed',
    })

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm choices' }))

    await waitFor(() => {
      expect(onFlowComplete).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the final Migration Step visible when returning to the board fails', async () => {
    const dailyBucket = createBucket({
      id: 10,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })

    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
      completedCount: 0,
      flowRecap: {
        bucketBreakdown: [{ bucket: dailyBucket, completedCount: 0, incompleteCount: 1 }],
        completedCount: 0,
        incompleteCount: 1,
      },
      incompleteCount: 1,
      moveBackDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      pendingMigrationBuckets: [dailyBucket],
      sourceBucket: dailyBucket,
      todos: [createTodo({ bucketId: dailyBucket.id, id: 20, title: 'Retry leaving migration' })],
    })
    mockedConfirmMigrationStep.mockResolvedValue({
      board: {
        buckets: [
          createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
          createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
          createBucket({ id: 5, period: '2026-07-04', type: 'daily' }),
        ],
        planningDate: '2026-07-04',
        status: 'ready',
        timeZone: 'Europe/Berlin',
      },
      migratedTodoPositions: [{ bucketId: 5, id: 20, position: 1024 }],
      status: 'confirmed',
    })
    onFlowComplete.mockRejectedValue(new Error('Navigation failed'))

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm choices' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Navigation failed')
    })
    expect(screen.getByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' })).toBeInTheDocument()
  })

  it('confirms Carry all forward only after the bulk confirmation dialog is accepted', async () => {
    const weeklyBucket = createBucket({
      id: 11,
      period: '2026-W27',
      status: 'pending_migration',
      type: 'weekly',
    })

    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
      completedCount: 0,
      flowRecap: {
        bucketBreakdown: [{ bucket: weeklyBucket, completedCount: 0, incompleteCount: 2 }],
        completedCount: 0,
        incompleteCount: 2,
      },
      incompleteCount: 2,
      moveBackDestination: createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
      pendingMigrationBuckets: [weeklyBucket],
      sourceBucket: weeklyBucket,
      todos: [
        createTodo({ bucketId: weeklyBucket.id, id: 30, title: 'Carry first forward' }),
        createTodo({ bucketId: weeklyBucket.id, id: 31, title: 'Carry second forward' }),
      ],
    })
    mockedConfirmMigrationStep.mockResolvedValue({
      board: {
        buckets: [
          createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
          createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
          createBucket({ id: 4, period: '2026-W28', type: 'weekly' }),
        ],
        planningDate: '2026-07-04',
        status: 'ready',
        timeZone: 'Europe/Berlin',
      },
      migratedTodoPositions: [
        { bucketId: 4, id: 30, position: 1024 },
        { bucketId: 4, id: 31, position: 2048 },
      ],
      status: 'confirmed',
    })

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationFlow onFlowComplete={onFlowComplete} />
      </Suspense>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Weekly 2026-W27.' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Carry all forward' }))

    expect(screen.getByRole('dialog', { name: 'Carry all forward?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Carry all forward?' })).not.toBeInTheDocument()
    expect(mockedConfirmMigrationStep).not.toHaveBeenCalled()
    expect(screen.getByText('Carry first forward')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Carry all forward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm carry all forward' }))

    await waitFor(() => {
      expect(mockedConfirmMigrationStep).toHaveBeenCalledWith({
        data: {
          decisions: {
            30: 'carry_forward',
            31: 'carry_forward',
          },
          sourceBucketId: 11,
        },
      })
    })
    expect(onFlowComplete).toHaveBeenCalledTimes(1)
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
