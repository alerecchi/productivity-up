import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Board } from '@/features/board/components/board'
import { BOARD_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { Bucket } from '@/lib/types/Bucket'
import type { BucketDb } from '@/server/db/types'
import { completeDay, confirmMigrationStep, getMigrationStep } from '@/server/functions/board'
import { createTestQueryClient, render } from '@/test'

vi.mock('@/features/board/components/bucket-column', () => ({
  BucketColumn: ({ bucket }: { bucket: Bucket }) => <section aria-label={`${bucket.type} Bucket`} />,
}))

vi.mock('@/features/board/components/todo-drag-drop-provider', () => ({
  TodoDragDropProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/server/functions/board', () => ({
  confirmMigrationStep: vi.fn(),
  completeDay: vi.fn(),
  getBoard: vi.fn(),
  getBuckets: vi.fn(),
  getMigrationStep: vi.fn(),
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
const mockedGetMigrationStep = vi.mocked(getMigrationStep)

describe('Board lifecycle controls', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-03T15:30:00.000Z'))
    mockedCompleteDay.mockReset()
    mockedConfirmMigrationStep.mockReset()
    mockedGetMigrationStep.mockReset()
    toast.error.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows and dismisses the all-complete Completion Recap after completing the day', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Day complete' })).toBeInTheDocument()
    expect(screen.getByText('2 completed')).toBeInTheDocument()
    expect(screen.queryByText(/migrate/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close recap' }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Day complete' })).not.toBeInTheDocument()
    })
    expect(mockedCompleteDay).toHaveBeenCalledWith()
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

  it('gates the board behind a Migration Step until every incomplete Todo has a decision', async () => {
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
      todos: [
        createTodo({ bucketId: 7, id: 20, title: 'Move this back' }),
        createTodo({
          bucketId: 7,
          category: { colorKey: 'blue', id: 1, name: 'Work' },
          id: 21,
          tags: [{ colorKey: 'green', id: 2, name: 'focus' }],
          title: 'Carry this forward',
        }),
      ],
    })
    mockedConfirmMigrationStep.mockResolvedValue({
      board: {
        buckets: tomorrowBuckets,
        planningDate: '2026-07-04',
        status: 'ready',
        timeZone: 'Europe/Berlin',
      },
      migratedTodoPositions: [
        { bucketId: 4, id: 20, position: 2048 },
        { bucketId: 6, id: 21, position: 1024 },
      ],
      status: 'confirmed',
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

    expect(await screen.findByRole('heading', { name: 'Completion Recap' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Todo Buckets board')).not.toBeInTheDocument()
    expect(screen.getByText('1 completed')).toBeInTheDocument()
    expect(screen.getByText('2 incomplete')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start migration' }))

    expect(screen.getByRole('heading', { name: 'Migration required' })).toBeInTheDocument()
    expect(screen.getByText('Move this back')).toBeInTheDocument()
    expect(screen.getByText('Carry this forward')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('focus')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm choices' })).toBeDisabled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Move back' })[0])
    expect(screen.getByRole('button', { name: 'Confirm choices' })).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Carry forward' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Confirm choices' }))

    await waitFor(() => {
      expect(mockedConfirmMigrationStep).toHaveBeenCalledWith({
        data: {
          decisions: {
            20: 'move_back',
            21: 'carry_forward',
          },
          sourceBucketId: 7,
        },
      })
    })
    expect(queryClient.getQueryData([BOARD_QUERY_KEY])).toMatchObject({
      planningDate: '2026-07-04',
      status: 'ready',
    })
    expect(await screen.findByLabelText('Todo Buckets board')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /migration complete/i })).not.toBeInTheDocument()
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

function createTodo({
  bucketId,
  category = null,
  id,
  tags = [],
  title,
}: {
  bucketId: number
  category?: {
    colorKey: 'blue'
    id: number
    name: string
  } | null
  id: number
  tags?: Array<{
    colorKey: 'green'
    id: number
    name: string
  }>
  title: string
}) {
  return {
    bucketId,
    category,
    categoryId: category?.id ?? null,
    completed: false,
    createdAt: new Date('2026-07-03T08:30:00.000Z'),
    description: '',
    id,
    position: id * 1024,
    tags,
    title,
    userId: 'user-1',
  }
}
