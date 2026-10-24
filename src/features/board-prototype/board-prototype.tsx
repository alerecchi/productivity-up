// PROTOTYPE, throwaway. Five radically different board variants on /board?variant=<key>.
// State is in memory and shared across variants, so switching keeps your changes. Reset from the bar.
import { useNavigate } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'

import { TooltipProvider } from '@/features/shared/components/ui/tooltip'

import { PrototypeBoardProvider, useBoard } from './prototype-board'
import { PrototypeSwitcher } from './prototype-switcher'
import { DeskVariant } from './variants/desk-variant'
import { FocusVariant } from './variants/focus-variant'
import { KanbanVariant } from './variants/kanban-variant'
import { ScrollVariant } from './variants/scroll-variant'
import { TelescopeVariant } from './variants/telescope-variant'

export const BOARD_VARIANTS = [
  { key: 'telescope', name: 'Telescope', Component: TelescopeVariant },
  { key: 'kanban', name: 'Kanban', Component: KanbanVariant },
  { key: 'focus', name: 'Today + tray', Component: FocusVariant },
  { key: 'scroll', name: 'The scroll', Component: ScrollVariant },
  { key: 'desk', name: 'Triage desk', Component: DeskVariant },
] as const

// Card moves made from menus and keys animate with view transitions; the page itself must not cross-fade.
const VIEW_TRANSITION_CSS = `
::view-transition-old(root), ::view-transition-new(root) { animation: none; }
::view-transition-group(*) { animation-duration: 300ms; animation-timing-function: cubic-bezier(0.2, 0, 0, 1); }
`

export function BoardPrototype({ variant }: { variant: string }) {
  const navigate = useNavigate()
  const [resetKey, setResetKey] = useState(0)
  const current = BOARD_VARIANTS.find((v) => v.key === variant) ?? BOARD_VARIANTS[0]

  return (
    <MotionConfig reducedMotion='user'>
      <TooltipProvider>
        <style>{VIEW_TRANSITION_CSS}</style>
        <PrototypeBoardProvider key={resetKey}>
          <VariantHost>
            <current.Component key={current.key} />
          </VariantHost>
        </PrototypeBoardProvider>
        <PrototypeSwitcher
          variants={BOARD_VARIANTS.map(({ key, name }) => ({ key, name }))}
          current={current.key}
          onChange={(key) => void navigate({ to: '/board', search: { variant: key }, replace: true })}
          onReset={() => setResetKey((n) => n + 1)}
        />
      </TooltipProvider>
    </MotionConfig>
  )
}

function VariantHost({ children }: { children: React.ReactNode }) {
  const { draggingId } = useBoard()
  return (
    <div data-dnd-dragging={draggingId ? '' : undefined} className='contents'>
      {children}
    </div>
  )
}
