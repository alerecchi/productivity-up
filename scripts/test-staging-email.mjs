import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import pg from 'pg'

import { findAuthEmailSendRecord } from './deployment/auth-email-tail.mjs'
import { createSafeChildProcessEnvironment } from './deployment/environment.mjs'
import { requireDirectPostgresUrl, sharePostgresHost } from './deployment/postgres-url.mjs'

// Proves direct authentication email on the deployed staging Worker: a sign-up's verification email is sent through
// Resend after the response, the Worker records the send with safe fields, and Worker logs stay free of recipients,
// links, tokens, and credentials. Creates one throwaway User and deletes it afterwards.

const { Client } = pg
const accessClientId = requiredEnvironmentVariable('STAGING_CF_ACCESS_CLIENT_ID')
const accessClientSecret = requiredEnvironmentVariable('STAGING_CF_ACCESS_CLIENT_SECRET')
const databaseUrl = requiredEnvironmentVariable('STAGING_DATABASE_URL_DIRECT')
const productionDatabaseUrl = process.env.PRODUCTION_DATABASE_URL_DIRECT
const publicUrl = new URL(requiredEnvironmentVariable('STAGING_PUBLIC_URL'))
const resendApiKey = requiredEnvironmentVariable('STAGING_RESEND_API_KEY')

const SEND_RECORD_TIMEOUT_MS = 60_000
const runId = randomUUID()
const email = `delivered+${runId}@resend.dev`
const password = `${randomUUID()}-${randomUUID()}`

validateConfiguration()

const client = new Client({ connectionString: databaseUrl })
const tail = startTail()
let runError

try {
  await client.connect()
  await tail.ready

  const requestId = await signUp()
  console.log('Sign-up accepted.')
  const providerMessageId = await waitForSentRecord(requestId)
  console.log('Worker recorded the verification email as sent.')
  await expectResendDelivery(providerMessageId)
  console.log('Resend sent the verification email to the requested recipient.')

  expectRedactedLogs(tail.output())
  console.log('Worker logs contain no sensitive values.')
} catch (error) {
  runError = error
  throw error
} finally {
  tail.stop()
  await client.query('delete from users where email = $1', [email]).catch(() => undefined)
  try {
    await client.end()
  } catch (error) {
    if (!runError) throw error
  }
}

async function signUp() {
  const response = await fetch(new URL('/api/auth/sign-up/email', publicUrl), {
    body: JSON.stringify({ email, name: 'Staging email test', password, timeZone: 'Europe/Berlin' }),
    headers: { ...accessHeaders(), 'content-type': 'application/json', origin: publicUrl.origin },
    method: 'POST',
    redirect: 'manual',
  })
  if (!response.ok) throw new Error(`Sign-up failed with status ${response.status}.`)
  const requestId = response.headers.get('X-Request-ID')
  if (!requestId) throw new Error('Sign-up response did not include X-Request-ID.')
  return requestId
}

/** Waits for this run's `auth_email.send` record and returns its provider message ID. */
async function waitForSentRecord(requestId) {
  const deadline = Date.now() + SEND_RECORD_TIMEOUT_MS

  while (Date.now() < deadline) {
    const tailError = tail.error()
    if (tailError) throw tailError
    const output = tail.output()
    const record = findAuthEmailSendRecord(output, requestId)
    if (record?.outcome === 'failed') {
      const code = record.providerErrorCode ?? 'unknown'
      throw new Error(`The Worker recorded a failed send with provider error code ${code}.`)
    }

    if (record?.outcome === 'sent' && record.providerMessageId) return record.providerMessageId

    await delay(2_000)
  }

  const tailError = tail.error()
  if (tailError) throw tailError
  throw new Error(`No auth_email.send record arrived within ${SEND_RECORD_TIMEOUT_MS / 1000} seconds.`)
}

async function expectResendDelivery(providerMessageId) {
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerMessageId)}`, {
    headers: { authorization: `Bearer ${resendApiKey}` },
  })
  if (!response.ok) throw new Error(`Resend lookup failed with status ${response.status}.`)

  const sent = await response.json()
  if (!sent.to?.includes(email)) throw new Error('Resend did not send the email to the requested recipient.')
}

function startTail() {
  const chunks = []
  let tailError
  const child = spawn('pnpm', ['exec', 'wrangler', 'tail', '--env', 'staging', '--format', 'json'], {
    env: createSafeChildProcessEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => chunks.push(chunk))
  const ready = new Promise((resolve, reject) => {
    child.once('error', (error) => {
      tailError ??= error
      reject(tailError)
    })
    child.once('exit', (code) => {
      tailError ??= new Error(`wrangler tail exited with code ${code}.`)
      reject(tailError)
    })
    // Wrangler reports the open tail on stderr; fall back to a fixed wait if that message changes.
    child.stderr.on('data', (chunk) => {
      if (/connected/i.test(String(chunk))) void delay(2_000).then(resolve)
    })
    void delay(15_000).then(resolve)
  })

  return {
    error: () => tailError,
    output: () => Buffer.concat(chunks).toString('utf8'),
    ready,
    stop: () => child.kill(),
  }
}

function expectRedactedLogs(output) {
  const sensitiveValues = {
    'Cloudflare Access secret': accessClientSecret,
    password,
    recipient: email,
    'Resend API key': resendApiKey,
    'verification token': 'verify-email?token=',
  }
  for (const [name, value] of Object.entries(sensitiveValues)) {
    if (output.includes(value)) throw new Error(`Worker logs contain the ${name}.`)
  }
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
