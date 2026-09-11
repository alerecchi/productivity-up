import { randomUUID } from 'node:crypto'

import { hashPassword } from 'better-auth/crypto'
import pg from 'pg'

const { Client } = pg
const databaseUrl = requiredEnvironmentVariable('STAGING_DATABASE_URL_DIRECT')
const email = requiredEnvironmentVariable('STAGING_SMOKE_TEST_EMAIL').trim().toLowerCase()
const password = requiredEnvironmentVariable('STAGING_SMOKE_TEST_PASSWORD')
const productionDatabaseUrl = process.env.PRODUCTION_DATABASE_URL_DIRECT
const timeZone = 'Europe/Berlin'

validateConfiguration()

const client = new Client({ connectionString: databaseUrl })

try {
  await client.connect()
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock(hashtext($1))', [email])

  const now = new Date()
  const planningDate = getDateKey(now, timeZone)
  const userId = await ensureUser(now, planningDate)
  await ensureCredentialAccount(userId, now)
  await ensureBoard(userId, now, planningDate)

  await client.query('commit')
  console.log(`Staging smoke-test account is ready: ${email}`)
} catch (error) {
  await client.query('rollback').catch(() => undefined)
  throw error
} finally {
  await client.end()
}

async function ensureUser(now, planningDate) {
  const existing = await client.query('select id from users where email = $1', [email])

  if (existing.rowCount) {
    const userId = existing.rows[0].id
    await client.query(
      `update users
       set email_verified = true,
           time_zone = coalesce(time_zone, $2),
           planning_date = coalesce(planning_date, $3),
           updated_at = $4
       where id = $1`,
      [userId, timeZone, planningDate, now],
    )
    return userId
  }

  const userId = randomUUID()
  await client.query(
    `insert into users (id, name, email, email_verified, time_zone, planning_date, created_at, updated_at)
     values ($1, $2, $3, true, $4, $5, $6, $6)`,
    [userId, 'Staging smoke test', email, timeZone, planningDate, now],
  )
  return userId
}

async function ensureCredentialAccount(userId, now) {
  const passwordHash = await hashPassword(password)
  const updated = await client.query(
    `update accounts
     set password = $1, updated_at = $2
     where user_id = $3 and provider_id = 'credential'`,
    [passwordHash, now, userId],
  )

  if (updated.rowCount) return

  await client.query(
    `insert into accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
     values ($1, $2, 'credential', $2, $3, $4, $4)`,
    [randomUUID(), userId, passwordHash, now],
  )
}

async function ensureBoard(userId, now, planningDate) {
  const periods = getCurrentPeriods(planningDate)
  const bucketValues = [
    ['inbox', 'inbox'],
    ['yearly', periods.year],
    ['monthly', periods.month],
    ['weekly', periods.week],
    ['daily', periods.day],
  ]

  for (const [type, period] of bucketValues) {
    await client.query(
      `insert into buckets (period, type, status, created_at, user_id)
       values ($1, $2, 'active', $3, $4)
       on conflict (user_id, type, period) do nothing`,
      [period, type, now, userId],
    )
  }
}

function validateConfiguration() {
  const stagingUrl = parsePostgresUrl(databaseUrl, 'STAGING_DATABASE_URL_DIRECT')
  if (stagingUrl.hostname.includes('-pooler')) {
    throw new Error('STAGING_DATABASE_URL_DIRECT must use a direct, non-pooler host.')
  }

  if (productionDatabaseUrl) {
    const productionUrl = parsePostgresUrl(productionDatabaseUrl, 'PRODUCTION_DATABASE_URL_DIRECT')
    if (databaseUrl === productionDatabaseUrl || stagingUrl.hostname === productionUrl.hostname) {
      throw new Error('Refusing to continue because the staging database matches production.')
    }
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('STAGING_SMOKE_TEST_EMAIL must be an email address.')
  }
  if (password.length < 16) {
    throw new Error('STAGING_SMOKE_TEST_PASSWORD must contain at least 16 characters.')
  }
}

function parsePostgresUrl(value, variableName) {
  let parsedUrl
  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error(`${variableName} is not a valid URL.`)
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error(`${variableName} must use the postgres or postgresql protocol.`)
  }
  return parsedUrl
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function getDateKey(date, targetTimeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: targetTimeZone,
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function getCurrentPeriods(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayNumber = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber)
  const weekYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)

  return {
    day: dateKey,
    month: dateKey.slice(0, 7),
    week: `${weekYear}-W${String(week).padStart(2, '0')}`,
    year: dateKey.slice(0, 4),
  }
}
