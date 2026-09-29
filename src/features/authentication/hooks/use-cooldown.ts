import { useEffect, useState } from 'react'

/**
 * Counts down to a deadline in whole seconds. `extend` only ever moves the deadline later, so a shorter wait never
 * cuts a longer one short. `initialDeadline` is an epoch-millisecond timestamp.
 */
export function useCooldown(initialDeadline = 0) {
  const [deadline, setDeadline] = useState(initialDeadline)
  const [now, setNow] = useState(() => Date.now())
  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000))

  useEffect(() => {
    if (remainingSeconds === 0) {
      return
    }

    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [remainingSeconds])

  const extend = (seconds: number) => {
    const current = Date.now()
    setNow(current)
    setDeadline((previous) => Math.max(previous, current + seconds * 1000))
  }

  return { extend, remainingSeconds }
}

export type Cooldown = ReturnType<typeof useCooldown>

/** Formats a wait as `m:ss`, e.g. `1:00` or `0:42`. */
export function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
