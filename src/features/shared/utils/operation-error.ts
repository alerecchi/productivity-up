import z from 'zod'

/** The client's view of the server's operation error envelope. */
export type OperationErrorBody = z.infer<typeof operationErrorEnvelopeSchema>['error']

const operationErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string().optional() }),
})

/**
 * Reads the `{ error: { code, message? } }` envelope from a failed server function.
 * Reads from a clone, so the original Response body stays readable.
 * Returns undefined for non-Response errors and for malformed or non-JSON bodies.
 */
export async function readOperationError(error: unknown): Promise<OperationErrorBody | undefined> {
  if (!(error instanceof Response)) {
    return undefined
  }

  try {
    const json: unknown = await error.clone().json()
    return operationErrorEnvelopeSchema.safeParse(json).data?.error
  } catch {
    return undefined
  }
}

/**
 * Returns the envelope's safe message, or `fallbackMessage` otherwise: no message (e.g. 500 INTERNAL_ERROR),
 * malformed bodies, network failures, and unexpected exceptions.
 */
export async function getOperationErrorMessage(error: unknown, fallbackMessage: string) {
  return (await readOperationError(error))?.message ?? fallbackMessage
}
