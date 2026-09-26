import { Checkbox } from '@shared/components/ui/checkbox'
import { GripVertical } from 'lucide-react'
import { memo } from 'react'

import { useToggleTodo } from '@/features/board/hooks/use-update-todo'
import { Badge } from '@/features/shared/components/ui/badge'
import { Button } from '@/features/shared/components/ui/button'
import { Card, CardAction, CardHeader, CardTitle } from '@/features/shared/components/ui/card'
import { cn } from '@/features/shared/utils/tailwind'
import { getColorPreset } from '@/lib/types/Color'
import type { Todo } from '@/lib/types/Todo'

interface TodoCardProps {
  dragHandleRef?: (element: Element | null) => void
  draggableRef?: (element: Element | null) => void
  isDragging?: boolean
  onEdit?: (todo: Todo) => void
  todo: Todo
}

function TodoCard({ dragHandleRef, draggableRef, isDragging = false, onEdit, todo }: TodoCardProps) {
  const categoryColor = todo.category ? getColorPreset(todo.category.colorKey) : undefined
  const { mutate: toggleTodoMutation } = useToggleTodo()
  const handleCheckedChange = () => {
    toggleTodoMutation(todo)
  }

  return (
    <Card
      data-completed={todo.completed}
      data-dragging={isDragging}
      onClick={(event) => {
        if (isTodoCardControl(event.target)) {
          return
        }

        onEdit?.(todo)
      }}
      className={cn(
        'group m-2 shrink-0 shadow-sm ring-0',
        onEdit && 'cursor-pointer',
        isDragging && 'opacity-60',
        todo.category &&
          'border-l-4 border-l-(--todo-marker-bg) data-[completed=true]:border-l-[color-mix(in_oklab,var(--todo-marker-bg)_70%,transparent)]',
        categoryColor?.backgroundColorClass,
        todo.completed && 'bg-muted',
      )}
      ref={draggableRef}
    >
      <CardHeader>
        <CardAction className='row-span-1'>
          <div className='flex items-center gap-1'>
            <Button
              aria-label={`Drag ${todo.title}`}
              className='cursor-grab text-muted-foreground opacity-70 active:cursor-grabbing'
              ref={dragHandleRef}
              size='icon-xs'
              type='button'
              variant='ghost'
            >
              <GripVertical className='size-4' />
            </Button>
            <Checkbox
              id={`terms-checkbox-${todo.id}`}
              checked={todo.completed}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={handleCheckedChange}
              className={cn(
                'size-5 cursor-pointer rounded-full border-2',
                !todo.completed && 'opacity-0 transition-opacity group-hover:opacity-100',
                todo.completed && 'opacity-70',
              )}
            />
          </div>
        </CardAction>
        {todo.tags.length > 0 && (
          <div className='flex flex-wrap gap-1.5'>
            {todo.tags.map((tag) => {
              const tagColor = getColorPreset(tag.colorKey)

              return (
                <Badge
                  key={tag.id}
                  data-completed={todo.completed}
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-xs uppercase',
                    'bg-[color-mix(in_oklab,var(--todo-marker-bg)_12%,transparent)] text-(--todo-marker-fg)',
                    'data-[completed=true]:bg-[color-mix(in_oklab,var(--todo-marker-bg)_8%,transparent)] data-[completed=true]:text-muted-foreground',
                    tagColor.backgroundColorClass,
                    tagColor.textColorClass,
                  )}
                >
                  {tag.name}
                </Badge>
              )
            })}
          </div>
        )}
        <CardTitle className={cn(!todo.completed && 'font-bold', todo.completed && 'font-semibold text-slate-500')}>
          {todo.title}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

export default memo(TodoCard)

function isTodoCardControl(target: EventTarget) {
  return (
    target instanceof HTMLElement && Boolean(target.closest('[data-slot="checkbox"], input, button, select, textarea'))
  )
}
