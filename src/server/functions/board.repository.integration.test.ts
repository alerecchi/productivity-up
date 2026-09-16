// @vitest-environment node

import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { createAuth } from '@/server/auth'
import * as schema from '@/server/db/schema'
import { loadBoardForUser, provisionInitialBoard } from '@/server/functions/board.core'
import { createBoardRepository } from '@/server/functions/board.repository'

vi.mock('@/server/email/sender', () => ({
  sendEmailConfirmation: vi.fn(),
  sendResetPassword: vi.fn(),
}))

const databaseUrl = process.env.DATABASE_URL
const describeWithPostgres = databaseUrl ? describe : describe.skip

describeWithPostgres('PostgreSQL initial board provisioning', () => {
  const schemaName = `issue_85_${randomUUID().replaceAll('-', '')}`
  let client: Client

  beforeAll(async () => {
    client = await connectToTestSchema(databaseUrl!, schemaName, true)
  })

  beforeEach(async () => {
    await client.query('TRUNCATE TABLE users CASCADE')
  })

  afterAll(async () => {
    await client.query('SET search_path TO public')
    await client.query(`DROP SCHEMA "${schemaName}" CASCADE`)
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

    const concurrentClients = await Promise.all(
      Array.from({ length: 4 }, () => connectToTestSchema(databaseUrl!, schemaName)),
    )

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

async function connectToTestSchema(connectionString: string, schemaName: string, createSchema = false) {
  const client = new Client({ connectionString })
  await client.connect()

  if (createSchema) {
    await client.query(`CREATE SCHEMA "${schemaName}"`)
    await client.query(`SET search_path TO "${schemaName}"`)
    await createTables(client)
  } else {
    await client.query(`SET search_path TO "${schemaName}"`)
  }

  return client
}

async function createTables(client: Client) {
  await client.query(`
    CREATE TYPE bucket_status AS ENUM ('active', 'pending_migration', 'archived');
    CREATE TYPE bucket_type AS ENUM ('inbox', 'yearly', 'monthly', 'weekly', 'daily');

    CREATE TABLE users (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      email_verified boolean DEFAULT false NOT NULL,
      image text,
      time_zone text,
      planning_date date,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );

    CREATE TABLE buckets (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      period text NOT NULL,
      type bucket_type NOT NULL,
      status bucket_status NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      archived_at timestamp with time zone,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT buckets_inbox_period_check CHECK (type <> 'inbox' OR period = 'inbox')
    );

    CREATE UNIQUE INDEX buckets_user_id_type_period_unique ON buckets(user_id, type, period);
    CREATE UNIQUE INDEX buckets_user_id_inbox_unique ON buckets(user_id) WHERE type = 'inbox';

    CREATE TABLE accounts (
      id text PRIMARY KEY,
      account_id text NOT NULL,
      provider_id text NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at timestamp,
      refresh_token_expires_at timestamp,
      scope text,
      password text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp NOT NULL
    );

    CREATE TABLE sessions (
      id text PRIMARY KEY,
      expires_at timestamp NOT NULL,
      token text NOT NULL UNIQUE,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp NOT NULL,
      ip_address text,
      user_agent text,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE verifications (
      id text PRIMARY KEY,
      identifier text NOT NULL,
      value text NOT NULL,
      expires_at timestamp NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `)
}

async function insertUser(client: Client, userId: string) {
  await client.query('INSERT INTO users (id, name, email, email_verified, time_zone) VALUES ($1, $2, $3, true, $4)', [
    userId,
    'Test User',
    `${userId}@example.com`,
    'Europe/Berlin',
  ])
}
