import { DurableObject } from 'cloudflare:workers'

import type { RealtimeMessage } from '@/lib/realtime'
import { readConnectionGrant } from '@/server/realtime/connection-grant'
import type { RealtimeConnectionGrant } from '@/server/realtime/connection-grant'

export const REALTIME_AUTHORIZATION_EXPIRED_CLOSE_CODE = 4401

export type PublishOptions = {
  /** The client-instance ID whose own response already reconciled the change. */
  originClientInstanceId?: string
}

/**
 * One instance per User, addressed by User ID. It holds that User's hibernatable WebSocket connections and
 * fans hints out to them. Connections arrive only through the authenticated Worker gateway.
 */
export class UserRealtimeDurableObject extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    // Heartbeats are answered by the runtime without waking a hibernated object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request: Request) {
    const grant = readConnectionGrant(request)

    if (!grant || grant.authorizedUntil <= Date.now()) {
      return new Response(null, { status: 400 })
    }

    const nextAlarm = await this.ctx.storage.getAlarm()
    if (nextAlarm === null || nextAlarm > grant.authorizedUntil) {
      await this.ctx.storage.setAlarm(grant.authorizedUntil)
    }

    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment(grant)

    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  /** Clients only send heartbeats, which the auto-response answers; anything else is ignored. */
  webSocketMessage(_socket: WebSocket, _message: ArrayBuffer | string) {}

  /** Reauthorize idle connections at grant expiry without keeping the object awake between alarms. */
  async alarm() {
    const now = Date.now()
    let nextExpiry: number | undefined

    for (const socket of this.ctx.getWebSockets()) {
      const grant = socket.deserializeAttachment() as RealtimeConnectionGrant | null

      if (!grant || grant.authorizedUntil <= now) {
        socket.close(REALTIME_AUTHORIZATION_EXPIRED_CLOSE_CODE, 'Authorization expired')
      } else {
        nextExpiry = Math.min(nextExpiry ?? grant.authorizedUntil, grant.authorizedUntil)
      }
    }

    if (nextExpiry !== undefined) {
      await this.ctx.storage.setAlarm(nextExpiry)
    }
  }

  /**
   * Sends one opaque hint payload to the User's connections other than the origin client. A connection past
   * its authorization is closed instead, so the client re-authenticates and resynchronizes.
   */
  publish(hints: ReadonlyArray<unknown>, options: PublishOptions = {}) {
    const message = JSON.stringify({ hints: [...hints] } satisfies RealtimeMessage)
    const now = Date.now()

    for (const socket of this.ctx.getWebSockets()) {
      const grant = socket.deserializeAttachment() as RealtimeConnectionGrant | null

      if (!grant || grant.authorizedUntil <= now) {
        socket.close(REALTIME_AUTHORIZATION_EXPIRED_CLOSE_CODE, 'Authorization expired')
      } else if (grant.clientInstanceId !== options.originClientInstanceId) {
        socket.send(message)
      }
    }
  }
}
