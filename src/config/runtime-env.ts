import { env } from 'cloudflare:workers'

import { parseCloudflareRuntimeEnvironment, parseDevelopmentRuntimeEnvironment } from '@/config/runtime-environment'

export function getRuntimeEnvironment() {
  return import.meta.env.DEV ? parseDevelopmentRuntimeEnvironment(env) : parseCloudflareRuntimeEnvironment(env)
}
