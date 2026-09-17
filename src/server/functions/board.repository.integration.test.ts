import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { createAuth } from '@/server/auth'
import * as schema from '@/server/db/schema'
import { loadBoardForUser, provisionInitialBoard } from '@/server/functions/board.core'
import { createBoardRepository } from '@/server/functions/board.repository'

vi.mock('@/server/email/sender', () => ({
  sendEmailConfirmation: vi.fn(),
  sendResetPassword: vi.fn(),
}))

const databaseUrl = requireTestDatabaseUrl()

describe('PostgreSQL board repository', () => {
  let client: Client

  beforeAll(async () => {
    client = await connectToTestDatabase(databaseUrl)
  })

  afterAll(async () => {
    await client.end()
  })

  test('creates the initial board state for a newly registered User', async () => {
    const repository = createBoardRepository(drizzle(client, { schema }))

    await insertUser(client, 'user-first')
    await provisionInitialBoard({
      now: () => new Date('2026-07-03T21:30:00.000Z'),
      repository,
      timeZone: 'Europe/Berlin',
      userId: 'user-first',
    })

    await expect(repository.getUser('user-first')).resolves.toMatchObject({
      planningDate: '2026-07-03',
      timeZone: 'Europe/Berlin',
    })
    await expect(repository.getActiveBuckets('user-first')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ period: 'inbox', type: 'inbox' }),
        expect.objectContaining({ period: '2026', type: 'yearly' }),
        expect.objectContaining({ period: '2026-07', type: 'monthly' }),
        expect.objectContaining({ period: '2026-W27', type: 'weekly' }),
        expect.objectContaining({ period: '2026-07-03', type: 'daily' }),
      ]),
    )
  })

  test('keeps production adapter reads scoped to the owning User after a write', async () => {
    const repository = createBoardRepository(drizzle(client, { schema }))
    const createdAt = new Date('2026-07-03T21:30:00.000Z')

    await insertUser(client, 'adapter-owner')
    await insertUser(client, 'adapter-foreigner')

    const bucket = await repository.createBucket({
      archivedAt: null,
      createdAt,
      period: 'inbox',
      status: 'active',
      type: 'inbox',
      userId: 'adapter-owner',
    })

    await expect(repository.findBucketById('adapter-owner', bucket.id)).resolves.toMatchObject({
      id: bucket.id,
      userId: 'adapter-owner',
    })
    await expect(repository.findBucketById('adapter-foreigner', bucket.id)).resolves.toBeUndefined()
    await expect(repository.getActiveBuckets('adapter-foreigner')).resolves.toEqual([])
  })

  test('provisions the initial board through Better Auth registration', async () => {
    const db = drizzle(client, { schema })

    await createAuth(db).api.signUpEmail({
      body: {
        email: 'auth-signup@example.com',
        name: 'Auth Signup',
        password: 'correct-horse-battery-staple',
        timeZone: 'Europe/Berlin',
      },
    })

    const createdUsers = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = 'auth-signup@example.com'",
    )
    const createdUser = createdUsers.rows[0]
    const repository = createBoardRepository(db)

    await expect(repository.getUser(createdUser.id)).resolves.toMatchObject({
      planningDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      timeZone: 'Europe/Berlin',
    })
    await expect(repository.getActiveBuckets(createdUser.id)).resolves.toHaveLength(5)
  })

  test('keeps registration successful and repairs on board load when post-commit provisioning fails', async () => {
    const db = drizzle(client, { schema })
    const repository = createBoardRepository(db)

    await client.query(`
      CREATE OR REPLACE FUNCTION fail_initial_board_for_test() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM users
          WHERE users.id = NEW.user_id AND users.email = 'provisioning-failure@example.com'
        ) THEN
          RAISE EXCEPTION 'forced initial board failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER fail_initial_board_for_test
      BEFORE INSERT ON buckets
      FOR EACH ROW EXECUTE FUNCTION fail_initial_board_for_test();
    `)

    await expect(
      createAuth(db).api.signUpEmail({
        body: {
          email: 'provisioning-failure@example.com',
          name: 'Provisioning Failure',
          password: 'correct-horse-battery-staple',
          timeZone: 'Europe/Berlin',
        },
      }),
    ).resolves.toMatchObject({ token: null })

    const createdUsers = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = 'provisioning-failure@example.com'",
    )
    const createdUser = createdUsers.rows[0]

    await expect(repository.getUser(createdUser.id)).resolves.toMatchObject({ planningDate: null })
    await expect(repository.getActiveBuckets(createdUser.id)).resolves.toEqual([])

    await client.query('DROP TRIGGER fail_initial_board_for_test ON buckets')

    const board = await loadBoardForUser({
      repository,
      userId: createdUser.id,
    })

    expect(board.status).toBe('ready')
    expect(board.buckets).toHaveLength(5)
  })

  test('retries without creating another Inbox or period Bucket', async () => {
    const repository = createBoardRepository(drizzle(client, { schema }))

    await insertUser(client, 'user-retry')
    await provisionInitialBoard({
      now: () => new Date('2026-07-03T21:30:00.000Z'),
      repository,
      timeZone: 'Europe/Berlin',
      userId: 'user-retry',
    })
    await provisionInitialBoard({
      now: () => new Date('2026-07-04T21:30:00.000Z'),
      repository,
      timeZone: 'Europe/Berlin',
      userId: 'user-retry',
    })

    await expect(repository.getActiveBuckets('user-retry')).resolves.toHaveLength(5)
    await expect(repository.getUser('user-retry')).resolves.toMatchObject({ planningDate: '2026-07-03' })
  })

  test('rolls back User planning fields when Bucket creation fails', async () => {
    const repository = createBoardRepository(drizzle(client, { schema }))

    await insertUser(client, 'user-failure')
    await expect(
      repository.commitInitialBoardState({
        buckets: [{ period: 'not-inbox', type: 'inbox' }],
        createdAt: new Date('2026-07-03T21:30:00.000Z'),
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
        userId: 'user-failure',
      }),
    ).rejects.toThrow()

    await expect(repository.getUser('user-failure')).resolves.toMatchObject({
      planningDate: null,
      timeZone: 'Europe/Berlin',
    })
    await expect(repository.getActiveBuckets('user-failure')).resolves.toEqual([])
  })

  test('concurrent requests converge on one initial board state', async () => {
    await insertUser(client, 'user-concurrent')

    const concurrentClients = await Promise.all(Array.from({ length: 4 }, () => connectToTestDatabase(databaseUrl)))

    try {
      await Promise.all(
        concurrentClients.map((concurrentClient) =>
          provisionInitialBoard({
            now: () => new Date('2026-07-03T21:30:00.000Z'),
            repository: createBoardRepository(drizzle(concurrentClient, { schema })),
            timeZone: 'Europe/Berlin',
            userId: 'user-concurrent',
          }),
        ),
      )
    } finally {
      await Promise.all(concurrentClients.map((concurrentClient) => concurrentClient.end()))
    }

    const repository = createBoardRepository(drizzle(client, { schema }))
    const buckets = await repository.getActiveBuckets('user-concurrent')

    expect(buckets).toHaveLength(5)
    expect(buckets.filter((bucket) => bucket.type === 'inbox')).toHaveLength(1)
  })
})

async function connectToTestDatabase(connectionString: string) {
  const client = new Client({ connectionString })
  await client.connect()
  return client
}

async function insertUser(client: Client, userId: string) {
  await client.query('INSERT INTO users (id, name, email, email_verified, time_zone) VALUES ($1, $2, $3, true, $4)', [
    userId,
    'Test User',
    `${userId}@example.com`,
    'Europe/Berlin',
  ])
}

function requireTestDatabaseUrl() {
  const connectionString = process.env.PRODUCTIVITY_UP_TEST_DATABASE_URL

  if (!connectionString) {
    throw new Error('Integration tests must run through pnpm test:integration')
  }

  const url = new URL(connectionString)
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1')
  const databaseName = decodeURIComponent(url.pathname.slice(1))

  if (!['127.0.0.1', '::1', 'localhost'].includes(hostname)) {
    throw new Error('Integration tests require a local PostgreSQL server')
  }

  if (!/^productivity_up_test_[0-9a-f]{32}$/.test(databaseName)) {
    throw new Error('Integration tests require a disposable productivity_up_test_* database')
  }

  return connectionString
}
