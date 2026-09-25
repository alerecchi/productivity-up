import type { BetterAuthOptions } from 'better-auth/minimal'
import { sql } from 'drizzle-orm'

import type { Database } from '@/server/db/client'
import { authRateLimits } from '@/server/db/schema'

export type AuthRateLimitStorage = NonNullable<NonNullable<BetterAuthOptions['rateLimit']>['customStorage']>

/**
 * Records one request for `key` in its fixed window and returns the window's request count and start (epoch ms).
 * A window that started at or before `now - windowMs` is replaced by a new window starting at `now`.
 */
export type RateLimitCounter = (
  key: string,
  windowMs: number,
  now: number,
) => Promise<{ count: number; windowStartedAt: number }>

/** Per-IP limits for public authentication routes, keyed by Better Auth path. Windows are in seconds. */
export const AUTH_RATE_LIMIT_RULES = {
  '/request-password-reset': { max: 3, window: 15 * 60 },
  '/reset-password': { max: 5, window: 15 * 60 },
  '/send-verification-email': { max: 3, window: 15 * 60 },
  '/sign-in/email': { max: 10, window: 10 * 60 },
  '/sign-up/email': { max: 5, window: 60 * 60 },
}

/** Better Auth rate-limit storage that allows a request while its window count stays within the rule's max. */
export function createAuthRateLimitStorage(
  counter: RateLimitCounter,
  now: () => number = Date.now,
): AuthRateLimitStorage {
  return {
    consume: async (key, rule) => {
      const windowMs = rule.window * 1000
      const requestedAt = now()
      const { count, windowStartedAt } = await counter(key, windowMs, requestedAt)

      if (count <= rule.max) {
        return { allowed: true, retryAfter: null }
      }

      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((windowStartedAt + windowMs - requestedAt) / 1000)),
      }
    },
  }
}

/**
 * Counts requests in Neon with one atomic upsert, so every Worker isolate shares the same limits.
 * The statement only writes, which keeps it outside Hyperdrive's read cache.
 */
export function createNeonRateLimitCounter(db: Database): RateLimitCounter {
  return async (key, windowMs, now) => {
    const windowExpired = sql`${authRateLimits.windowStartedAt} <= ${now - windowMs}`
    const [row] = await db
      .insert(authRateLimits)
      .values({ count: 1, key, windowStartedAt: now })
      .onConflictDoUpdate({
        set: {
          count: sql`CASE WHEN ${windowExpired} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${windowExpired} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
        },
        target: authRateLimits.key,
      })
      .returning({ count: authRateLimits.count, windowStartedAt: authRateLimits.windowStartedAt })

    return row
  }
}
