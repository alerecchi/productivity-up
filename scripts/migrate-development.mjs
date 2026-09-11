import { spawnSync } from 'node:child_process'

const developmentUrl = process.env.DATABASE_URL
if (!developmentUrl) {
  throw new Error('Local development database is not configured. Add DATABASE_URL to .env.local.')
}

const parsedDevelopmentUrl = parsePostgresUrl(developmentUrl)
if (parsedDevelopmentUrl.hostname.includes('-pooler')) {
  throw new Error('Development migrations require a direct, non-pooler DATABASE_URL.')
}

const deploymentDatabaseVariables = ['STAGING_DATABASE_URL_DIRECT', 'PRODUCTION_DATABASE_URL_DIRECT']
for (const variableName of deploymentDatabaseVariables) {
  const deploymentUrl = process.env[variableName]
  if (!deploymentUrl) continue

  const parsedDeploymentUrl = parsePostgresUrl(deploymentUrl)
  if (developmentUrl === deploymentUrl || parsedDevelopmentUrl.hostname === parsedDeploymentUrl.hostname) {
    throw new Error(`Refusing to migrate: DATABASE_URL matches ${variableName}.`)
  }
}

const migrationEnvironment = {
  ...process.env,
  DATABASE_URL_DIRECT: developmentUrl,
  NO_COLOR: '1',
}

for (const variableName of [
  ...deploymentDatabaseVariables,
  'APP_NAME',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'CLOUDFLARE_ENV',
  'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV',
  'DATABASE_URL',
  'EMAIL_FROM',
  'RESEND_API_KEY',
  'USER_EMAIL',
  'USER_PWD',
  'VITE_APP_NAME',
  'VITE_SERVER_URL',
]) {
  delete migrationEnvironment[variableName]
}

const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'migrate', '--config', 'drizzle.config.ts'], {
  cwd: process.cwd(),
  env: migrationEnvironment,
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1

function parsePostgresUrl(value) {
  let parsedUrl
  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error('Database URL is not a valid URL.')
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('Database URL must use the postgres or postgresql protocol.')
  }

  return parsedUrl
}
