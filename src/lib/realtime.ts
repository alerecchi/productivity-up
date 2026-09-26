import { z } from 'zod'

/** Path of the authenticated WebSocket endpoint for per-User realtime hints. */
export const REALTIME_PATH = '/api/realtime'

/**
 * The only server-to-client message. Hint contents are opaque to the transport; the client treats any hint it
 * does not recognize as a request for full resynchronization. There is deliberately no version or sequence.
 */
export const RealtimeMessageSchema = z.object({ hints: z.array(z.unknown()) }).strict()

export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>
