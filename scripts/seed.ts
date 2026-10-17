import 'dotenv/config'
import { hashPassword } from 'better-auth/crypto'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from '../src/server/db/schema'
import { accounts, buckets, categories, tags, todoTags, todos, users } from '../src/server/db/schema'
import { seedUsers } from './seed-users'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database.')
}

const pool = new Pool({ connectionString: databaseUrl })
const db = drizzle(pool, { schema })

const primaryUserId = seedUsers.seed_user_with_data.id

async function main() {
  const now = new Date()
  const shouldReset = !process.argv.includes('--skip-reset')

  if (shouldReset) {
    await resetDatabase()
  }

  await seedAuthUsers(now)
  const seedBuckets = await seedPrimaryUserBuckets(now)
  const seedCategories = await seedPrimaryUserCategories()
  const seedTags = await seedPrimaryUserTags()
  await seedPrimaryUserTodos(seedBuckets, seedCategories, seedTags, now)

  console.log(
    [
      'Seed completed.',
      `Users: ${Object.values(seedUsers)
        .map((user) => `${user.email} / ${user.password}`)
        .join(', ')}`,
      `Buckets: ${seedBuckets.length}`,
      `Categories: ${seedCategories.length}`,
      `Tags: ${seedTags.length}`,
      'Todos: 25',
      shouldReset ? 'Database was reset before seeding.' : 'Database reset was skipped.',
    ].join('\n'),
  )
}

async function resetDatabase() {
  await db.execute(
    sql`truncate table "todo_tags", "todos", "tags", "categories", "buckets", "accounts", "sessions", "verifications", "users", "auth_rate_limits" restart identity cascade`,
  )
}

async function seedAuthUsers(now: Date) {
  await db.insert(users).values(
    Object.values(seedUsers).map((user) => ({
      createdAt: now,
      email: user.email,
      emailVerified: true,
      id: user.id,
      name: user.name,
      updatedAt: now,
    })),
  )

  await db.insert(accounts).values(
    await Promise.all(
      Object.values(seedUsers).map(async (user) => ({
        accountId: user.id,
        createdAt: now,
        id: `seed-account-${user.id}`,
        password: await hashPassword(user.password),
        providerId: 'credential',
        updatedAt: now,
        userId: user.id,
      })),
    ),
  )
}

async function seedPrimaryUserBuckets(now: Date) {
  const periods = getCurrentPeriods(now)

  return db
    .insert(buckets)
    .values([
      {
        period: 'inbox',
        status: 'active',
        type: 'inbox',
        userId: primaryUserId,
      },
      {
        period: periods.year,
        status: 'active',
        type: 'yearly',
        userId: primaryUserId,
      },
      {
        period: periods.month,
        status: 'active',
        type: 'monthly',
        userId: primaryUserId,
      },
      {
        period: periods.week,
        status: 'active',
        type: 'weekly',
        userId: primaryUserId,
      },
      {
        period: periods.day,
        status: 'active',
        type: 'daily',
        userId: primaryUserId,
      },
    ])
    .returning()
}

async function seedPrimaryUserCategories() {
  return db
    .insert(categories)
    .values([
      {
        colorKey: 'blue',
        name: 'work',
        userId: primaryUserId,
      },
      {
        colorKey: 'green',
        name: 'home admin',
        userId: primaryUserId,
      },
      {
        colorKey: 'amber',
        name: 'personal',
        userId: primaryUserId,
      },
      {
        colorKey: 'rose',
        name: 'health',
        userId: primaryUserId,
      },
    ])
    .returning()
}

async function seedPrimaryUserTags() {
  return db
    .insert(tags)
    .values([
      {
        colorKey: 'blue',
        name: 'urgent',
        userId: primaryUserId,
      },
      {
        colorKey: 'green',
        name: 'focus',
        userId: primaryUserId,
      },
      {
        colorKey: 'amber',
        name: 'blocked',
        userId: primaryUserId,
      },
      {
        colorKey: 'orange',
        name: 'waiting',
        userId: primaryUserId,
      },
      {
        colorKey: 'rose',
        name: 'quick-win',
        userId: primaryUserId,
      },
    ])
    .returning()
}

async function seedPrimaryUserTodos(
  seedBuckets: Array<typeof buckets.$inferSelect>,
  seedCategories: Array<typeof categories.$inferSelect>,
  seedTags: Array<typeof tags.$inferSelect>,
  now: Date,
) {
  const todoCountByBucketId = new Map<number, number>()
  const seedTodos = await db
    .insert(todos)
    .values(
      Array.from({ length: 25 }, (_, index) => {
        const todoIndex = index + 1
        const bucket = seedBuckets[index % seedBuckets.length]
        const category = todoIndex <= 5 ? seedCategories[index % seedCategories.length] : undefined
        const bucketTodoCount = (todoCountByBucketId.get(bucket.id) ?? 0) + 1
        todoCountByBucketId.set(bucket.id, bucketTodoCount)

        return {
          bucketId: bucket.id,
          categoryId: category?.id ?? null,
          completed: false,
          createdAt: new Date(now.getTime() + todoIndex * 1000),
          description: `Seed todo description ${String(todoIndex).padStart(2, '0')}`,
          position: bucketTodoCount * 1024,
          title: `Seed Todo ${String(todoIndex).padStart(2, '0')}`,
          userId: primaryUserId,
        }
      }),
    )
    .returning()

  await db.insert(todoTags).values([
    { tagId: seedTags[0].id, todoId: seedTodos[0].id },
    { tagId: seedTags[1].id, todoId: seedTodos[0].id },
    { tagId: seedTags[1].id, todoId: seedTodos[1].id },
    { tagId: seedTags[2].id, todoId: seedTodos[1].id },
    { tagId: seedTags[2].id, todoId: seedTodos[2].id },
    { tagId: seedTags[3].id, todoId: seedTodos[2].id },
    { tagId: seedTags[3].id, todoId: seedTodos[3].id },
    { tagId: seedTags[4].id, todoId: seedTodos[4].id },
  ])
}

function getCurrentPeriods(date: Date) {
  const year = date.getFullYear()
  const month = `${year}-${pad(date.getMonth() + 1)}`
  const day = `${month}-${pad(date.getDate())}`
  const { week, weekYear } = getIsoWeek(date)

  return {
    day,
    month,
    week: `${weekYear}-W${pad(week)}`,
    year: String(year),
  }
}

function getIsoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7

  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)

  const weekYear = target.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)

  return { week, weekYear }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed.')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
