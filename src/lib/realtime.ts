import { z } from 'zod'

/** Path of the authenticated WebSocket endpoint for per-User realtime hints. */
export const REALTIME_PATH = '/api/realtime'

/**
 * The only server-to-client message. Hint contents are opaque to the transport; the client treats any hint it
 * does not recognize as a request for full resynchronization. There is deliberately no version or sequence.
 */
export const RealtimeMessageSchema = z.object({ hints: z.array(z.unknown()) }).strict()

export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>

/**
 * One committed domain consequence the User's other clients should refetch. Hints name only the affected domain
 * scope: never a User ID, a TanStack Query key, or Todo content. Remote clients refetch canonical state instead of
 * patching, because hints carry no ordering guarantee; a hint may only be patched directly once it carries complete
 * canonical data and an ordering guarantee.
 */
export const RealtimeHintSchema = z
  .object({
    bucketIds: z.array(z.int().positive()).min(1),
    type: z.enum(['todo-created', 'todo-deleted', 'todo-moved', 'todo-updated']),
  })
  .strict()

export type RealtimeHint = z.infer<typeof RealtimeHintSchema>

/** Request header naming the QueryClient that sent a mutation, so its own hints can skip it. */
export const CLIENT_INSTANCE_ID_HEADER = 'X-Client-Instance-Id'
