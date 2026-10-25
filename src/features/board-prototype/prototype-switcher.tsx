// PROTOTYPE tooling: floating bar that cycles UI variants through a URL search param. Never rendered in production.
import { ChevronLeft, ChevronRight, Moon, RotateCcw, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/features/shared/utils/tailwind'

type Variant = { key: string; name: string }

const OWNS_ARROW_KEYS =
  'input, textarea, select, [contenteditable="true"], [role="menu"], [role="menuitem"], [role="tablist"], [role="tab"], [role="dialog"], [data-own-arrow-keys]'

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  onReset,
}: {
  variants: Array<Variant>
  current: string
  onChange: (key: string) => void
  onReset?: () => void
}) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  )
  const step = (delta: number) => onChange(variants[(index + delta + variants.length) % variants.length].key)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(OWNS_ARROW_KEYS) || target?.closest('[aria-roledescription="draggable"]')) return
      if (document.querySelector('[data-dnd-dragging]')) return
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const toggleTheme = () => {
    // Suppress every transition for the swap so colours do not smear.
    const style = document.createElement('style')
    style.append(document.createTextNode('*,*::before,*::after{transition:none !important}'))
    document.head.append(style)
    document.documentElement.classList.toggle('dark')
    setDark(document.documentElement.classList.contains('dark'))
    void document.body.offsetHeight
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
  }

  if (import.meta.env.PROD) return null

  const iconButton =
    'flex size-9 items-center justify-center rounded-full text-zinc-300 transition-[background-color,color,scale] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

  return (
    <div
      role='toolbar'
      aria-label='Prototype variants'
      className='fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-zinc-950 p-1 font-mono text-xs text-white shadow-[0_8px_30px_rgb(0_0_0/0.35)] select-none'
    >
      <button type='button' className={iconButton} aria-label='Previous variant' onClick={() => step(-1)}>
        <ChevronLeft className='size-4' />
      </button>
      <span aria-live='polite' className='px-1 text-center whitespace-nowrap tabular-nums sm:min-w-40'>
        <span className='hidden text-zinc-400 sm:inline'>
          {index + 1}/{variants.length}
        </span>{' '}
        {variants[index].name}
      </span>
      <button type='button' className={iconButton} aria-label='Next variant' onClick={() => step(1)}>
        <ChevronRight className='size-4' />
      </button>
      <span aria-hidden className='mx-0.5 h-5 w-px bg-white/15' />
      <button
        type='button'
        className={iconButton}
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
      >
        {dark ? <Sun className='size-4' /> : <Moon className='size-4' />}
      </button>
      {onReset ? (
        <button type='button' className={cn(iconButton)} aria-label='Reset prototype data' onClick={onReset}>
          <RotateCcw className='size-4' />
        </button>
      ) : null}
    </div>
  )
}
