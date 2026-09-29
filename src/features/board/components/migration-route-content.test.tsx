import type { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanonicalBoard } from '@/features/board/cache'
import { MigrationRouteContent } from '@/features/board/components/migration-route-content'
import { getBoardQueryOptions } from '@/features/board/queries/todo-queries'
import type { Bucket } from '@/lib/types/Bucket'
import { getMigrationStep } from '@/server/functions/board'
import { createTestQueryClient, render } from '@/test'

vi.mock('@/server/functions/board', () => ({
  completeDay: vi.fn(),
  confirmMigrationStep: vi.fn(),
  getBoard: vi.fn(),
  getBuckets: vi.fn(),
  getMigrationStep: vi.fn(),
}))

vi.mock('@/server/functions/todos', () => ({
  getTodos: vi.fn(),
}))

const mockedGetMigrationStep = vi.mocked(getMigrationStep)

describe('MigrationRouteContent', () => {
  beforeEach(() => {
    mockedGetMigrationStep.mockReset()
  })

  it('shows a quiet empty state with a link back to the board when no Migration Flow is pending', () => {
    const queryClient = createTestQueryClient()
    setBoard(queryClient, {
      buckets: [
        createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ id: 2, period: '2026-07-04', type: 'daily' }),
      ],
      planningDate: '2026-07-04',
      status: 'ready',
      timeZone: 'Europe/Berlin',
    })

    render(<MigrationRouteContent />, { queryClient })

    expect(screen.getByRole('heading', { name: 'No migration needed' })).toBeInTheDocument()
    expect(screen.getByText('Your board has no pending bucket migrations.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to board' })).toHaveAttribute('href', '/board')
  })

  it('shows the Migration Flow when a pending migration exists', async () => {
    const pendingBucket = createBucket({
      id: 7,
      period: '2026-07-03',
      type: 'daily',
    })
    mockedGetMigrationStep.mockResolvedValue({
      carryForwardDestination: createBucket({ id: 8, period: '2026-07-04', type: 'daily' }),
      completedCount: 0,
      flowRecap: {
        bucketBreakdown: [{ bucket: pendingBucket, completedCount: 0, incompleteCount: 1 }],
        completedCount: 0,
        incompleteCount: 1,
      },
      incompleteCount: 1,
      moveBackDestination: createBucket({ id: 9, period: '2026-W28', type: 'weekly' }),
      pendingMigrationBuckets: [pendingBucket],
      sourceBucket: pendingBucket,
      todos: [],
    })
    const queryClient = createTestQueryClient()
    setBoard(queryClient, {
      buckets: [
        createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ id: 2, period: '2026-07-04', type: 'daily' }),
      ],
      pendingMigrationBuckets: [pendingBucket],
      planningDate: '2026-07-04',
      status: 'migration_required',
      timeZone: 'Europe/Berlin',
    })

    render(
      <Suspense fallback={<p>Loading migration</p>}>
        <MigrationRouteContent />
      </Suspense>,
      { queryClient },
    )

    expect(
      await screen.findByRole('heading', { name: 'Decide what moves on from Daily 2026-07-03.' }),
    ).toBeInTheDocument()
  })
})

function createBucket(bucket: Bucket): Bucket {
  return bucket
}

function setBoard(queryClient: QueryClient, board: CanonicalBoard) {
  queryClient.setQueryData(getBoardQueryOptions.queryKey, board)
}
