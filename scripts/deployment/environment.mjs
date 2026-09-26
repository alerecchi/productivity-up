const sensitiveEnvironmentVariables = [
  'APP_NAME',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'CLOUDFLARE_ENV',
  'DATABASE_URL',
  'DATABASE_URL_DIRECT',
  'EMAIL_FROM',
  'PRODUCTION_BETTER_AUTH_SECRET',
  'PRODUCTION_DATABASE_URL_DIRECT',
  'PRODUCTION_EMAIL_FROM',
  'PRODUCTION_RESEND_API_KEY',
  'RESEND_API_KEY',
  'STAGING_BETTER_AUTH_SECRET',
  'STAGING_CF_ACCESS_CLIENT_ID',
  'STAGING_CF_ACCESS_CLIENT_SECRET',
  'STAGING_DATABASE_URL_DIRECT',
  'STAGING_EMAIL_FROM',
  'STAGING_PUBLIC_URL',
  'STAGING_RESEND_API_KEY',
  'STAGING_SMOKE_TEST_EMAIL',
  'STAGING_SMOKE_TEST_PASSWORD',
  'USER_EMAIL',
  'USER_PWD',
  'VITE_APP_NAME',
  'VITE_SERVER_URL',
]

export function createSafeChildProcessEnvironment(sourceEnvironment = process.env) {
  const environment = { ...sourceEnvironment }

  for (const variableName of sensitiveEnvironmentVariables) {
    delete environment[variableName]
  }

  environment.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
  environment.NO_COLOR = '1'
  return environment
}
