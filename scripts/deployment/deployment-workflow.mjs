import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import {
  decideProductionDeployment,
  isExplicitConfirmation,
  parseLiveDeploymentMetadata,
} from './deployment-metadata.mjs'
import { createSafeChildProcessEnvironment } from './environment.mjs'

const productionUrl = 'https://productivity-up.com'
const workerNames = {
  production: 'productivity-up-production',
  staging: 'productivity-up-staging',
}

export async function deployStaging({ repositoryDirectory = process.cwd() } = {}) {
  fetchOrigin(repositoryDirectory)
  const sourceSha = resolveOriginMain(repositoryDirectory)

  return withDeploymentWorkspace({ environmentName: 'staging', repositoryDirectory, sourceSha }, (workspace) =>
    deployFromWorkspace({
      environmentName: 'staging',
      runSmokeTest: true,
      sourceSha,
      workspace,
    }),
  )
}

export async function deployProduction({ allowUnstaged, repositoryDirectory = process.cwd() } = {}) {
  fetchOrigin(repositoryDirectory)
  const sourceSha = resolveOriginMain(repositoryDirectory)

  let stagingMetadata
  let stagingLookupError
  try {
    stagingMetadata = queryLiveDeploymentMetadata(repositoryDirectory, workerNames.staging)
  } catch (error) {
    stagingLookupError = error instanceof Error ? error.message : String(error)
  }

  const stagingSha = stagingMetadata?.sourceSha
  if (stagingSha !== sourceSha) {
    printStagingWarning({ sourceSha, stagingLookupError, stagingSha })
  }

  const shouldDeploy = await decideProductionDeployment({
    allowUnstaged,
    confirm: () => confirmProductionDeployment(),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    stagingSha,
    targetSha: sourceSha,
  })
  if (!shouldDeploy) {
    throw new Error('Production deployment cancelled. Deploy this revision to staging or pass --allow-unstaged.')
  }

  return withDeploymentWorkspace({ environmentName: 'production', repositoryDirectory, sourceSha }, (workspace) =>
    deployFromWorkspace({
      environmentName: 'production',
      runSmokeTest: false,
      sourceSha,
      workspace,
    }),
  )
}

function fetchOrigin(repositoryDirectory) {
  run('jj', ['git', 'fetch', '--ignore-working-copy', '--remote', 'origin'], { cwd: repositoryDirectory })
}

function resolveOriginMain(repositoryDirectory) {
  const sourceSha = capture(
    'jj',
    ['log', '--ignore-working-copy', '--no-graph', '--color=never', '-r', 'main@origin', '-T', 'commit_id ++ "\\n"'],
    { cwd: repositoryDirectory },
  ).trim()

  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error('main@origin did not resolve to one full Git commit ID.')
  }
  return sourceSha.toLowerCase()
}

async function withDeploymentWorkspace({ environmentName, repositoryDirectory, sourceSha }, action) {
  const deploymentDirectory = mkdtempSync(join(tmpdir(), `productivity-up-${environmentName}-`))
  const workspaceName = `deploy-${environmentName}-${basename(deploymentDirectory)}`
  let workspaceCommit
  let workspaceRegistered = false

  try {
    run(
      'jj',
      [
        'workspace',
        'add',
        '--name',
        workspaceName,
        '--revision',
        sourceSha,
        '--sparse-patterns',
        'full',
        deploymentDirectory,
      ],
      { cwd: repositoryDirectory },
    )
    workspaceRegistered = true

    workspaceCommit = capture(
      'jj',
      ['log', '--ignore-working-copy', '--no-graph', '--color=never', '-r', '@', '-T', 'commit_id ++ "\\n"'],
      {
        cwd: deploymentDirectory,
      },
    ).trim()
    const workspaceParent = capture(
      'jj',
      ['log', '--ignore-working-copy', '--no-graph', '--color=never', '-r', '@-', '-T', 'commit_id ++ "\\n"'],
      { cwd: deploymentDirectory },
    ).trim()
    if (workspaceParent !== sourceSha) {
      throw new Error(`Temporary workspace is based on ${workspaceParent}, expected ${sourceSha}.`)
    }

    return await action({ deploymentDirectory })
  } finally {
    cleanUpDeploymentWorkspace({
      deploymentDirectory,
      repositoryDirectory,
      workspaceCommit,
      workspaceName,
      workspaceRegistered,
    })
  }
}

async function deployFromWorkspace({ environmentName, runSmokeTest, sourceSha, workspace }) {
  const { deploymentDirectory } = workspace
  const commandEnvironment = createCommandEnvironment(environmentName)
  const versionTag = `main-${sourceSha.slice(0, 12)}`

  run('pnpm', ['install', '--frozen-lockfile'], { cwd: deploymentDirectory, env: commandEnvironment })
  run('pnpm', [`build:${environmentName}`], { cwd: deploymentDirectory, env: commandEnvironment })
  runMigration(environmentName, deploymentDirectory, commandEnvironment)

  const deployOutput = captureAndPrint(
    'pnpm',
    ['exec', 'wrangler', 'deploy', '--tag', versionTag, '--message', `main ${sourceSha}`],
    { cwd: deploymentDirectory, env: commandEnvironment },
  )

  const liveMetadata = queryLiveDeploymentMetadata(deploymentDirectory, workerNames[environmentName])
  if (liveMetadata.sourceSha !== sourceSha || liveMetadata.tag !== versionTag) {
    throw new Error('Cloudflare did not report the newly deployed source revision as live.')
  }

  const deploymentUrl = getDeploymentUrl(environmentName, deployOutput)
  let smokeTestResult = 'not run (staging only)'
  let smokeTestError
  if (runSmokeTest) {
    try {
      await runStagingSmokeTest(deploymentUrl)
      smokeTestResult = 'passed'
    } catch (error) {
      smokeTestResult = 'FAILED'
      smokeTestError = error instanceof Error ? error.message : String(error)
    }
  }

  printDeploymentReport({
    deploymentUrl,
    environmentName,
    migrationResult: 'passed',
    smokeTestError,
    smokeTestResult,
    sourceSha,
    versionId: liveMetadata.versionId,
    versionTag,
  })
  if (smokeTestError) {
    throw new Error(`Staging smoke test failed after deployment: ${smokeTestError}`)
  }
}

function runMigration(environmentName, deploymentDirectory, commandEnvironment) {
  const migrationEnvironment = createMigrationEnvironment(environmentName, commandEnvironment)
  run('pnpm', ['exec', 'drizzle-kit', 'migrate', '--config', 'drizzle.config.ts'], {
    cwd: deploymentDirectory,
    env: migrationEnvironment,
  })
}

export function queryLiveDeploymentMetadata(repositoryDirectory, workerName) {
  const environment = createSafeChildProcessEnvironment()
  const deploymentOutput = capture(
    'pnpm',
    ['exec', 'wrangler', 'deployments', 'status', '--name', workerName, '--json'],
    { cwd: repositoryDirectory, env: environment },
  )
  const versionsOutput = capture('pnpm', ['exec', 'wrangler', 'versions', 'list', '--name', workerName, '--json'], {
    cwd: repositoryDirectory,
    env: environment,
  })
  return parseLiveDeploymentMetadata(deploymentOutput, versionsOutput)
}

async function runStagingSmokeTest(deploymentUrl) {
  const email = requiredEnvironmentVariable('STAGING_SMOKE_TEST_EMAIL')
  const password = requiredEnvironmentVariable('STAGING_SMOKE_TEST_PASSWORD')
  const origin = new URL(deploymentUrl).origin
  const signInResponse = await fetch(new URL('/api/auth/sign-in/email', deploymentUrl), {
    body: JSON.stringify({ email, password }),
    headers: { 'content-type': 'application/json', origin },
    method: 'POST',
    redirect: 'manual',
  })
  if (!signInResponse.ok) {
    throw new Error(`Staging sign-in returned HTTP ${signInResponse.status}.`)
  }

  const cookies = signInResponse.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ')
  if (!cookies) {
    throw new Error('Staging sign-in did not return a session cookie.')
  }

  try {
    const boardResponse = await fetch(new URL('/board', deploymentUrl), {
      headers: { cookie: cookies },
      redirect: 'manual',
    })
    if (!boardResponse.ok) {
      throw new Error(`Authenticated staging board load returned HTTP ${boardResponse.status}.`)
    }
    await boardResponse.arrayBuffer()
    await verifyRealtimeTransport(deploymentUrl, cookies)
  } finally {
    const signOutResponse = await fetch(new URL('/api/auth/sign-out', deploymentUrl), {
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json', cookie: cookies, origin },
      method: 'POST',
      redirect: 'manual',
    })
    if (!signOutResponse.ok) {
      throw new Error(`Staging smoke-test sign-out returned HTTP ${signOutResponse.status}.`)
    }
    await signOutResponse.arrayBuffer()
  }
}

/**
 * Proves the authenticated WebSocket path through the Worker and Durable Object: the signed-in User connects
 * and gets a heartbeat answer, while signed-out and foreign-origin upgrades are refused.
 */
export async function verifyRealtimeTransport(deploymentUrl, cookies) {
  const origin = new URL(deploymentUrl).origin
  const realtimeUrl = new URL(`/api/realtime?clientInstanceId=${crypto.randomUUID()}`, deploymentUrl)
  realtimeUrl.protocol = realtimeUrl.protocol === 'https:' ? 'wss:' : 'ws:'

  const authenticated = await openRealtimeSocket(realtimeUrl, { cookie: cookies, origin })
  if (authenticated.outcome !== 'pong') {
    throw new Error(`Authenticated realtime connection did not answer a heartbeat (${authenticated.outcome}).`)
  }

  for (const [label, headers] of [
    ['signed-out', { origin }],
    ['foreign-origin', { cookie: cookies, origin: 'https://foreign.example' }],
  ]) {
    const rejected = await openRealtimeSocket(realtimeUrl, headers)
    if (rejected.outcome !== 'rejected') {
      throw new Error(`A ${label} realtime connection was not rejected (${rejected.outcome}).`)
    }
  }

  // A caller cannot select another User's Durable Object, even while authenticated.
  const forgedUserUrl = new URL(realtimeUrl)
  forgedUserUrl.searchParams.set('userId', 'another-user')
  const forgedUser = await openRealtimeSocket(forgedUserUrl, { cookie: cookies, origin })
  if (forgedUser.outcome !== 'rejected') {
    throw new Error(`A caller-supplied realtime User ID was not rejected (${forgedUser.outcome}).`)
  }
}

function openRealtimeSocket(url, headers, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, { headers })
    let opened = false
    const finish = (outcome) => {
      clearTimeout(timer)
      socket.onclose = socket.onerror = socket.onmessage = socket.onopen = null
      socket.close()
      resolve({ outcome })
    }
    const timer = setTimeout(() => finish('timed out'), timeoutMs)

    socket.onopen = () => {
      opened = true
      socket.send('ping')
    }
    socket.onmessage = (event) => finish(event.data === 'pong' ? 'pong' : 'unexpected message')
    socket.onerror = socket.onclose = () => finish(opened ? 'closed' : 'rejected')
  })
}

export function createCommandEnvironment(environmentName, sourceEnvironment = process.env) {
  const environment = createSafeChildProcessEnvironment(sourceEnvironment)
  environment.CLOUDFLARE_ENV = environmentName
  environment.VITE_APP_NAME = sourceEnvironment.VITE_APP_NAME || 'Productivity Up'
  environment.VITE_SERVER_URL = environmentName === 'production' ? productionUrl : stagingPublicUrl(sourceEnvironment)
  return environment
}

export function createMigrationEnvironment(environmentName, commandEnvironment, sourceEnvironment = process.env) {
  const sourceVariable = `${environmentName.toUpperCase()}_DATABASE_URL_DIRECT`
  return {
    ...commandEnvironment,
    DATABASE_URL_DIRECT: requiredEnvironmentVariable(sourceVariable, sourceEnvironment),
  }
}

function getDeploymentUrl(environmentName, deployOutput) {
  if (environmentName === 'production') return productionUrl

  const configuredUrl = stagingPublicUrl()
  const urls = (deployOutput.match(/https:\/\/[^\s]+/g) ?? []).map((url) => url.replace(/[),.;]+$/, ''))
  if (!urls.includes(configuredUrl)) {
    throw new Error(`Wrangler did not report the configured staging URL ${configuredUrl}.`)
  }
  return configuredUrl
}

function stagingPublicUrl(sourceEnvironment = process.env) {
  const value = requiredEnvironmentVariable('STAGING_PUBLIC_URL', sourceEnvironment)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('STAGING_PUBLIC_URL must be an absolute HTTPS URL.')
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('STAGING_PUBLIC_URL must be an HTTPS origin without a path, query, or fragment.')
  }
  return url.origin
}

function printStagingWarning({ sourceSha, stagingLookupError, stagingSha }) {
  const stagingValue = stagingSha ?? `unavailable${stagingLookupError ? ` (${stagingLookupError})` : ''}`
  console.warn(`main@origin:     ${sourceSha}`)
  console.warn(`staging version: ${stagingValue}`)
  console.warn('')
  console.warn('This revision is not the version currently deployed to staging.')
  console.warn(`Deploy ${sourceSha} directly to production? [y/N]`)
}

async function confirmProductionDeployment() {
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await readline.question('> ')
    return isExplicitConfirmation(answer)
  } finally {
    readline.close()
  }
}

function printDeploymentReport({
  deploymentUrl,
  environmentName,
  migrationResult,
  smokeTestError,
  smokeTestResult,
  sourceSha,
  versionId,
  versionTag,
}) {
  console.log('')
  console.log(`${environmentName[0].toUpperCase()}${environmentName.slice(1)} deployment report`)
  console.log(`Source SHA:       ${sourceSha}`)
  console.log(`Cloudflare ID:    ${versionId}`)
  console.log(`Version tag:      ${versionTag}`)
  console.log(`URL:              ${deploymentUrl}`)
  console.log(`Migration:        ${migrationResult}`)
  console.log(`Smoke test:       ${smokeTestResult}`)
  if (smokeTestError) {
    console.error(`SMOKE TEST FAILED: ${smokeTestError}`)
    console.error('The staging deployment remains live. No rollback was attempted.')
  }
}

function cleanUpDeploymentWorkspace({
  deploymentDirectory,
  repositoryDirectory,
  workspaceCommit,
  workspaceName,
  workspaceRegistered,
}) {
  let canRemoveDirectory = true
  if (workspaceRegistered) {
    try {
      run('jj', ['workspace', 'forget', '--ignore-working-copy', workspaceName], { cwd: repositoryDirectory })
    } catch {
      canRemoveDirectory = false
      console.error(`Could not unregister deployment workspace ${workspaceName}.`)
      console.error(`Its files remain at ${deploymentDirectory}.`)
      process.exitCode = 1
    }
  }
  if (workspaceCommit) {
    try {
      run('jj', ['abandon', '--ignore-working-copy', workspaceCommit], { cwd: repositoryDirectory })
    } catch {
      console.error(`Could not abandon temporary deployment commit ${workspaceCommit}.`)
      process.exitCode = 1
    }
  }
  if (canRemoveDirectory) {
    rmSync(deploymentDirectory, { force: true, recursive: true })
  }
}

function requiredEnvironmentVariable(name, sourceEnvironment = process.env) {
  const value = sourceEnvironment[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function capture(command, arguments_, { cwd, env = process.env }) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function captureAndPrint(command, arguments_, { cwd, env = process.env }) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`)
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function run(command, arguments_, { cwd, env = process.env }) {
  execFileSync(command, arguments_, { cwd, env, stdio: 'inherit' })
}
