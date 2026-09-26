import { readOperationError } from '@/features/shared/utils/operation-error'
import { STALE_TODO_POSITIONS_MESSAGE } from '@/lib/todo-error-messages'

export async function isStaleMoveConflict(error: unknown) {
  if (!(error instanceof Response) || error.status !== 409) {
    return false
  }

  return (await readOperationError(error))?.message === STALE_TODO_POSITIONS_MESSAGE
}
