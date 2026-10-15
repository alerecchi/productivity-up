import type { RealtimeHint } from '@/lib/realtime'

/** Lifecycle and Migration Step commits change the canonical board and its Todo projections. */
export function boardChangedHint(): Array<RealtimeHint> {
  return [{ type: 'board-changed' }]
}
