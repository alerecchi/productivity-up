import { describe, expect, it } from 'vitest'

import { isStaleMoveConflict } from '@/features/board/hooks/move-todo-errors'
import { STALE_TODO_POSITIONS_MESSAGE } from '@/lib/todo-error-messages'

function conflictResponse(message: string) {
  return new Response(JSON.stringify({ error: { code: 'CONFLICT', message }, requestId: 'request-1' }), {
    status: 409,
  })
}

describe('isStaleMoveConflict', () => {
  it('matches only the stale positions conflict message', async () => {
    await expect(isStaleMoveConflict(conflictResponse(STALE_TODO_POSITIONS_MESSAGE))).resolves.toBe(true)
    await expect(isStaleMoveConflict(conflictResponse('Migration is required before changing Todos'))).resolves.toBe(
      false,
    )
  })

  it('returns false for malformed conflict responses', async () => {
    await expect(isStaleMoveConflict(new Response('not json', { status: 409 }))).resolves.toBe(false)
    await expect(isStaleMoveConflict(new Response('{}', { status: 409 }))).resolves.toBe(false)
  })
})
