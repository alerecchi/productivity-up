import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/utils/tailwind'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'

type PrototypeVariant = {
  key: string
  name: string
}

type PrototypeVariantSwitcherProps = {
  currentKey: string
  onChange: (key: string) => void
  variants: ReadonlyArray<PrototypeVariant>
}

export function PrototypeVariantSwitcher({ currentKey, onChange, variants }: PrototypeVariantSwitcherProps) {
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === currentKey),
  )
  const currentVariant = variants[currentIndex]
  const previousVariant = variants[(currentIndex - 1 + variants.length) % variants.length]
  const nextVariant = variants[(currentIndex + 1) % variants.length]

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null

      if (
        target?.closest('input, textarea, select, button, [contenteditable="true"]') ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return
      }

      event.preventDefault()
      onChange(event.key === 'ArrowLeft' ? previousVariant.key : nextVariant.key)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextVariant.key, onChange, previousVariant.key])

  if (import.meta.env.PROD) {
    return null
  }

  return (
    <div className='fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-foreground/10 bg-foreground px-2 py-2 text-background shadow-xl'>
      <Button
        type='button'
        size='icon-sm'
        variant='ghost'
        className='text-background hover:bg-background/15 hover:text-background'
        aria-label='Previous prototype variant'
        onClick={() => onChange(previousVariant.key)}
      >
        <ChevronLeft aria-hidden='true' />
      </Button>
      <div className='min-w-48 px-2 text-center text-xs font-medium'>
        <span className='font-semibold'>{currentVariant.key}</span>
        <span className={cn('text-background/70')}> - {currentVariant.name}</span>
      </div>
      <Button
        type='button'
        size='icon-sm'
        variant='ghost'
        className='text-background hover:bg-background/15 hover:text-background'
        aria-label='Next prototype variant'
        onClick={() => onChange(nextVariant.key)}
      >
        <ChevronRight aria-hidden='true' />
      </Button>
    </div>
  )
}
