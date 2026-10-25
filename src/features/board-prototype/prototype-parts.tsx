// PROTOTYPE, throwaway. Small pieces every variant reuses; each variant owns its own layout.
import { useForm } from '@tanstack/react-form'
import { ArrowDown, ArrowUp, Check, CornerDownLeft, MoreHorizontal, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/features/shared/components/ui/button'
import { Checkbox } from '@/features/shared/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/features/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/features/shared/components/ui/dropdown-menu'
import { cn } from '@/features/shared/utils/tailwind'

import { useBoard, withViewTransition } from './prototype-board'
import { BUCKETS_BY_URGENCY, BUCKET_META, CATEGORIES, plural } from './prototype-data'
import type { BucketId, CategoryId, Todo } from './prototype-data'

export function CategoryChip({ categoryId, className }: { categoryId?: CategoryId; className?: string }) {
  if (!categoryId) return null
  const category = CATEGORIES[categoryId]
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        category.chip,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', category.dot)} />
      {category.name}
    </span>
  )
}

export function CategoryDot({ categoryId, className }: { categoryId?: CategoryId; className?: string }) {
  if (!categoryId) return null
  const category = CATEGORIES[categoryId]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', className)}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', category.dot)} />
      {category.name}
    </span>
  )
}

export function Tags({ tags, className }: { tags: Array<string>; className?: string }) {
  if (tags.length === 0) return null
  return (
    <span className={cn('flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground', className)}>
      {tags.map((tag) => (
        <span key={tag} className='whitespace-nowrap'>
          #{tag}
        </span>
      ))}
    </span>
  )
}

/** Done toggle: instant state change, plus a small ring that pops when a todo gets finished. */
export function DoneCheck({
  todo,
  labelledBy,
  className,
  onToggled,
}: {
  todo: Todo
  labelledBy: string
  className?: string
  onToggled?: (done: boolean) => void
}) {
  const { toggleDone } = useBoard()
  const reduce = useReducedMotion()
  const [pops, setPops] = useState(0)

  return (
    <span className='relative inline-flex shrink-0'>
      <Checkbox
        checked={todo.done}
        aria-labelledby={labelledBy}
        onCheckedChange={(checked) => {
          toggleDone(todo.id)
          if (checked) setPops((n) => n + 1)
          onToggled?.(checked)
        }}
        className={cn(
          'size-5 rounded-full border-2 border-muted-foreground/50 transition-[background-color,border-color] duration-150 enabled:active:scale-[0.96] dark:bg-transparent data-checked:border-primary',
          className,
        )}
      />
      <AnimatePresence>
        {pops > 0 && todo.done && !reduce ? (
          <motion.span
            key={pops}
            aria-hidden
            className='pointer-events-none absolute inset-0 rounded-full border-2 border-primary'
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 2 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        ) : null}
      </AnimatePresence>
    </span>
  )
}

/** The single-pointer and keyboard path for everything drag does (WCAG 2.5.7). */
export function TodoMenu({
  todo,
  className,
  align = 'end',
}: {
  todo: Todo
  className?: string
  align?: 'start' | 'end'
}) {
  const { bucketOf, moveTo, shift, toggleDone, state } = useBoard()
  const bucketId = bucketOf(todo.id)
  const list = state.order[bucketId]
  const index = list.indexOf(todo.id)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={`Actions for ${todo.title}`}
            className={cn('text-muted-foreground', className)}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className='w-52'>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {BUCKETS_BY_URGENCY.filter((id) => id !== bucketId).map((id) => (
            <DropdownMenuItem key={id} onClick={() => withViewTransition(() => moveTo(todo.id, id))}>
              {BUCKET_META[id].name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={index === 0} onClick={() => withViewTransition(() => shift(todo.id, -1))}>
          <ArrowUp /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === list.length - 1}
          onClick={() => withViewTransition(() => shift(todo.id, 1))}
        >
          <ArrowDown /> Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => toggleDone(todo.id)}>
          {todo.done ? <RotateCcw /> : <Check />}
          {todo.done ? 'Mark as not done' : 'Mark as done'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Call the bank #phone @work" → title, tags and category. Prototype shortcut, not the real flow. */
function parseQuickAdd(raw: string) {
  const tags: Array<string> = []
  let categoryId: CategoryId | undefined
  const words = raw.split(/\s+/).filter((word) => {
    if (word.startsWith('#') && word.length > 1) {
      tags.push(word.slice(1))
      return false
    }
    const match = Object.values(CATEGORIES).find((c) => `@${c.id}` === word.toLowerCase())
    if (match) {
      categoryId = match.id
      return false
    }
    return true
  })
  return { title: words.join(' '), tags, categoryId }
}

export function QuickAdd({
  bucketId,
  placeholder = 'Call the bank #phone @work',
  className,
  inputClassName,
  autoFocus,
  hint = true,
  onDone,
}: {
  bucketId: BucketId
  placeholder?: string
  className?: string
  inputClassName?: string
  autoFocus?: boolean
  hint?: boolean
  onDone?: () => void
}) {
  const { add } = useBoard()
  const inputId = useId()
  const form = useForm({
    defaultValues: { title: '' },
    onSubmit: ({ value, formApi }) => {
      const parsed = parseQuickAdd(value.title.trim())
      if (!parsed.title) return
      add(bucketId, parsed)
      formApi.reset()
    },
  })

  return (
    <form
      className={cn('group/add relative', className)}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <label htmlFor={inputId} className='sr-only'>
        Add a todo to {BUCKET_META[bucketId].name}
      </label>
      <form.Field name='title'>
        {(field) => (
          <input
            id={inputId}
            name={field.name}
            value={field.state.value}
            autoComplete='off'
            autoFocus={autoFocus}
            placeholder={placeholder}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onDone?.()
            }}
            className={cn(
              'h-10 w-full min-w-0 rounded-md bg-transparent px-3 pe-10 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm',
              inputClassName,
            )}
          />
        )}
      </form.Field>
      {hint ? (
        <span
          aria-hidden
          className='pointer-events-none absolute inset-y-0 end-3 flex items-center text-muted-foreground opacity-0 transition-opacity duration-150 group-focus-within/add:opacity-100'
        >
          <CornerDownLeft className='size-4' />
        </span>
      ) : null}
    </form>
  )
}

export function useTodayStats() {
  const { todosIn } = useBoard()
  const today = todosIn('today')
  const done = today.filter((t) => t.done).length
  return { total: today.length, done, left: today.length - done, allDone: today.length > 0 && done === today.length }
}

const CONFETTI = ['bg-sky-500', 'bg-amber-400', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-primary']

const stagger = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: 'easeOut' } },
} as const

/** The bigger celebration: closing the day. It does nothing to the data yet. */
export function DayCompleteMoment({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { done, left } = useTodayStats()
  const reduce = useReducedMotion()

  const headline = left === 0 ? 'That’s a wrap!' : done > 0 ? 'Nice work today.' : 'Day closed.'
  const body =
    done > 0 ? plural(done, 'You finished # todo today.', 'You finished # todos today.') : 'Tomorrow is a fresh page.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className='overflow-hidden p-0 sm:max-w-sm'>
        <div aria-hidden className='pointer-events-none absolute inset-x-0 top-0 h-32'>
          {!reduce && open
            ? Array.from({ length: 18 }, (_, i) => (
                <motion.span
                  key={i}
                  className={cn('absolute top-16 left-1/2 size-1.5 rounded-full', CONFETTI[i % CONFETTI.length])}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: Math.cos((i / 18) * Math.PI * 2) * (70 + (i % 3) * 30),
                    y: Math.sin((i / 18) * Math.PI * 2) * (40 + (i % 4) * 14) - 10,
                    opacity: 0,
                    scale: 0.6,
                  }}
                  transition={{ duration: 0.9, ease: [0.2, 0, 0, 1], delay: 0.15 }}
                />
              ))
            : null}
        </div>
        <motion.div
          className='flex flex-col items-center gap-2 px-6 pt-10 pb-6 text-center'
          initial='hidden'
          animate='visible'
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.span
            variants={stagger}
            className='mb-2 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground'
          >
            <Check className='size-7' strokeWidth={2.5} />
          </motion.span>
          <motion.div variants={stagger}>
            <DialogTitle className='text-2xl font-bold tracking-tight text-balance'>{headline}</DialogTitle>
          </motion.div>
          <motion.div variants={stagger}>
            <DialogDescription className='text-base text-pretty'>
              {body}
              {left > 0
                ? ` ${plural(left, '# didn’t make it. Tomorrow you’ll pick: another go, or back to this week.', '# didn’t make it. Tomorrow you’ll pick for each: another go, or back to this week.')}`
                : ''}
            </DialogDescription>
          </motion.div>
          <motion.div variants={stagger} className='mt-4 w-full'>
            <Button size='lg' className='w-full' onClick={() => onOpenChange(false)}>
              Back to the board
            </Button>
          </motion.div>
          <motion.p variants={stagger} className='text-xs text-muted-foreground'>
            Prototype: closing the day doesn’t change anything yet.
          </motion.p>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className='sr-only'>{children}</span>
}

/** Variants render one layout at a time, so a todo's sortable id is never mounted twice. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
