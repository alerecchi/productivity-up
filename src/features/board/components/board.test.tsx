import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Board } from '@/features/board/components/board'
import { BOARD_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { Bucket } from '@/lib/types/Bucket'
import type { BucketDb } from '@/server/db/types'
import { completeDay } from '@/server/functions/board'
import { createTestQueryClient, render } from '@/test'

vi.mock('@/features/board/components/bucket-column', () => ({
  BucketColumn: ({ bucket }: { bucket: Bucket }) => <section aria-label={`${bucket.type} Bucket`} />,
}))

vi.mock('@/features/board/components/todo-drag-drop-provider', () => ({
  TodoDragDropProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/server/functions/board', () => ({
  completeDay: vi.fn(),
  getBoard: vi.fn(),
  getBuckets: vi.fn(),
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

describe('Board lifecycle controls', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-03T15:30:00.000Z'))
    mockedCompleteDay.mockReset()
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
})

function createBucket({ id, period, type }: Pick<Bucket, 'id' | 'period' | 'type'>): BucketDb {
  return {
    archivedAt: null,
    createdAt: new Date('2026-07-03T08:00:00.000Z'),
    id,
    period,
    status: 'active',
    type,
    userId: 'user-1',
  }
}
