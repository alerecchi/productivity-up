import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import pg from 'pg'

import { createSafeChildProcessEnvironment } from './deployment/environment.mjs'
import { requireDirectPostgresUrl, sharePostgresHost } from './deployment/postgres-url.mjs'

// Proves durable authentication email on the deployed staging Worker: a sign-up's verification email is queued and
// delivered through Resend, undeliverable work retries and reaches the dead-letter queue, and Worker logs stay free
// of recipients, links, tokens, and credentials. Creates one throwaway User and deletes it afterwards.

const { Client } = pg
const accountId = requiredEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID')
const accessClientId = requiredEnvironmentVariable('STAGING_CF_ACCESS_CLIENT_ID')
const accessClientSecret = requiredEnvironmentVariable('STAGING_CF_ACCESS_CLIENT_SECRET')
const databaseUrl = requiredEnvironmentVariable('STAGING_DATABASE_URL_DIRECT')
const productionDatabaseUrl = process.env.PRODUCTION_DATABASE_URL_DIRECT
const publicUrl = new URL(requiredEnvironmentVariable('STAGING_PUBLIC_URL'))
const queuesApiToken = requiredEnvironmentVariable('STAGING_QUEUES_API_TOKEN')
const resendApiKey = requiredEnvironmentVariable('STAGING_RESEND_API_KEY')

const EMAIL_QUEUE = 'productivity-up-staging-auth-email'
const DELIVERY_TIMEOUT_MS = 2 * 60_000
// Covers the 10 + 30 + 60 + 120 second backoff plus Queue scheduling slack.
const DEAD_LETTER_TIMEOUT_MS = 8 * 60_000
const runId = randomUUID()
const email = `delivered+${runId}@resend.dev`
const password = `${randomUUID()}-${randomUUID()}`
const undeliverableRecipient = `undeliverable-${runId}`
const undeliverableUrl = `${publicUrl.origin}/verify-email?token=staging-email-test-${runId}`

validateConfiguration()

const client = new Client({ connectionString: databaseUrl })
const tail = startTail()

try {
  await client.connect()
  await tail.ready

  const userId = await signUp()
  console.log('Verification email was queued by sign-up.')
  const delivery = await waitForVerificationDelivery(userId)
  await expectResendDelivery(delivery.providerMessageId)
  console.log('Verification email was delivered through Resend.')

  const workId = await insertUndeliverableWork(userId)
  await publish({ workId })
  const deadLettered = await waitForWork(workId, DEAD_LETTER_TIMEOUT_MS)
  if (deadLettered.status !== 'dead_lettered' || deadLettered.attempts !== 5) {
    throw new Error(`Undeliverable work ended as ${deadLettered.status} after ${deadLettered.attempts} attempts.`)
  }
  console.log('Undeliverable email was retried five times and dead-lettered.')

  // Leave time for the last records to stream through the tail.
  await delay(15_000)
  expectRedactedLogs(tail.output())
  console.log('Worker logs contain delivery records and no sensitive values.')
} finally {
  tail.stop()
  await client.query('delete from users where email = $1', [email]).catch(() => undefined)
  await client.end()
}

async function signUp() {
  const response = await fetch(new URL('/api/auth/sign-up/email', publicUrl), {
    body: JSON.stringify({ email, name: 'Staging email test', password, timeZone: 'Europe/Berlin' }),
    headers: { ...accessHeaders(), 'content-type': 'application/json', origin: publicUrl.origin },
    method: 'POST',
    redirect: 'manual',
  })
  if (!response.ok) throw new Error(`Sign-up failed with status ${response.status}.`)

  const { rows } = await client.query('select id from users where email = $1', [email])
  if (!rows[0]) throw new Error('Sign-up did not create the User.')
  return rows[0].id
}

async function waitForVerificationDelivery(userId) {
  const { rows } = await client.query(
    `select id from auth_email_deliveries where user_id = $1 and kind = 'email_verification'`,
    [userId],
  )
  if (rows.length !== 1) throw new Error(`Sign-up queued ${rows.length} verification emails instead of one.`)

  const delivery = await waitForWork(rows[0].id, DELIVERY_TIMEOUT_MS)
  if (delivery.status !== 'sent' || delivery.attempts !== 1) {
    throw new Error(`Verification email ended as ${delivery.status} after ${delivery.attempts} attempts.`)
  }
  if (delivery.recipient !== null || delivery.actionUrl !== null) {
    throw new Error('Sent work still stores its recipient or action URL.')
  }
  return delivery
}

async function waitForWork(workId, timeoutMs) {
  return poll(timeoutMs, async () => {
    const { rows } = await client.query(
      `select status, attempts, recipient, action_url as "actionUrl", provider_message_id as "providerMessageId"
       from auth_email_deliveries
       where id = $1`,
      [workId],
    )
    return rows[0]?.status === 'pending' ? undefined : rows[0]
  })
}

async function expectResendDelivery(providerMessageId) {
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerMessageId)}`, {
    headers: { authorization: `Bearer ${resendApiKey}` },
  })
  if (!response.ok) throw new Error(`Resend lookup failed with status ${response.status}.`)

  const sent = await response.json()
  if (!sent.to?.includes(email)) throw new Error('Resend did not send the email to the requested recipient.')
}

async function insertUndeliverableWork(userId) {
  const { rows } = await client.query(
    `insert into auth_email_deliveries (user_id, kind, recipient, recipient_name, action_url, expires_at)
     values ($1, 'email_verification', $2, 'Staging email test', $3, now() + interval '1 hour')
     returning id`,
    [userId, undeliverableRecipient, undeliverableUrl],
  )
  return rows[0].id
}

async function publish(body) {
  const queues = await cloudflare(`/queues?name=${encodeURIComponent(EMAIL_QUEUE)}`)
  const queue = queues.find((candidate) => candidate.queue_name === EMAIL_QUEUE)
  if (!queue) throw new Error(`Queue ${EMAIL_QUEUE} was not found.`)

  await cloudflare(`/queues/${queue.queue_id}/messages`, {
    body: JSON.stringify({ body, content_type: 'json' }),
    method: 'POST',
  })
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${queuesApiToken}`, 'content-type': 'application/json' },
  })
  const payload = await response.json()
  if (!response.ok || !payload.success) throw new Error(`Cloudflare API request failed with status ${response.status}.`)
  return payload.result
}

function startTail() {
  const chunks = []
  const child = spawn('pnpm', ['exec', 'wrangler', 'tail', '--env', 'staging', '--format', 'json'], {
    env: createSafeChildProcessEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => chunks.push(chunk))
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`wrangler tail exited with code ${code}.`)))
    // Wrangler reports the open tail on stderr; fall back to a fixed wait if that message changes.
    child.stderr.on('data', (chunk) => {
      if (/connected/i.test(String(chunk))) void delay(2_000).then(resolve)
    })
    void delay(15_000).then(resolve)
  })

  return {
    output: () => Buffer.concat(chunks).toString('utf8'),
    ready,
    stop: () => child.kill(),
  }
}

function expectRedactedLogs(output) {
  if (!output.includes('auth_email.deliver')) {
    throw new Error('Worker logs did not include authentication email delivery records.')
  }

  const sensitiveValues = {
    'action URL token': `staging-email-test-${runId}`,
    'Cloudflare Access secret': accessClientSecret,
    password,
    recipient: email,
    'Resend API key': resendApiKey,
    'undeliverable recipient': undeliverableRecipient,
  }
  for (const [name, value] of Object.entries(sensitiveValues)) {
    if (output.includes(value)) throw new Error(`Worker logs contain the ${name}.`)
  }
}

async function poll(timeoutMs, read) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await read()
    if (result) return result
    await delay(5_000)
  }
  throw new Error(`Timed out after ${timeoutMs / 1000} seconds.`)
}

function accessHeaders() {
  return {
    'CF-Access-Client-Id': accessClientId.replace(/^CF-Access-Client-Id:\s*/i, ''),
    'CF-Access-Client-Secret': accessClientSecret.replace(/^CF-Access-Client-Secret:\s*/i, ''),
  }
}

function validateConfiguration() {
  const stagingUrl = requireDirectPostgresUrl(databaseUrl, 'STAGING_DATABASE_URL_DIRECT')

  if (productionDatabaseUrl) {
    const productionUrl = requireDirectPostgresUrl(productionDatabaseUrl, 'PRODUCTION_DATABASE_URL_DIRECT')
    if (sharePostgresHost(stagingUrl, productionUrl)) {
      throw new Error('Refusing to continue because the staging database matches production.')
    }
  }
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}
