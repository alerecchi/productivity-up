import { act, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Board } from '@/features/board/components/board'
import { BucketColumn } from '@/features/board/components/bucket-column'
import { TodoDragDropProvider } from '@/features/board/components/todo-drag-drop-provider'
import { BOARD_QUERY_KEY, TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import type { Bucket } from '@/lib/types/Bucket'
import type { Todo } from '@/lib/types/Todo'
import { getTodos, moveTodo } from '@/server/functions/todos'
import { createTestQueryClient, render } from '@/test'

const dnd = vi.hoisted(() => ({
  activeDropTargetId: null as string | null,
  dragEnd: undefined as ((event: unknown) => void) | undefined,
  dragMove: undefined as ((event: unknown, manager: unknown) => void) | undefined,
}))

const toast = vi.hoisted(() => ({
  error: vi.fn(),
}))

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({
    children,
    onDragEnd,
    onDragMove,
  }: {
    children: ReactNode
    onDragEnd: (event: unknown) => void
    onDragMove?: (event: unknown, manager: unknown) => void
  }) => {
    dnd.dragEnd = onDragEnd
    dnd.dragMove = onDragMove

    return <>{children}</>
  },
  useDragOperation: () => ({
    source: null,
    target: dnd.activeDropTargetId ? { id: dnd.activeDropTargetId } : null,
  }),
  useDraggable: () => ({
    handleRef: vi.fn(),
    isDragSource: false,
    isDragging: false,
    isDropping: false,
    ref: vi.fn(),
  }),
  useDroppable: ({ id }: { id: string }) => ({
    isDropTarget: dnd.activeDropTargetId === id,
    ref: vi.fn(),
  }),
}))

vi.mock('@/server/functions/todos', () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  getTodos: vi.fn(() => Promise.resolve([])),
  moveTodo: vi.fn(),
  updateTodo: vi.fn(),
}))

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast,
}))

vi.mock('@/server/functions/board', () => ({
  getBoard: vi.fn(),
  getBuckets: vi.fn(),
}))

vi.mock('@/server/functions/categories', () => ({
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listCategories: vi.fn(() => Promise.resolve([])),
  updateCategory: vi.fn(),
}))

vi.mock('@/server/functions/tags', () => ({
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  listTags: vi.fn(() => Promise.resolve([])),
  updateTag: vi.fn(),
}))

const bucket = {
  id: 2,
  period: '2026-06-24',
  type: 'daily',
} satisfies Bucket

const destinationBucket = {
  id: 3,
  period: '2026-06',
  type: 'monthly',
} satisfies Bucket

const buckets = [bucket, destinationBucket] satisfies Array<Bucket>
const readyBoard = {
  buckets,
  planningDate: '2026-06-24',
  status: 'ready',
  timeZone: 'Europe/Berlin',
} as const

const todos = [
  createTodo({ id: 10, position: 1024, title: 'First todo' }),
  createTodo({ id: 20, position: 2048, title: 'Second todo' }),
  createTodo({ id: 30, position: 3072, title: 'Third todo' }),
] satisfies Array<Todo>

const destinationTodos = [
  createTodo({ bucketId: destinationBucket.id, id: 40, position: 1024, title: 'Destination first' }),
  createTodo({ bucketId: destinationBucket.id, id: 50, position: 2048, title: 'Destination second' }),
] satisfies Array<Todo>

const mockedMoveTodo = vi.mocked(moveTodo)
const mockedGetTodos = vi.mocked(getTodos)

beforeEach(() => {
  mockedGetTodos.mockReset()
  mockedGetTodos.mockResolvedValue([])
})

describe('Todo reordering within a Bucket', () => {
  beforeEach(() => {
    dnd.activeDropTargetId = null
    dnd.dragMove = undefined
    dnd.dragEnd = undefined
    mockedMoveTodo.mockReset()
    mockedMoveTodo.mockResolvedValue({
      affectedBucketIds: [bucket.id],
      affectedTodoPositions: [{ bucketId: bucket.id, id: todos[1].id, position: 512 }],
      todo: { ...todos[1], position: 512 },
    })
  })

  it('moves a Todo before the first Todo when dropped on the first insertion line', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)

    expect(screen.getByRole('button', { name: 'Drag Second todo' })).toBeInTheDocument()

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: todos[0].id,
              beforeTodoId: undefined,
              bucketId: bucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${bucket.id}-insertion-0`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(mockedMoveTodo).toHaveBeenCalledWith({
        data: {
          afterTodoId: todos[0].id,
          id: todos[1].id,
          targetBucketId: bucket.id,
        },
      })
    })
  })

  it('moves a Todo between neighboring Todos when dropped on a middle insertion line', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[0].id } },
          target: {
            data: {
              afterTodoId: todos[2].id,
              beforeTodoId: todos[1].id,
              bucketId: bucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${bucket.id}-insertion-2`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(mockedMoveTodo).toHaveBeenCalledWith({
        data: {
          afterTodoId: todos[2].id,
          beforeTodoId: todos[1].id,
          id: todos[0].id,
          targetBucketId: bucket.id,
        },
      })
    })
  })

  it('moves a Todo after the last Todo when dropped on the final insertion line', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)
    const bucketList = screen.getByRole('list', { name: 'Wednesday 24 Todos' })
    const scrollTo = vi.fn()
    Object.defineProperty(bucketList, 'scrollHeight', { value: 720 })
    bucketList.scrollTo = scrollTo
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[0].id } },
          target: {
            data: {
              afterTodoId: undefined,
              beforeTodoId: todos[2].id,
              bucketId: bucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${bucket.id}-insertion-3`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(mockedMoveTodo).toHaveBeenCalledWith({
        data: {
          beforeTodoId: todos[2].id,
          id: todos[0].id,
          targetBucketId: bucket.id,
        },
      })
    })
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 720 })

    vi.unstubAllGlobals()
  })

  it('does not move a Todo when dropped on the insertion line immediately before itself', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: todos[1].id,
              beforeTodoId: todos[0].id,
              bucketId: bucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${bucket.id}-insertion-1`,
          },
        },
      })
    })

    expect(mockedMoveTodo).not.toHaveBeenCalled()
    expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
      todos[0].id,
      todos[1].id,
      todos[2].id,
    ])
  })

  it('does not move a Todo when dropped on the insertion line immediately after itself', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: todos[2].id,
              beforeTodoId: todos[1].id,
              bucketId: bucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${bucket.id}-insertion-2`,
          },
        },
      })
    })

    expect(mockedMoveTodo).not.toHaveBeenCalled()
    expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
      todos[0].id,
      todos[1].id,
      todos[2].id,
    ])
  })

  it('updates the Bucket cache optimistically before the move finishes', async () => {
    let finishMove: ((todo: Awaited<ReturnType<typeof moveTodo>>) => void) | undefined
    mockedMoveTodo.mockReturnValue(
      new Promise((resolve) => {
        finishMove = resolve
      }),
    )
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: todos[0].id,
              beforeTodoId: undefined,
              bucketId: bucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${bucket.id}-insertion-0`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
        todos[1].id,
        todos[0].id,
        todos[2].id,
      ])
    })

    finishMove?.({
      affectedBucketIds: [bucket.id],
      affectedTodoPositions: [{ bucketId: bucket.id, id: todos[1].id, position: 512 }],
      todo: { ...todos[1], position: 512 },
    })
  })

  it('renders the optimistic order before the drag end handler returns', () => {
    mockedMoveTodo.mockReturnValue(new Promise(() => {}))
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)

    dnd.dragEnd?.({
      canceled: false,
      operation: {
        source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
        target: {
          data: {
            afterTodoId: todos[0].id,
            beforeTodoId: undefined,
            bucketId: bucket.id,
            kind: 'todo-insertion',
          },
          id: `bucket-${bucket.id}-insertion-0`,
        },
      },
    })

    expect(
      screen.getAllByRole('button', { name: /^Drag / }).map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Drag Second todo', 'Drag First todo', 'Drag Third todo'])
  })

  it('shows only the active horizontal insertion line as the drop-position indicator', () => {
    dnd.activeDropTargetId = `bucket-${bucket.id}-insertion-1`
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)

    renderBucket(bucket, queryClient)

    expect(screen.getByTestId(`bucket-${bucket.id}-insertion-0`)).toHaveAttribute('data-drop-target', 'false')
    expect(screen.getByTestId(`bucket-${bucket.id}-insertion-1`)).toHaveAttribute('data-drop-target', 'true')
    expect(screen.getByTestId(`bucket-${bucket.id}-insertion-2`)).toHaveAttribute('data-drop-target', 'false')
    expect(screen.getByTestId(`bucket-${bucket.id}-insertion-3`)).toHaveAttribute('data-drop-target', 'false')
    expect(screen.queryByTestId('todo-drop-placeholder')).not.toBeInTheDocument()
  })

  it('moves completed Todos with the same insertion-line anchors', async () => {
    const completedTodos = [todos[0], { ...todos[1], completed: true }, todos[2]]
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], completedTodos)

    renderBucket(bucket, queryClient)

    expect(screen.getByRole('button', { name: 'Drag Second todo' })).toBeInTheDocument()

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: undefined,
              beforeTodoId: todos[2].id,
              bucketId: bucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${bucket.id}-insertion-3`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(mockedMoveTodo).toHaveBeenCalledWith({
        data: {
          beforeTodoId: todos[2].id,
          id: todos[1].id,
          targetBucketId: bucket.id,
        },
      })
    })
  })
})

describe('Bucket column layout', () => {
  it('keeps Buckets readable in a horizontally scrolling board with independently scrolling Todo lists', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], readyBoard)
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(<Board />, { queryClient })

    expect(screen.getByRole('region', { name: 'Productivity Up board' })).toHaveClass(
      'flex-1',
      'min-h-0',
      'overflow-x-auto',
      'overflow-y-hidden',
    )

    const bucketSections = screen.getAllByRole('region')
    expect(bucketSections).toHaveLength(3)
    expect(screen.getByRole('region', { name: 'Wednesday 24' })).toHaveClass('h-full', 'w-80', 'shrink-0')

    expect(screen.getByRole('heading', { name: 'Wednesday 24' }).closest('header')).toHaveClass('sticky', 'top-0')
    expect(screen.getByRole('list', { name: 'Wednesday 24 Todos' })).toHaveClass(
      'overflow-y-auto',
      'min-h-0',
      'overscroll-y-none',
      'pt-2',
    )
    expect(screen.getByRole('button', { name: 'Drag First todo' }).closest('[data-slot="card"]')).toHaveClass(
      'shrink-0',
    )
  })

  it('keeps insertion lines available as drop targets when a Bucket list overflows', () => {
    const manyTodos = Array.from({ length: 24 }, (_, index) =>
      createTodo({ id: 100 + index, position: (index + 1) * 1024, title: `Todo ${index + 1}` }),
    )
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], manyTodos)

    renderBucket(bucket, queryClient)

    for (const insertionLine of screen.getAllByTestId(new RegExp(`^bucket-${bucket.id}-insertion-`))) {
      expect(insertionLine).toHaveClass('shrink-0')
    }
  })

  it('scrolls the board horizontally during drag near the board edge', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], readyBoard)
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(<Board />, { queryClient })

    const board = screen.getByRole('region', { name: 'Productivity Up board' })
    board.scrollBy = vi.fn()
    board.getBoundingClientRect = () =>
      ({
        bottom: 700,
        height: 700,
        left: 0,
        right: 800,
        top: 0,
        width: 800,
        x: 0,
        y: 0,
      }) as DOMRect

    act(() => {
      dnd.dragMove?.(
        { operation: { target: { data: { bucketId: bucket.id, kind: 'todo-insertion' } } } },
        { dragOperation: { position: { current: { x: 792, y: 240 } } } },
      )
    })

    expect(board.scrollBy).toHaveBeenCalledWith({ left: 24 })
  })

  it('scrolls only the current Bucket Todo list vertically during drag', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([BOARD_QUERY_KEY], readyBoard)
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(<Board />, { queryClient })

    const sourceList = screen.getByRole('list', { name: 'Wednesday 24 Todos' })
    const destinationList = screen.getByRole('list', { name: 'June Todos' })
    sourceList.scrollBy = vi.fn()
    destinationList.scrollBy = vi.fn()
    sourceList.getBoundingClientRect = () => createDomRect({ bottom: 620, left: 0, right: 320, top: 120 })
    destinationList.getBoundingClientRect = () => createDomRect({ bottom: 620, left: 344, right: 664, top: 120 })

    act(() => {
      dnd.dragMove?.(
        { operation: { target: { data: { bucketId: destinationBucket.id, kind: 'todo-insertion' } } } },
        { dragOperation: { position: { current: { x: 500, y: 612 } } } },
      )
    })

    expect(sourceList.scrollBy).not.toHaveBeenCalled()
    expect(destinationList.scrollBy).toHaveBeenCalledWith({ top: 24 })
  })
})

describe('Todo movement across Buckets', () => {
  beforeEach(() => {
    dnd.activeDropTargetId = null
    dnd.dragEnd = undefined
    toast.error.mockReset()
    mockedMoveTodo.mockReset()
    mockedMoveTodo.mockResolvedValue({
      affectedBucketIds: [bucket.id, destinationBucket.id],
      affectedTodoPositions: [{ bucketId: destinationBucket.id, id: todos[1].id, position: 1536 }],
      todo: { ...todos[1], bucketId: destinationBucket.id, position: 1536 },
    })
  })

  it('moves a Todo to another Bucket at the visible insertion line', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: destinationTodos[1].id,
              beforeTodoId: destinationTodos[0].id,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-1`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(mockedMoveTodo).toHaveBeenCalledWith({
        data: {
          afterTodoId: destinationTodos[1].id,
          beforeTodoId: destinationTodos[0].id,
          id: todos[1].id,
          targetBucketId: destinationBucket.id,
        },
      })
    })
  })

  it('removes the moved Todo from the source cache and inserts it into the destination cache after success', async () => {
    const movedTodo = { ...todos[1], bucketId: destinationBucket.id, position: 1536, userId: 'user-1' }
    mockedMoveTodo.mockResolvedValue({
      affectedBucketIds: [bucket.id, destinationBucket.id],
      affectedTodoPositions: [
        { bucketId: destinationBucket.id, id: destinationTodos[0].id, position: 1024 },
        { bucketId: destinationBucket.id, id: movedTodo.id, position: movedTodo.position },
        { bucketId: destinationBucket.id, id: destinationTodos[1].id, position: 2048 },
      ],
      todo: movedTodo,
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: destinationTodos[1].id,
              beforeTodoId: destinationTodos[0].id,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-1`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
        todos[0].id,
        todos[2].id,
      ])
      expect(
        queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, destinationBucket.id])?.map((todo) => todo.id),
      ).toEqual([destinationTodos[0].id, movedTodo.id, destinationTodos[1].id])
    })
  })

  it('optimistically moves a Todo across Buckets before the server responds', async () => {
    mockedMoveTodo.mockReturnValue(new Promise(() => {}))
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: destinationTodos[1].id,
              beforeTodoId: destinationTodos[0].id,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-1`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
        todos[0].id,
        todos[2].id,
      ])
      expect(
        queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, destinationBucket.id])?.map((todo) => todo.id),
      ).toEqual([destinationTodos[0].id, todos[1].id, destinationTodos[1].id])
    })
  })

  it('restores affected Bucket caches, refreshes them, and shows a toast when a move fails', async () => {
    mockedMoveTodo.mockRejectedValue(new Error('Network unavailable'))
    mockedGetTodos.mockReturnValue(new Promise(() => {}))
    const queryClient = createTestQueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: destinationTodos[1].id,
              beforeTodoId: destinationTodos[0].id,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-1`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
        todos[0].id,
        todos[1].id,
        todos[2].id,
      ])
      expect(
        queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, destinationBucket.id])?.map((todo) => todo.id),
      ).toEqual([destinationTodos[0].id, destinationTodos[1].id])
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [TODOS_QUERY_KEY, bucket.id] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [TODOS_QUERY_KEY, destinationBucket.id] })
    expect(toast.error).toHaveBeenCalledWith('Could not move Todo', {
      description: 'Your board was restored. Refreshing affected Buckets now.',
    })
  })

  it('refetches affected Bucket caches and shows a refreshed-board toast when stale ordering causes a conflict', async () => {
    mockedMoveTodo.mockRejectedValue(
      new Response(JSON.stringify({ message: 'Before Todo anchor is stale, invalid, or unauthorized' }), {
        status: 409,
      }),
    )
    mockedGetTodos.mockReturnValue(new Promise(() => {}))
    const queryClient = createTestQueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries')
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: destinationTodos[1].id,
              beforeTodoId: destinationTodos[0].id,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-1`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
        todos[0].id,
        todos[1].id,
        todos[2].id,
      ])
      expect(
        queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, destinationBucket.id])?.map((todo) => todo.id),
      ).toEqual([destinationTodos[0].id, destinationTodos[1].id])
    })
    expect(refetchQueries).toHaveBeenCalledWith({ queryKey: [TODOS_QUERY_KEY, bucket.id], type: 'active' }, {})
    expect(refetchQueries).toHaveBeenCalledWith(
      { queryKey: [TODOS_QUERY_KEY, destinationBucket.id], type: 'active' },
      {},
    )
    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Board refreshed', {
      description: 'Todo positions changed before your move completed. Review the latest order and try again.',
    })
  })

  it('keeps stale in-flight affected Bucket fetches from overwriting an optimistic move', async () => {
    mockedMoveTodo.mockReturnValue(new Promise(() => {}))
    mockedGetTodos.mockReturnValue(new Promise(() => {}))
    const queryClient = createTestQueryClient()
    let finishSourceFetch: ((todos: Array<Todo>) => void) | undefined
    let finishTargetFetch: ((todos: Array<Todo>) => void) | undefined
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)
    void queryClient.fetchQuery({
      queryFn: () =>
        new Promise<Array<Todo>>((resolve) => {
          finishSourceFetch = resolve
        }),
      queryKey: [TODOS_QUERY_KEY, bucket.id],
    })
    void queryClient.fetchQuery({
      queryFn: () =>
        new Promise<Array<Todo>>((resolve) => {
          finishTargetFetch = resolve
        }),
      queryKey: [TODOS_QUERY_KEY, destinationBucket.id],
    })

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: destinationTodos[1].id,
              beforeTodoId: destinationTodos[0].id,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-1`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
        todos[0].id,
        todos[2].id,
      ])
    })

    await act(async () => {
      finishSourceFetch?.(todos)
      finishTargetFetch?.(destinationTodos)
      await Promise.resolve()
    })

    expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
      todos[0].id,
      todos[2].id,
    ])
    expect(
      queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, destinationBucket.id])?.map((todo) => todo.id),
    ).toEqual([destinationTodos[0].id, todos[1].id, destinationTodos[1].id])
  })

  it('moves a Todo into an empty Bucket from its top insertion line', async () => {
    const movedTodo = { ...todos[0], bucketId: destinationBucket.id, position: 1024, userId: 'user-1' }
    dnd.activeDropTargetId = `bucket-${destinationBucket.id}-insertion-0`
    mockedMoveTodo.mockResolvedValue({
      affectedBucketIds: [bucket.id, destinationBucket.id],
      affectedTodoPositions: [{ bucketId: destinationBucket.id, id: movedTodo.id, position: movedTodo.position }],
      todo: movedTodo,
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], todos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], [])

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    expect(screen.getByTestId(`bucket-${destinationBucket.id}-insertion-0`)).toHaveAttribute('data-drop-target', 'true')

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[0].id } },
          target: {
            data: {
              afterTodoId: undefined,
              beforeTodoId: undefined,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-0`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(mockedMoveTodo).toHaveBeenCalledWith({
        data: {
          id: todos[0].id,
          targetBucketId: destinationBucket.id,
        },
      })
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, bucket.id])?.map((todo) => todo.id)).toEqual([
        todos[1].id,
        todos[2].id,
      ])
      expect(queryClient.getQueryData<Array<Todo>>([TODOS_QUERY_KEY, destinationBucket.id])).toEqual([movedTodo])
    })
  })

  it('moves a completed Todo across Buckets with the same insertion-line anchors', async () => {
    const completedTodos = [todos[0], { ...todos[1], completed: true }, todos[2]]
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TODOS_QUERY_KEY, bucket.id], completedTodos)
    queryClient.setQueryData([TODOS_QUERY_KEY, destinationBucket.id], destinationTodos)

    render(
      <TodoDragDropProvider>
        <BucketColumn bucket={bucket} buckets={buckets} />
        <BucketColumn bucket={destinationBucket} buckets={buckets} />
      </TodoDragDropProvider>,
      { queryClient },
    )

    act(() => {
      dnd.dragEnd?.({
        canceled: false,
        operation: {
          source: { data: { bucketId: bucket.id, kind: 'todo', todoId: todos[1].id } },
          target: {
            data: {
              afterTodoId: undefined,
              beforeTodoId: destinationTodos[1].id,
              bucketId: destinationBucket.id,
              kind: 'todo-insertion',
            },
            id: `bucket-${destinationBucket.id}-insertion-2`,
          },
        },
      })
    })

    await waitFor(() => {
      expect(mockedMoveTodo).toHaveBeenCalledWith({
        data: {
          beforeTodoId: destinationTodos[1].id,
          id: todos[1].id,
          targetBucketId: destinationBucket.id,
        },
      })
    })
  })
})

function renderBucket(bucketToRender: Bucket, queryClient: ReturnType<typeof createTestQueryClient>) {
  return render(
    <TodoDragDropProvider>
      <BucketColumn bucket={bucketToRender} buckets={buckets} />
    </TodoDragDropProvider>,
    { queryClient },
  )
}

function createTodo({
  bucketId = bucket.id,
  id,
  position,
  title,
}: {
  bucketId?: number
  id: number
  position: number
  title: string
}): Todo {
  return {
    bucketId,
    category: null,
    categoryId: null,
    completed: false,
    createdAt: new Date('2026-06-24T10:00:00.000Z'),
    description: '',
    id,
    position,
    tags: [],
    title,
  }
}

function createDomRect({ bottom, left, right, top }: { bottom: number; left: number; right: number; top: number }) {
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
  } as DOMRect
}
