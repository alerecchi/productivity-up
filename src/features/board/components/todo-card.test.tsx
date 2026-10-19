import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import TodoCard from '@/features/board/components/todo-card'
import type { Todo } from '@/lib/types/Todo'
import { render } from '@/test'

vi.mock('@/features/board/hooks/use-update-todo', () => ({
  useToggleTodo: () => ({
    mutate: vi.fn(),
  }),
}))

const todoWithCategory = {
  bucketId: 1,
  category: {
    colorKey: 'blue',
    id: 4,
    name: 'home admin',
  },
  categoryId: 4,
  completed: false,
  createdAt: new Date('2026-06-11T10:00:00.000Z'),
  description: '',
  id: 10,
  position: 1024,
  tags: [],
  title: 'Pay rent',
} satisfies Todo

const todoWithTags = {
  ...todoWithCategory,
  category: null,
  categoryId: null,
  tags: [
    {
      colorKey: 'rose',
      id: 11,
      name: 'urgent',
    },
    {
      colorKey: 'teal',
      id: 12,
      name: 'focus',
    },
  ],
} satisfies Todo

describe('TodoCard', () => {
  it('exposes a dedicated drag handle', () => {
    render(<TodoCard todo={todoWithCategory} />)

    expect(screen.getByRole('button', { name: 'Drag “Pay rent”' })).toBeInTheDocument()
  })

  it('uses the Category color as the left border', () => {
    render(<TodoCard todo={todoWithCategory} />)

    const card = screen.getByText('Pay rent').closest('[data-slot="card"]')

    expect(card).toHaveClass('border-l-4')
    expect(card).toHaveClass('[--todo-marker-bg:var(--color-blue-500)]')
    expect(card).not.toHaveClass('[--todo-marker-fg:var(--color-blue-700)]')
    expect(card).toHaveClass('border-l-(--todo-marker-bg)')
  })

  it('mutes Category color styling when the Todo is completed', () => {
    render(<TodoCard todo={{ ...todoWithCategory, completed: true }} />)

    const card = screen.getByText('Pay rent').closest('[data-slot="card"]')

    expect(card).toHaveClass('border-l-4')
    expect(card).toHaveClass(
      'data-[completed=true]:border-l-[color-mix(in_oklab,var(--todo-marker-bg)_70%,transparent)]',
    )
  })

  it('uses the fallback color preset for unknown Category color keys', () => {
    render(
      <TodoCard
        todo={
          {
            ...todoWithCategory,
            category: {
              ...todoWithCategory.category,
              colorKey: 'legacy-color',
            },
          } as unknown as Todo
        }
      />,
    )

    const card = screen.getByText('Pay rent').closest('[data-slot="card"]')

    expect(card).toHaveClass('border-l-4')
    expect(card).toHaveClass('[--todo-marker-bg:var(--color-blue-500)]')
  })

  it('renders Tag badges near the top of the card', () => {
    render(<TodoCard todo={todoWithTags} />)

    expect(screen.getByText('urgent')).toBeInTheDocument()
    expect(screen.getByText('focus')).toBeInTheDocument()
    expect(screen.getByText('urgent')).toHaveClass('[--todo-marker-bg:var(--color-rose-500)]')
    expect(screen.getByText('urgent')).toHaveClass('[--todo-marker-fg:var(--color-rose-700)]')
    expect(screen.getByText('focus')).toHaveClass('[--todo-marker-bg:var(--color-teal-500)]')
    expect(screen.getByText('focus')).toHaveClass('[--todo-marker-fg:var(--color-teal-700)]')
  })

  it('does not render descriptions in the board card view', () => {
    render(<TodoCard todo={{ ...todoWithCategory, description: 'Only shown while editing this todo.' }} />)

    expect(screen.queryByText('Only shown while editing this todo.')).not.toBeInTheDocument()
  })

  it('mutes Tag color styling when the Todo is completed', () => {
    render(<TodoCard todo={{ ...todoWithTags, completed: true }} />)

    expect(screen.getByText('urgent')).toHaveClass(
      'data-[completed=true]:bg-[color-mix(in_oklab,var(--todo-marker-bg)_8%,transparent)]',
    )
  })

  it('uses the fallback color preset for unknown Tag color keys', () => {
    render(
      <TodoCard
        todo={
          {
            ...todoWithTags,
            tags: [
              {
                colorKey: 'legacy-color',
                id: 20,
                name: 'legacy',
              },
            ],
          } as unknown as Todo
        }
      />,
    )

    expect(screen.getByText('legacy')).toHaveClass('[--todo-marker-bg:var(--color-blue-500)]')
    expect(screen.getByText('legacy')).toHaveClass('[--todo-marker-fg:var(--color-blue-700)]')
  })
})
