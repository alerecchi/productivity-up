/** Builds a failed server function Response shaped like the server's operation error envelope. */
export function operationErrorResponse(status: number, code: string, message?: string) {
  return new Response(
    JSON.stringify({ error: { code, ...(message === undefined ? {} : { message }) }, requestId: 'request-1' }),
    { headers: { 'Content-Type': 'application/json' }, status },
  )
}
