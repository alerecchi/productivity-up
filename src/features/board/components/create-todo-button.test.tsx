import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CreateTodoButton from '@/features/board/components/create-todo-button'
import { CATEGORIES_QUERY_KEY, TAGS_QUERY_KEY, TODOS_QUERY_KEY } from '@/features/board/queries/query-keys'
import { createCategory, deleteCategory, listCategories, updateCategory } from '@/server/functions/categories'
import { createTag, deleteTag, listTags, updateTag } from '@/server/functions/tags'
import { createTodo, updateTodo } from '@/server/functions/todos'
import { createTestQueryClient, render } from '@/test'

vi.mock('@/server/functions/categories', () => ({
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  listCategories: vi.fn(() => Promise.resolve([])),
  updateCategory: vi.fn(),
}))

vi.mock('@/server/functions/todos', () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  updateTodo: vi.fn(),
}))

vi.mock('@/server/functions/tags', () => ({
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  listTags: vi.fn(() => Promise.resolve([])),
  updateTag: vi.fn(),
}))

const buckets = [
  {
    id: 1,
    period: '2026',
    type: 'yearly',
    userId: 'user-1',
  },
  {
    id: 2,
    period: '2026-06-11',
    type: 'daily',
    userId: 'user-1',
  },
] as const

const existingTodo = {
  bucketId: 1,
  category: null,
  categoryId: null,
  completed: false,
  createdAt: new Date('2026-06-10T10:00:00.000Z'),
  description: '',
  id: 1,
  position: 1024,
  tags: [],
  title: 'Existing',
  userId: 'user-1',
}

const createdTodo = {
  bucketId: 2,
  category: null,
  categoryId: null,
  completed: false,
  createdAt: new Date('2026-06-11T10:00:00.000Z'),
  description: 'Bring notes',
  id: 2,
  position: 1024,
  tags: [],
  title: 'Plan review',
  userId: 'user-1',
}

const createdCategory = {
  colorKey: 'blue',
  id: 7,
  name: 'home admin',
  userId: 'user-1',
} as const

const existingTag = {
  colorKey: 'rose',
  id: 11,
  name: 'urgent',
  userId: 'user-1',
} as const

const createdTag = {
  colorKey: 'blue',
  id: 12,
  name: 'focus',
  userId: 'user-1',
} as const

const mockedCreateTodo = vi.mocked(createTodo)
const mockedUpdateTodo = vi.mocked(updateTodo)
const mockedCreateCategory = vi.mocked(createCategory)
const mockedDeleteCategory = vi.mocked(deleteCategory)
const mockedListCategories = vi.mocked(listCategories)
const mockedUpdateCategory = vi.mocked(updateCategory)
const mockedCreateTag = vi.mocked(createTag)
const mockedDeleteTag = vi.mocked(deleteTag)
const mockedListTags = vi.mocked(listTags)
const mockedUpdateTag = vi.mocked(updateTag)

describe('CreateTodoButton', () => {
  beforeEach(() => {
    mockedCreateCategory.mockReset()
    mockedDeleteCategory.mockReset()
    mockedListCategories.mockReset()
    mockedListCategories.mockResolvedValue([])
    mockedCreateTag.mockReset()
    mockedDeleteTag.mockReset()
    mockedListTags.mockReset()
    mockedListTags.mockResolvedValue([])
    mockedUpdateTag.mockReset()
    mockedUpdateCategory.mockReset()
    mockedCreateTodo.mockReset()
    mockedUpdateTodo.mockReset()
  })

  const openCategoryPicker = (name = 'No Category') => {
    fireEvent.click(screen.getByRole('button', { name }))
  }

  const openTagPicker = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }))
  }

  const closeTopDialog = () => {
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    const closeButton = closeButtons.at(-1)

    if (!closeButton) {
      throw new Error('Expected a close button')
    }

    fireEvent.click(closeButton)
  }

  const appendBucketTodoList = (bucketId: number, scrollHeight: number | (() => number) = 640) => {
    const bucketList = document.createElement('div')
    const scrollTo = vi.fn()
    Object.assign(bucketList.dataset, { bucketId: String(bucketId), bucketTodoList: '' })
    Object.defineProperty(bucketList, 'scrollHeight', {
      configurable: true,
      get: typeof scrollHeight === 'function' ? scrollHeight : () => scrollHeight,
    })
    bucketList.scrollTo = scrollTo
    document.body.append(bucketList)

    return { bucketList, scrollTo }
  }

  it('opens TodoDialog create mode with the current bucket selected', () => {
    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))

    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(screen.getByLabelText('Bucket')).toHaveValue('1')
  })

  it('creates a todo in the current bucket, appends it to that bucket cache, and reveals it', async () => {
    const createdCurrentBucketTodo = {
      ...createdTodo,
      bucketId: 1,
      id: 3,
      position: 2048,
    }
    mockedCreateTodo.mockResolvedValue(createdCurrentBucketTodo)
    const queryClient = createTestQueryClient()
    let scrollHeight = 640
    const animationFrameCallbacks: Array<FrameRequestCallback> = []
    const { bucketList, scrollTo } = appendBucketTodoList(1, () => scrollHeight)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    })
    queryClient.setQueryData([TODOS_QUERY_KEY, 1], [existingTodo])
    queryClient.setQueryData([TODOS_QUERY_KEY, 2], [])

    render(<CreateTodoButton bucketId={1} buckets={buckets} />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plan review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Add New Task' })).not.toBeInTheDocument()
    })
    expect(mockedCreateTodo.mock.calls[0]?.[0]).toEqual({
      data: {
        bucketId: 1,
        categoryId: null,
        description: '',
        tagIds: [],
        title: 'Plan review',
      },
    })
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 1])).toEqual([existingTodo, createdCurrentBucketTodo])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 2])).toEqual([])
    await waitFor(() => {
      expect(animationFrameCallbacks.length).toBeGreaterThan(0)
    })
    const firstFrameCallbacks = animationFrameCallbacks.splice(0)
    act(() => {
      firstFrameCallbacks.forEach((callback) => callback(0))
    })
    scrollHeight = 720
    const secondFrameCallbacks = animationFrameCallbacks.splice(0)
    act(() => {
      secondFrameCallbacks.forEach((callback) => callback(16))
    })
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 720 })

    bucketList.remove()
    vi.unstubAllGlobals()
  })

  it('creates a todo in the selected bucket, closes, and patches only that bucket cache', async () => {
    mockedCreateTodo.mockResolvedValue(createdTodo)
    const queryClient = createTestQueryClient()
    const { bucketList, scrollTo } = appendBucketTodoList(2)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    queryClient.setQueryData([TODOS_QUERY_KEY, 1], [existingTodo])
    queryClient.setQueryData([TODOS_QUERY_KEY, 2], [])

    render(<CreateTodoButton bucketId={1} buckets={buckets} />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  Plan review  ' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Bring notes' } })
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Add New Task' })).not.toBeInTheDocument()
    })
    expect(mockedCreateTodo.mock.calls[0]?.[0]).toEqual({
      data: {
        bucketId: 2,
        categoryId: null,
        description: 'Bring notes',
        tagIds: [],
        title: 'Plan review',
      },
    })
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 1])).toEqual([existingTodo])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 2])).toEqual([createdTodo])
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 640 })

    bucketList.remove()
    vi.unstubAllGlobals()
  })

  it('creates a Category from the picker, selects it, and saves the Todo with it', async () => {
    mockedCreateCategory.mockResolvedValue(createdCategory)
    mockedCreateTodo.mockResolvedValue({
      ...createdTodo,
      category: {
        colorKey: createdCategory.colorKey,
        id: createdCategory.id,
        name: createdCategory.name,
      },
      categoryId: createdCategory.id,
    })

    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Organize cabinet' } })
    openCategoryPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Home   Admin  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedCreateCategory).toHaveBeenCalled()
    })
    closeTopDialog()
    expect(screen.getByRole('button', { name: createdCategory.name })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockedCreateTodo).toHaveBeenCalled()
    })
    expect(mockedCreateCategory.mock.calls[0]?.[0]).toEqual({
      data: {
        colorKey: 'blue',
        name: 'Home   Admin',
      },
    })
    expect(mockedCreateTodo.mock.calls[0]?.[0]).toEqual({
      data: {
        bucketId: 1,
        categoryId: createdCategory.id,
        description: '',
        tagIds: [],
        title: 'Organize cabinet',
      },
    })
  })

  it('creates a Todo with multiple selected Tags', async () => {
    mockedListTags.mockResolvedValue([existingTag, createdTag])
    mockedCreateTodo.mockResolvedValue({
      ...createdTodo,
      tags: [
        {
          colorKey: existingTag.colorKey,
          id: existingTag.id,
          name: existingTag.name,
        },
        {
          colorKey: createdTag.colorKey,
          id: createdTag.id,
          name: createdTag.name,
        },
      ],
    })

    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plan review' } })
    openTagPicker()
    fireEvent.click(await screen.findByLabelText(existingTag.name))
    fireEvent.click(screen.getByLabelText(createdTag.name))
    closeTopDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockedCreateTodo).toHaveBeenCalled()
    })
    expect(mockedCreateTodo.mock.calls[0]?.[0]).toEqual({
      data: {
        bucketId: 1,
        categoryId: null,
        description: '',
        tagIds: [existingTag.id, createdTag.id],
        title: 'Plan review',
      },
    })
  })

  it('creates a Tag from the picker, selects it, and saves the Todo with it', async () => {
    mockedCreateTag.mockResolvedValue(createdTag)
    mockedCreateTodo.mockResolvedValue({
      ...createdTodo,
      tags: [
        {
          colorKey: createdTag.colorKey,
          id: createdTag.id,
          name: createdTag.name,
        },
      ],
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TAGS_QUERY_KEY], [])

    render(<CreateTodoButton bucketId={1} buckets={buckets} />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plan review' } })
    openTagPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Focus  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByLabelText(createdTag.name)).toBeChecked()
    })

    closeTopDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockedCreateTodo).toHaveBeenCalled()
    })
    expect(mockedCreateTag.mock.calls[0]?.[0]).toEqual({
      data: {
        colorKey: 'blue',
        name: 'Focus',
      },
    })
    expect(mockedCreateTodo.mock.calls[0]?.[0]).toEqual({
      data: {
        bucketId: 1,
        categoryId: null,
        description: '',
        tagIds: [createdTag.id],
        title: 'Plan review',
      },
    })
  })

  it('renames and recolors a Tag immediately and patches cached Todo card badges without submitting the Todo', async () => {
    const updatedTag = {
      colorKey: 'green',
      id: existingTag.id,
      name: 'next_up',
      userId: 'user-1',
    } as const
    mockedListTags.mockResolvedValue([existingTag])
    mockedUpdateTag.mockResolvedValue(updatedTag)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TAGS_QUERY_KEY], [existingTag])
    queryClient.setQueryData(
      [TODOS_QUERY_KEY, 1],
      [
        {
          ...existingTodo,
          tags: [
            {
              colorKey: existingTag.colorKey,
              id: existingTag.id,
              name: existingTag.name,
            },
          ],
        },
      ],
    )
    queryClient.setQueryData(
      [TODOS_QUERY_KEY, 2],
      [
        {
          ...createdTodo,
          tags: [
            {
              colorKey: existingTag.colorKey,
              id: existingTag.id,
              name: existingTag.name,
            },
          ],
        },
      ],
    )

    render(<CreateTodoButton bucketId={1} buckets={buckets} />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openTagPicker()
    expect(await screen.findByLabelText(existingTag.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${existingTag.name}` }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Next_Up  ' } })
    fireEvent.click(screen.getByLabelText('green'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedUpdateTag).toHaveBeenCalled()
    })
    expect(mockedUpdateTag.mock.calls[0]?.[0]).toEqual({
      data: {
        colorKey: 'green',
        id: existingTag.id,
        name: 'Next_Up',
      },
    })
    expect(mockedCreateTodo).not.toHaveBeenCalled()
    closeTopDialog()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(queryClient.getQueryData([TAGS_QUERY_KEY])).toEqual([updatedTag])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 1])).toEqual([
      expect.objectContaining({
        tags: [
          {
            colorKey: 'green',
            id: existingTag.id,
            name: 'next_up',
          },
        ],
      }),
    ])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 2])).toEqual([
      expect.objectContaining({
        tags: [
          {
            colorKey: 'green',
            id: existingTag.id,
            name: 'next_up',
          },
        ],
      }),
    ])
  })

  it('keeps Tag edit errors local to the picker', async () => {
    mockedListTags.mockResolvedValue([existingTag])
    mockedUpdateTag.mockRejectedValue(new Error('Tag name already exists'))

    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openTagPicker()
    expect(await screen.findByLabelText(existingTag.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${existingTag.name}` }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'focus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Tag name already exists')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    closeTopDialog()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(mockedCreateTodo).not.toHaveBeenCalled()
  })

  it('deletes a selected Tag after confirmation and clears cached Todo card badges without submitting', async () => {
    mockedListTags.mockResolvedValue([existingTag])
    mockedDeleteTag.mockResolvedValue({
      tagId: existingTag.id,
    })
    mockedCreateTodo.mockResolvedValue(createdTodo)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([TAGS_QUERY_KEY], [existingTag])
    queryClient.setQueryData(
      [TODOS_QUERY_KEY, 1],
      [
        {
          ...existingTodo,
          tags: [
            {
              colorKey: existingTag.colorKey,
              id: existingTag.id,
              name: existingTag.name,
            },
          ],
        },
      ],
    )

    render(<CreateTodoButton bucketId={1} buckets={buckets} />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plan review' } })
    openTagPicker()
    fireEvent.click(await screen.findByLabelText(existingTag.name))
    fireEvent.click(screen.getByRole('button', { name: `Edit ${existingTag.name}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Click Delete again to permanently delete this tag.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedDeleteTag).toHaveBeenCalled()
    })
    expect(mockedDeleteTag.mock.calls[0]?.[0]).toEqual({
      data: {
        id: existingTag.id,
      },
    })
    expect(mockedCreateTodo).not.toHaveBeenCalled()
    expect(queryClient.getQueryData([TAGS_QUERY_KEY])).toEqual([])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 1])).toEqual([
      expect.objectContaining({
        tags: [],
      }),
    ])

    closeTopDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockedCreateTodo).toHaveBeenCalled()
    })
    expect(mockedCreateTodo.mock.calls[0]?.[0]).toEqual({
      data: {
        bucketId: 1,
        categoryId: null,
        description: '',
        tagIds: [],
        title: 'Plan review',
      },
    })
  })

  it('keeps Tag delete errors local to the picker', async () => {
    mockedListTags.mockResolvedValue([existingTag])
    mockedDeleteTag.mockRejectedValue(new Error('Could not delete the tag.'))

    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openTagPicker()
    fireEvent.click(await screen.findByLabelText(existingTag.name))
    fireEvent.click(screen.getByRole('button', { name: `Edit ${existingTag.name}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Click Delete again to permanently delete this tag.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Could not delete the tag.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    closeTopDialog()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(mockedCreateTodo).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and shows feedback when Category creation fails', async () => {
    mockedCreateCategory.mockRejectedValue(new Error('Could not create the category.'))

    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openCategoryPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Home admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Could not create the category.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    closeTopDialog()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No Category' })).toBeInTheDocument()
  })

  it('renames and recolors a Category immediately and patches cached Todo cards without submitting the Todo', async () => {
    const updatedCategory = {
      colorKey: 'green',
      id: createdCategory.id,
      name: 'life admin',
      userId: 'user-1',
    } as const
    mockedListCategories.mockResolvedValue([createdCategory])
    mockedUpdateCategory.mockResolvedValue(updatedCategory)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([CATEGORIES_QUERY_KEY], [createdCategory])
    queryClient.setQueryData(
      [TODOS_QUERY_KEY, 1],
      [
        {
          ...existingTodo,
          category: {
            colorKey: createdCategory.colorKey,
            id: createdCategory.id,
            name: createdCategory.name,
          },
          categoryId: createdCategory.id,
        },
      ],
    )
    queryClient.setQueryData(
      [TODOS_QUERY_KEY, 2],
      [
        {
          ...createdTodo,
          category: {
            colorKey: createdCategory.colorKey,
            id: createdCategory.id,
            name: createdCategory.name,
          },
          categoryId: createdCategory.id,
        },
      ],
    )

    render(<CreateTodoButton bucketId={1} buckets={buckets} />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openCategoryPicker()
    expect(await screen.findByRole('button', { name: createdCategory.name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${createdCategory.name}` }))
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: '  Life   Admin  ' } })
    fireEvent.click(screen.getByLabelText('green'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockedUpdateCategory).toHaveBeenCalled()
    })
    expect(mockedUpdateCategory.mock.calls[0]?.[0]).toEqual({
      data: {
        colorKey: 'green',
        id: createdCategory.id,
        name: 'Life   Admin',
      },
    })
    expect(mockedCreateTodo).not.toHaveBeenCalled()
    closeTopDialog()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(queryClient.getQueryData([CATEGORIES_QUERY_KEY])).toEqual([updatedCategory])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 1])).toEqual([
      expect.objectContaining({
        category: {
          colorKey: 'green',
          id: createdCategory.id,
          name: 'life admin',
        },
      }),
    ])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 2])).toEqual([
      expect.objectContaining({
        category: {
          colorKey: 'green',
          id: createdCategory.id,
          name: 'life admin',
        },
      }),
    ])
  })

  it('keeps Category edit errors local to the picker', async () => {
    mockedListCategories.mockResolvedValue([createdCategory])
    mockedUpdateCategory.mockRejectedValue(new Error('Category name already exists'))

    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openCategoryPicker()
    expect(await screen.findByRole('button', { name: createdCategory.name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Edit ${createdCategory.name}` }))
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'life admin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Category name already exists')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    closeTopDialog()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(mockedCreateTodo).not.toHaveBeenCalled()
  })

  it('deletes the selected Category after confirmation and clears cached Todo card categories without submitting', async () => {
    mockedListCategories.mockResolvedValue([createdCategory])
    mockedDeleteCategory.mockResolvedValue({
      categoryId: createdCategory.id,
    })
    const queryClient = createTestQueryClient()
    queryClient.setQueryData([CATEGORIES_QUERY_KEY], [createdCategory])
    queryClient.setQueryData(
      [TODOS_QUERY_KEY, 1],
      [
        {
          ...existingTodo,
          category: {
            colorKey: createdCategory.colorKey,
            id: createdCategory.id,
            name: createdCategory.name,
          },
          categoryId: createdCategory.id,
        },
      ],
    )

    render(<CreateTodoButton bucketId={1} buckets={buckets} />, { queryClient })

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openCategoryPicker()
    fireEvent.click(await screen.findByRole('button', { name: createdCategory.name }))
    openCategoryPicker(createdCategory.name)
    fireEvent.click(screen.getByRole('button', { name: `Edit ${createdCategory.name}` }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Click Delete again to permanently delete this category.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockedDeleteCategory).toHaveBeenCalled()
    })
    expect(mockedDeleteCategory.mock.calls[0]?.[0]).toEqual({
      data: {
        id: createdCategory.id,
      },
    })
    expect(mockedCreateTodo).not.toHaveBeenCalled()
    closeTopDialog()
    expect(screen.getByRole('button', { name: 'No Category' })).toBeInTheDocument()
    expect(queryClient.getQueryData([CATEGORIES_QUERY_KEY])).toEqual([])
    expect(queryClient.getQueryData([TODOS_QUERY_KEY, 1])).toEqual([
      expect.objectContaining({
        category: null,
        categoryId: null,
      }),
    ])
  })

  it('keeps Category delete errors local to the picker', async () => {
    mockedListCategories.mockResolvedValue([createdCategory])
    mockedDeleteCategory.mockRejectedValue(new Error('Could not delete the category.'))

    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    openCategoryPicker()
    fireEvent.click(await screen.findByRole('button', { name: createdCategory.name }))
    openCategoryPicker(createdCategory.name)
    fireEvent.click(screen.getByRole('button', { name: `Edit ${createdCategory.name}` }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Click Delete again to permanently delete this category.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Could not delete the category.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    closeTopDialog()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: createdCategory.name })).toBeInTheDocument()
    expect(mockedCreateTodo).not.toHaveBeenCalled()
  })

  it('rejects missing title and missing bucket before saving', async () => {
    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Title is required.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plan review' } })
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Bucket is required.')).toBeInTheDocument()
    expect(mockedCreateTodo).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and shows feedback when saving fails', async () => {
    mockedCreateTodo.mockRejectedValue(new Error('Could not save the todo.'))
    render(<CreateTodoButton bucketId={1} buckets={buckets} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add todo' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plan review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not save the todo.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add New Task' })).toBeInTheDocument()
  })
})
