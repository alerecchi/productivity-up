import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'

import type { Database } from '@/server/db/client'
import { authEmailDeliveries } from '@/server/db/schema'
import type { AuthEmailStore } from '@/server/email/queue'

const createdAtMilliseconds = sql<Date>`date_trunc('milliseconds', ${authEmailDeliveries.createdAt})`

/** Stores authentication email work in the `auth_email_deliveries` outbox. */
export function createAuthEmailRepository(db: Database): AuthEmailStore {
  return {
    create: async (work) => {
      const [row] = await db
        .insert(authEmailDeliveries)
        .values({
          actionUrl: work.actionUrl,
          expiresAt: work.expiresAt,
          kind: work.kind,
          recipient: work.recipient,
          recipientName: work.recipientName ?? null,
          userId: work.userId,
        })
        .returning({ id: authEmailDeliveries.id })

      return row.id
    },
    find: async (id) => {
      const [row] = await db
        .select({
          actionUrl: authEmailDeliveries.actionUrl,
          createdAt: authEmailDeliveries.createdAt,
          expiresAt: authEmailDeliveries.expiresAt,
          id: authEmailDeliveries.id,
          kind: authEmailDeliveries.kind,
          queuedAt: authEmailDeliveries.queuedAt,
          recipient: authEmailDeliveries.recipient,
          recipientName: authEmailDeliveries.recipientName,
          status: authEmailDeliveries.status,
        })
        .from(authEmailDeliveries)
        .where(eq(authEmailDeliveries.id, id))

      return row
    },
    listPendingForDispatch: (now, limit, after) =>
      db
        .select({ createdAt: authEmailDeliveries.createdAt, id: authEmailDeliveries.id })
        .from(authEmailDeliveries)
        .where(
          and(
            eq(authEmailDeliveries.status, 'pending'),
            isNull(authEmailDeliveries.queuedAt),
            gt(authEmailDeliveries.expiresAt, now),
            after &&
              or(
                gt(createdAtMilliseconds, after.createdAt),
                and(eq(createdAtMilliseconds, after.createdAt), gt(authEmailDeliveries.id, after.id)),
              ),
          ),
        )
        .orderBy(asc(createdAtMilliseconds), asc(authEmailDeliveries.id))
        .limit(limit),
    markQueued: async (id, queuedAt) => {
      await db
        .update(authEmailDeliveries)
        .set({ queuedAt })
        .where(
          and(
            eq(authEmailDeliveries.id, id),
            eq(authEmailDeliveries.status, 'pending'),
            isNull(authEmailDeliveries.queuedAt),
          ),
        )
    },
    finish: async (id, result) => {
      await db
        .update(authEmailDeliveries)
        .set({
          actionUrl: null,
          attempts: result.attempts,
          completedAt: new Date(),
          providerMessageId: result.providerMessageId ?? null,
          recipient: null,
          recipientName: null,
          status: result.status,
        })
        .where(and(eq(authEmailDeliveries.id, id), eq(authEmailDeliveries.status, 'pending')))
    },
  }
}

/** Clears secrets from pending work after its link expires, even when Queue delivery is exhausted or unavailable. */
export async function expirePendingAuthEmailWork(db: Database, now: Date) {
  const rows = await db
    .update(authEmailDeliveries)
    .set({
      actionUrl: null,
      completedAt: now,
      recipient: null,
      recipientName: null,
      status: 'expired',
    })
    .where(and(eq(authEmailDeliveries.status, 'pending'), lte(authEmailDeliveries.expiresAt, now)))
    .returning({ id: authEmailDeliveries.id })

  return rows.length
}
