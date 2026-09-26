import { STALE_TODO_POSITIONS_MESSAGE } from '@/lib/todo-error-messages'

export async function isStaleMoveConflict(error: unknown) {
  if (!(error instanceof Response) || error.status !== 409) {
    return false
  }

  try {
    const body: unknown = await error.clone().json()

    if (typeof body !== 'object' || body === null || !('error' in body)) {
      return false
    }

    const errorBody = body.error
    return (
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'message' in errorBody &&
      errorBody.message === STALE_TODO_POSITIONS_MESSAGE
    )
  } catch {
    return false
  }
}
