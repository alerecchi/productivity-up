import { spawnSync } from 'node:child_process'

import { createSafeChildProcessEnvironment } from './deployment/environment.mjs'
import { requireDirectPostgresUrl, sharePostgresHost } from './deployment/postgres-url.mjs'

const developmentUrl = process.env.DATABASE_URL
if (!developmentUrl) {
  throw new Error('Local development database is not configured. Add DATABASE_URL to .env.local.')
}

const parsedDevelopmentUrl = requireDirectPostgresUrl(developmentUrl, 'DATABASE_URL')

const deploymentDatabaseVariables = ['STAGING_DATABASE_URL_DIRECT', 'PRODUCTION_DATABASE_URL_DIRECT']
for (const variableName of deploymentDatabaseVariables) {
  const deploymentUrl = process.env[variableName]
  if (!deploymentUrl) continue

  const parsedDeploymentUrl = requireDirectPostgresUrl(deploymentUrl, variableName)
  if (sharePostgresHost(parsedDevelopmentUrl, parsedDeploymentUrl)) {
    throw new Error(`Refusing to migrate: DATABASE_URL matches ${variableName}.`)
  }
}

const migrationEnvironment = createSafeChildProcessEnvironment(process.env)
migrationEnvironment.DATABASE_URL_DIRECT = developmentUrl

const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'migrate', '--config', 'drizzle.config.ts'], {
  cwd: process.cwd(),
  env: migrationEnvironment,
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
