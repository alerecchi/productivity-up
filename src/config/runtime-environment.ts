import { z } from 'zod'

export type RuntimeQueue = {
  send: (message: unknown) => Promise<void>
}

export type RuntimeDurableObjectNamespace = {
  getByName: (name: string) => unknown
}

export type RuntimeEnvironment = {
  application: {
    name: string
  }
  authentication: {
    baseUrl: string
    secret: string
  }
  database: {
    connectionString: string
  }
  email: {
    apiKey: string
    from: string
  }
} & (
  | {
      deployment: 'development'
    }
  | {
      bindings: {
        authEmailDeadLetterQueue: RuntimeQueue
        authEmailQueue: RuntimeQueue
        userRealtime: RuntimeDurableObjectNamespace
      }
      deployment: 'production' | 'staging'
    }
)

const absoluteHttpUrl = z.string().refine((value) => hasProtocol(value, ['http:', 'https:']))

const postgresUrl = z.string().refine((value) => hasProtocol(value, ['postgres:', 'postgresql:']))

const commonSchema = z.object({
  APP_NAME: z.string().trim().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: absoluteHttpUrl,
  EMAIL_FROM: z.email(),
  RESEND_API_KEY: z.string().trim().min(1),
})

const queueSchema = z.custom<RuntimeQueue>(hasCallableProperty('send'))
const durableObjectNamespaceSchema = z.custom<RuntimeDurableObjectNamespace>(hasCallableProperty('getByName'))

const developmentSchema = commonSchema.extend({
  DATABASE_URL: postgresUrl,
})

const cloudflareSchema = commonSchema.extend({
  AUTH_EMAIL_DEAD_LETTER_QUEUE: queueSchema,
  AUTH_EMAIL_QUEUE: queueSchema,
  ENVIRONMENT: z.enum(['production', 'staging']),
  HYPERDRIVE: z.object({ connectionString: postgresUrl }),
  USER_REALTIME: durableObjectNamespaceSchema,
})

export class RuntimeConfigurationError extends Error {
  constructor(keys: ReadonlyArray<string>) {
    super(`Missing or invalid runtime configuration: ${keys.join(', ')}.`)
    this.name = 'RuntimeConfigurationError'
  }
}

export function parseDevelopmentRuntimeEnvironment(source: unknown): RuntimeEnvironment {
  const environment = parseSafely(developmentSchema, source)

  return {
    ...commonEnvironment(environment),
    database: { connectionString: environment.DATABASE_URL },
    deployment: 'development',
  }
}

export function parseCloudflareRuntimeEnvironment(source: unknown): RuntimeEnvironment {
  const environment = parseSafely(cloudflareSchema, source)

  return {
    ...commonEnvironment(environment),
    bindings: {
      authEmailDeadLetterQueue: environment.AUTH_EMAIL_DEAD_LETTER_QUEUE,
      authEmailQueue: environment.AUTH_EMAIL_QUEUE,
      userRealtime: environment.USER_REALTIME,
    },
    database: { connectionString: environment.HYPERDRIVE.connectionString },
    deployment: environment.ENVIRONMENT,
  }
}

function commonEnvironment(environment: z.infer<typeof commonSchema>) {
  return {
    application: { name: environment.APP_NAME },
    authentication: {
      baseUrl: environment.BETTER_AUTH_URL,
      secret: environment.BETTER_AUTH_SECRET,
    },
    email: {
      apiKey: environment.RESEND_API_KEY,
      from: environment.EMAIL_FROM,
    },
  }
}

function parseSafely<TSchema extends z.ZodType>(schema: TSchema, source: unknown): z.infer<TSchema> {
  const result = schema.safeParse(source)

  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))].sort()
    throw new RuntimeConfigurationError(keys)
  }

  return result.data
}

function hasCallableProperty(property: string) {
  return (value: unknown) => {
    return typeof value === 'object' && value !== null && typeof Reflect.get(value, property) === 'function'
  }
}

function hasProtocol(value: string, allowedProtocols: ReadonlyArray<string>) {
  try {
    return allowedProtocols.includes(new URL(value).protocol)
  } catch {
    return false
  }
}
