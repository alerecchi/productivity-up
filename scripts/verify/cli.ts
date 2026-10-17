// Verification harness: runs an isolated app instance (throwaway local Postgres + `vite dev`)
// and drives it with Playwright. Used by the verify-productivity-up agent skill.
//
//   pnpm verify up [--port 3107]          start a fresh, migrated, seeded instance
//   pnpm verify doctor [--port 3107]      read-only health check of an instance
//   pnpm verify drive <journey.ts> [--port 3107] [--user seed_user_with_data|seed_user_without_data|none] [--headed]
//   pnpm verify sql "<select ...>" [--port 3107]   one read-only statement against the instance DB
//   pnpm verify reseed [--port 3107]      truncate and re-seed the instance DB
//   pnpm verify browser <action> [...]    step-by-step browser for exploring (see browser.ts)
//   pnpm verify down [--port 3107]        stop the instance and delete its scratch state
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { chromium } from '@playwright/test'
import { Client } from 'pg'

import { seedUsers } from '../seed-users'
import type { SeedUserKey } from '../seed-users'
import { closeBrowser, runBrowserAction, waitForHydration } from './browser'
import type { Journey, JourneyContext } from './journey'
import { groupAlive, stopProcessGroup } from './processes'

const root = process.cwd()
const verifyDir = path.join(root, '.verify')
const evidenceRoot = path.join(verifyDir, 'evidence')

type InstanceState = {
  /** Leader of the vite + workerd process group; unset until vite has been spawned. */
  appPid?: number
  baseUrl: string
  databaseUrl: string
  pgData: string
  pgPort: number
  port: number
  serverLog: string
  startedAt: string
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    exact: { default: false, type: 'boolean' },
    headed: { default: false, type: 'boolean' },
    key: { type: 'string' },
    label: { type: 'string' },
    name: { type: 'string' },
    nth: { type: 'string' },
    port: { default: process.env.VERIFY_PORT ?? '3107', type: 'string' },
    role: { type: 'string' },
    selector: { type: 'string' },
    text: { type: 'string' },
    user: { default: 'seed_user_with_data', type: 'string' },
    value: { type: 'string' },
  },
})

const [command, argument, browserArgument] = positionals
const port = Number(values.port)
const instanceDir = path.join(verifyDir, 'instances', String(port))
const stateFile = path.join(instanceDir, 'state.json')
const sessionFile = (user: SeedUserKey) => path.join(instanceDir, 'sessions', `${user}.json`)

const commands: Record<string, () => Promise<void> | void> = {
  browser: runBrowser,
  doctor,
  down,
  drive,
  reseed,
  sql: runSql,
  up,
}

if (!command || !(command in commands)) {
  console.error(`Usage: pnpm verify <${Object.keys(commands).join('|')}> [args]`)
  process.exit(2)
}

try {
  await commands[command]()
} catch (error) {
  console.error(`verify ${command} failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}

async function up() {
  if (existsSync(instanceDir)) {
    throw new Error(
      `Instance on port ${port} already exists. Run \`pnpm verify doctor --port ${port}\` or \`down\` first.`,
    )
  }
  // wrangler loads .dev.vars instead of .env* and process env, which would silently drop the overrides below.
  const devVars = readdirSync(root).filter((file) => file.startsWith('.dev.vars'))
  if (devVars.length > 0) {
    throw new Error(
      `${devVars.join(', ')} would override the instance's DATABASE_URL and RESEND_API_KEY. Move it away first.`,
    )
  }
  const pgPort = port + 50_000
  for (const [what, target] of [
    ['app', port],
    ['Postgres', pgPort],
  ] as const) {
    if (isPortListening(target)) {
      throw new Error(`Port ${target} (${what}) is used by a process this harness did not start. Pick another --port.`)
    }
  }

  const pgBin = findPostgresBin()
  const baseUrl = `http://localhost:${port}`
  const state: InstanceState = {
    baseUrl,
    databaseUrl: `postgresql://postgres@127.0.0.1:${pgPort}/productivity_up`,
    pgData: path.join(instanceDir, 'pgdata'),
    pgPort,
    port,
    serverLog: path.join(instanceDir, 'server.log'),
    startedAt: new Date().toISOString(),
  }
  // Written before anything is created, so `down` can always clean up a half-started instance.
  mkdirSync(instanceDir, { recursive: true })
  writeFileSync(stateFile, JSON.stringify(state, null, 2))

  try {
    log(`Creating Postgres cluster on 127.0.0.1:${pgPort}`)
    run(path.join(pgBin, 'initdb'), ['-D', state.pgData, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'])
    run(path.join(pgBin, 'pg_ctl'), [
      '-D',
      state.pgData,
      '-o',
      `-p ${pgPort} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,
      '-l',
      path.join(instanceDir, 'postgres.log'),
      '-w',
      'start',
    ])
    run(path.join(pgBin, 'createdb'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', 'productivity_up'])

    log('Applying migrations')
    run('pnpm', ['exec', 'drizzle-kit', 'migrate', '--config', 'drizzle.config.ts'], {
      DATABASE_URL_DIRECT: state.databaseUrl,
    })
    log('Seeding')
    run('pnpm', ['seed'], { DATABASE_URL: state.databaseUrl })

    log(`Starting vite dev on ${baseUrl}`)
    const logFd = openSync(state.serverLog, 'a')
    const app = spawn(path.join(root, 'node_modules/.bin/vite'), ['dev', '--port', String(port), '--strictPort'], {
      cwd: root,
      detached: true,
      env: instanceEnvironment(baseUrl, state.databaseUrl),
      stdio: ['ignore', logFd, logFd],
    })
    if (app.pid === undefined) throw new Error('vite could not be started')
    app.unref()
    state.appPid = app.pid
    writeFileSync(stateFile, JSON.stringify(state, null, 2))

    await waitForUsable(state)
    await captureSessions(state)
  } catch (error) {
    await down()
    throw error
  }
  log(`READY ${baseUrl} (users: ${Object.keys(seedUsers).join(', ')})`)
}

async function doctor() {
  const state = readState()
  const checks: Array<[string, boolean, string]> = []

  const appAlive = state.appPid !== undefined && isAlive(state.appPid)
  checks.push(['app process alive', appAlive, `pid ${state.appPid ?? 'never started'}`])

  const listeners = listeningPids(state.port)
  const owned = listeners.length > 0 && listeners.every((pid) => processGroup(pid) === state.appPid)
  checks.push(['port owned by our app', owned, `listeners: ${listeners.join(', ') || 'none'}`])

  const pgReady = spawnSync(path.join(findPostgresBin(), 'pg_isready'), ['-h', '127.0.0.1', '-p', String(state.pgPort)])
  checks.push(['postgres ready', pgReady.status === 0, `127.0.0.1:${state.pgPort}`])

  let seeded = false
  try {
    const rows = await query(state, 'select count(*)::int as n from users where id = any($1)', [
      Object.values(seedUsers).map(({ id }) => id),
    ])
    seeded = rows[0]?.n === Object.keys(seedUsers).length
  } catch {
    seeded = false
  }
  checks.push(['seed users present', seeded, Object.keys(seedUsers).join(', ')])

  for (const user of Object.keys(seedUsers) as Array<SeedUserKey>) {
    const session = await sessionEmail(state, user).catch((error: unknown) => String(error))
    const ok = session === seedUsers[user].email
    checks.push([
      `saved ${user} session valid`,
      ok,
      ok ? session : `${session}; \`pnpm verify reseed\` re-captures sessions`,
    ])
  }

  for (const [name, ok, detail] of checks) console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} (${detail})`)
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1
}

async function drive() {
  if (!argument)
    throw new Error('Usage: pnpm verify drive <journey.ts> [--user seed_user_with_data|seed_user_without_data|none]')
  const state = readState()
  const journeyPath = path.resolve(argument)
  const journeyName = path.basename(journeyPath).replace(/\.[cm]?[jt]s$/, '')
  const evidenceDir = path.join(evidenceRoot, `${timestamp()}-${journeyName}`)
  mkdirSync(evidenceDir, { recursive: true })

  const transcript: Array<string> = []
  const record = (line: string) => {
    const entry = `[${new Date().toISOString()}] ${line}`
    transcript.push(entry)
    console.log(entry)
  }
  const serverLogOffset = statSync(state.serverLog).size

  const user = values.user
  if (user !== 'none' && !(user in seedUsers))
    throw new Error(`Unknown --user ${user}; use ${Object.keys(seedUsers).join(', ')}, or none.`)

  const browser = await chromium.launch({ headless: !values.headed })
  const context = await browser.newContext({
    baseURL: state.baseUrl,
    // Reuses the session `up` captured, so a drive never signs in again.
    storageState: user === 'none' ? undefined : sessionFile(user as SeedUserKey),
    recordVideo: { dir: evidenceDir, size: { height: 900, width: 1440 } },
    viewport: { height: 900, width: 1440 },
  })
  await context.tracing.start({ screenshots: true, snapshots: true })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      record(`browser ${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => record(`page error: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) record(`http ${response.status()} ${response.request().method()} ${response.url()}`)
  })

  let shotIndex = 0
  const journeyContext: JourneyContext = {
    baseUrl: state.baseUrl,
    evidenceDir,
    hydrated: () => waitForHydration(page),
    page,
    shot: async (name) => {
      shotIndex += 1
      const file = `${String(shotIndex).padStart(2, '0')}-${name}.png`
      await page.screenshot({ fullPage: true, path: path.join(evidenceDir, file) })
      record(`screenshot ${file}`)
    },
    sql: async (text, params) => {
      const rows = await query(state, text, params)
      record(`sql ${text}${params ? ` ${JSON.stringify(params)}` : ''}\n${JSON.stringify(rows, null, 2)}`)
      return rows
    },
    step: (description) => record(`step ${description}`),
  }

  let outcome: 'fail' | 'pass' = 'pass'
  let failure: string | undefined
  try {
    if (user !== 'none') {
      journeyContext.step(`open /board as ${seedUsers[user as SeedUserKey].email} (saved session)`)
      await page.goto('/board')
      await waitForHydration(page)
      await page.getByRole('region', { name: 'Productivity Up board' }).waitFor()
    }
    const journeyModule = (await import(pathToFileURL(journeyPath).href)) as { default: Journey }
    await journeyModule.default(journeyContext)
  } catch (error) {
    outcome = 'fail'
    failure = error instanceof Error ? (error.stack ?? error.message) : String(error)
    record(`FAILED ${failure}`)
    await page.screenshot({ fullPage: true, path: path.join(evidenceDir, 'failure.png') }).catch(() => undefined)
  } finally {
    await context.tracing.stop({ path: path.join(evidenceDir, 'trace.zip') })
    await context.close()
    await browser.close()
  }

  writeFileSync(path.join(evidenceDir, 'transcript.log'), `${transcript.join('\n')}\n`)
  writeFileSync(path.join(evidenceDir, 'server.log'), readFileSync(state.serverLog).subarray(serverLogOffset))
  writeFileSync(
    path.join(evidenceDir, 'result.json'),
    JSON.stringify({ baseUrl: state.baseUrl, failure, journey: journeyPath, outcome, user }, null, 2),
  )
  console.log(`${outcome.toUpperCase()} evidence: ${path.relative(root, evidenceDir)}`)
  if (outcome === 'fail') process.exitCode = 1
}

async function runBrowser() {
  if (!argument) throw new Error('Usage: pnpm verify browser <open|goto|click|fill|press|snapshot|screenshot|close>')
  const state = readState()
  if (values.user !== 'none' && !(values.user in seedUsers)) {
    throw new Error(`Unknown --user ${values.user}; use ${Object.keys(seedUsers).join(', ')}, or none.`)
  }
  await runBrowserAction(
    {
      baseUrl: state.baseUrl,
      evidenceRoot,
      instanceDir,
      sessionFile: (user) => (user === 'none' ? undefined : sessionFile(user as SeedUserKey)),
    },
    argument,
    browserArgument,
    values,
  )
}

async function runSql() {
  if (!argument) throw new Error('Usage: pnpm verify sql "<select ...>"')
  console.log(JSON.stringify(await query(readState(), argument), null, 2))
}

async function reseed() {
  const state = readState()
  run('pnpm', ['seed'], { DATABASE_URL: state.databaseUrl })
  // The reset deletes every session, so the saved ones must be captured again.
  await captureSessions(state)
}

async function down() {
  if (!existsSync(instanceDir)) {
    log(`No instance on port ${port}.`)
    return
  }
  await closeBrowser(instanceDir)
  // The app runs as its own process group (vite + workerd children); stop the whole group, never by name.
  // workerd can outlive a crashed vite, so this checks the group, not just its leader.
  const appPid = existsSync(stateFile) ? readState().appPid : undefined
  if (appPid !== undefined && groupAlive(appPid)) await stopProcessGroup(appPid, 15_000)
  if (existsSync(path.join(instanceDir, 'pgdata', 'postmaster.pid'))) {
    run(path.join(findPostgresBin(), 'pg_ctl'), ['-D', path.join(instanceDir, 'pgdata'), '-m', 'fast', '-w', 'stop'])
  }
  rmSync(instanceDir, { force: true, recursive: true })
  log(`Instance on port ${port} removed. Evidence kept in ${path.relative(root, evidenceRoot)}/`)
}

function instanceEnvironment(baseUrl: string, databaseUrl: string) {
  // A CLOUDFLARE_ENV left in the shell would switch the Worker to the staging or production config.
  const { CLOUDFLARE_ENV: _ignored, ...inherited } = process.env
  return {
    ...inherited,
    // Lets process env override .env.local for the Worker bindings (up refuses to start if .dev.vars exists).
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    BETTER_AUTH_URL: baseUrl,
    DATABASE_URL: databaseUrl,
    // Invalid key: authentication emails fail at Resend instead of reaching real inboxes.
    RESEND_API_KEY: 're_verify_disabled',
    VITE_SERVER_URL: baseUrl,
  }
}

/** Signs each seed user in once through the real /login form and saves the browser session for `drive`. */
async function captureSessions(state: InstanceState) {
  mkdirSync(path.join(instanceDir, 'sessions'), { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const user of Object.keys(seedUsers) as Array<SeedUserKey>) {
      const { email, password } = seedUsers[user]
      log(`Signing in ${email} through /login`)
      const context = await browser.newContext({ baseURL: state.baseUrl })
      const page = await context.newPage()
      await page.goto('/login')
      await waitForHydration(page)
      await page.getByLabel('Email Address').fill(email)
      await page.getByLabel('Password', { exact: true }).fill(password)
      // The auth page also has a "Login" tab; the submit button is the one bound to the login form.
      await page.locator('button[type="submit"][form="login-form"]').click()
      await page.waitForURL('**/board')
      await page.getByRole('region', { name: 'Productivity Up board' }).waitFor()
      await context.storageState({ path: sessionFile(user) })
      await context.close()
    }
  } finally {
    await browser.close()
  }
  // Proves the app writes to this instance's database: a dev server pointed elsewhere would leave no sessions here.
  const [{ n }] = await query(state, 'select count(distinct user_id)::int as n from sessions where user_id = any($1)', [
    Object.values(seedUsers).map(({ id }) => id),
  ])
  if (n !== Object.keys(seedUsers).length) {
    throw new Error(
      `The app's sign-ins did not reach the instance database (${n} sessions); is it using another DATABASE_URL?`,
    )
  }
}

async function sessionEmail(state: InstanceState, user: SeedUserKey) {
  const { cookies } = JSON.parse(readFileSync(sessionFile(user), 'utf8')) as {
    cookies: Array<{ name: string; value: string }>
  }
  const response = await fetch(`${state.baseUrl}/api/auth/get-session`, {
    headers: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; ') },
  })
  if (!response.ok) return `HTTP ${response.status}`
  const session = (await response.json()) as { user?: { email?: string } } | null
  return session?.user?.email ?? 'no session'
}

async function waitForUsable(state: InstanceState) {
  await waitUntil(async () => {
    if (state.appPid === undefined || !groupAlive(state.appPid))
      throw new Error(`vite exited; see ${path.relative(root, state.serverLog)}`)
    const response = await fetch(`${state.baseUrl}/login`).catch(() => undefined)
    return response?.status === 200
  }, 120_000)
}

/** Read-only by construction: the session defaults to read-only, and the extended protocol allows one statement. */
async function query(state: InstanceState, text: string, params: Array<unknown> = []) {
  const client = new Client({
    connectionString: state.databaseUrl,
    options: '-c default_transaction_read_only=on',
  })
  await client.connect()
  try {
    await client.query('begin read only')
    // Named queries use the extended protocol, which accepts exactly one statement, so `commit; ...` can't end
    // the read-only transaction. Each call has its own connection, so the name never collides.
    const result = await client.query({ name: 'verify-sql', text, values: params })
    await client.query('rollback')
    return result.rows as Array<Record<string, unknown>>
  } finally {
    await client.end()
  }
}

function readState(): InstanceState {
  if (!existsSync(stateFile)) throw new Error(`No instance on port ${port}. Run \`pnpm verify up --port ${port}\`.`)
  return JSON.parse(readFileSync(stateFile, 'utf8')) as InstanceState
}

function findPostgresBin() {
  const candidates = [process.env.PG_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/usr/local/opt/postgresql@17/bin']
  const fromPath = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' })
  if (fromPath.status === 0) candidates.push(fromPath.stdout.trim())
  const bin = candidates.find((dir) => dir && existsSync(path.join(dir, 'initdb')))
  if (!bin) throw new Error('PostgreSQL binaries not found. Run `brew install postgresql@17` or set PG_BIN.')
  return bin
}

function run(file: string, args: Array<string>, extraEnv: Record<string, string> = {}) {
  const result = spawnSync(file, args, { cwd: root, env: { ...process.env, ...extraEnv }, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${path.basename(file)} ${args.join(' ')} exited with ${result.status}`)
}

function listeningPids(targetPort: number) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${targetPort}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
  return result.stdout.split('\n').filter(Boolean).map(Number)
}

function isPortListening(targetPort: number) {
  return listeningPids(targetPort).length > 0
}

function processGroup(pid: number) {
  return Number(spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim())
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitUntil(condition: () => boolean | Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s`)
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
}

function log(message: string) {
  console.log(`[verify] ${message}`)
}
