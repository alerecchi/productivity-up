/**
 * What the Worker gateway has authorized for one WebSocket connection. The gateway builds a fresh internal
 * request for the User's Durable Object, so caller-supplied headers never reach it.
 */
export type RealtimeConnectionGrant = {
  /** Epoch milliseconds after which the connection must re-authenticate. */
  authorizedUntil: number
  clientInstanceId: string
}

const AUTHORIZED_UNTIL_HEADER = 'X-Realtime-Authorized-Until'
const CLIENT_INSTANCE_ID_HEADER = 'X-Realtime-Client-Instance-Id'

export function createConnectionGrantRequest(grant: RealtimeConnectionGrant) {
  return new Request('https://user-realtime.internal/connect', {
    headers: {
      [AUTHORIZED_UNTIL_HEADER]: String(grant.authorizedUntil),
      [CLIENT_INSTANCE_ID_HEADER]: grant.clientInstanceId,
      Upgrade: 'websocket',
    },
  })
}

export function readConnectionGrant(request: Request): RealtimeConnectionGrant | null {
  const authorizedUntil = Number(request.headers.get(AUTHORIZED_UNTIL_HEADER))
  const clientInstanceId = request.headers.get(CLIENT_INSTANCE_ID_HEADER)

  if (!Number.isSafeInteger(authorizedUntil) || authorizedUntil <= 0 || !clientInstanceId) {
    return null
  }

  return { authorizedUntil, clientInstanceId }
}
