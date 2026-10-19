// PROTOTYPE (throwaway): floating bar that cycles `?variant=` on the current route. Dev builds only.
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'

type Variant = { key: string; name: string }

export function PrototypeSwitcher({ current, variants }: { current: string | undefined; variants: ReadonlyArray<Variant> }) {
  const navigate = useNavigate()
  // "Today" (no variant) is part of the cycle so the current board stays one click away.
  const cycle: ReadonlyArray<Variant> = [{ key: '', name: 'Current board' }, ...variants]
  const index = Math.max(
    0,
    cycle.findIndex(({ key }) => key === (current ?? '')),
  )

  const go = (step: number) => {
    const next = cycle[(index + step + cycle.length) % cycle.length]
    void navigate({ replace: true, search: ((prev: Record<string, unknown>) => ({ ...prev, variant: next.key || undefined })) as never, to: '.' })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Arrow keys belong to whatever has focus (keyboard drag, menus, tabs); only react on the page itself.
      if (target && target !== document.body && !target.closest('[data-prototype-switcher]')) return
      if (target?.closest('input, textarea, select, [contenteditable], [role="menu"], [role="tablist"], [role="dialog"]')) return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!import.meta.env.DEV) return null

  const label = cycle[index].key ? `${cycle[index].key} (${cycle[index].name})` : cycle[index].name

  return (
    <div
      className='fixed bottom-44 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 p-1 text-sm font-semibold text-white shadow-lg shadow-black/30 md:bottom-4'
      data-prototype-switcher
    >
      <button aria-label='Previous variant' className='rounded-full p-2 hover:bg-white/15' type='button' onClick={() => go(-1)}>
        <ChevronLeft className='size-4' />
      </button>
      <span className='px-2 whitespace-nowrap'>{label}</span>
      <button aria-label='Next variant' className='rounded-full p-2 hover:bg-white/15' type='button' onClick={() => go(1)}>
        <ChevronRight className='size-4' />
      </button>
    </div>
  )
}
