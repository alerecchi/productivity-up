import { RequestValidationError } from '@/server/core/validation'

export type ErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'CONFLICT'
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'INTERNAL_ERROR'
  | 'ORIGIN_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_FAILED'

export class OperationError extends Error {
  readonly code: ErrorCode
  readonly retryAfterSeconds?: number
  readonly status: number

  constructor(status: number, code: ErrorCode, message: string, options?: { retryAfterSeconds?: number }) {
    super(message)
    this.name = 'OperationError'
    this.code = code
    this.retryAfterSeconds = options?.retryAfterSeconds
    this.status = status
  }
}

export function errorResponse(status: number, message: string) {
  return new OperationError(status, codeForStatus(status), message)
}

export function authenticationRequired() {
  return new OperationError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required')
}

export function emailVerificationRequired() {
  return new OperationError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification is required')
}

export function originNotAllowed() {
  return new OperationError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed')
}

export type MappedOperationError = {
  conflict: boolean
  outcome: 'conflict' | 'error' | 'forbidden' | 'not_found' | 'rate_limited' | 'unauthorized' | 'validation_error'
  rateLimited: boolean
  response: Response
  status: number
}

export async function mapOperationError(error: unknown, requestId: string): Promise<MappedOperationError> {
  if (error instanceof RequestValidationError) {
    return mappedError(
      400,
      'VALIDATION_FAILED',
      'Request validation failed',
      requestId,
      error.issues.map(({ code, message, path }) => ({ code, message, path })),
    )
  }

  if (error instanceof OperationError) {
    return mappedError(error.status, error.code, safeMessage(error), requestId, undefined, error.retryAfterSeconds)
  }

  if (error instanceof Response && error.status >= 400 && error.status < 500) {
    return mappedError(
      error.status,
      codeForStatus(error.status),
      await safeLegacyMessage(error),
      requestId,
      undefined,
      parseRetryAfter(error.headers.get('Retry-After')),
    )
  }

  return mappedError(500, 'INTERNAL_ERROR', undefined, requestId)
}

function mappedError(
  status: number,
  code: ErrorCode,
  message: string | undefined,
  requestId: string,
  details?: unknown,
  retryAfterSeconds?: number,
): MappedOperationError {
  const errorBody = {
    code,
    ...(message === undefined ? {} : { message }),
    ...(details === undefined ? {} : { details }),
  }
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  })

  if (status === 429) {
    headers.set('Retry-After', String(retryAfterSeconds ?? 60))
  }

  return {
    conflict: status === 409,
    outcome: outcomeForStatus(status),
    rateLimited: status === 429,
    response: new Response(JSON.stringify({ error: errorBody, requestId }), { headers, status }),
    status,
  }
}

function parseRetryAfter(value: string | null) {
  if (!value || !/^[1-9]\d{0,3}$/.test(value)) {
    return undefined
  }

  return Number(value)
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED'
    case 401:
      return 'AUTHENTICATION_REQUIRED'
    case 403:
      return 'EMAIL_VERIFICATION_REQUIRED'
    case 404:
      return 'RESOURCE_NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 429:
      return 'RATE_LIMITED'
    default:
      return 'INTERNAL_ERROR'
  }
}

function safeMessage(error: OperationError) {
  if (error.status === 404) {
    return 'Resource not found'
  }

  return error.message
}

async function safeLegacyMessage(response: Response) {
  if (response.status === 404) {
    return 'Resource not found'
  }

  if (response.status !== 400 && response.status !== 409 && response.status !== 429) {
    return undefined
  }

  try {
    const body: unknown = await response.clone().json()
    if (body && typeof body === 'object' && typeof Reflect.get(body, 'message') === 'string') {
      return Reflect.get(body, 'message') as string
    }
  } catch {
    // A legacy response body is optional; its contents never escape on parse failure.
  }

  return response.status === 429
    ? 'Too many requests'
    : response.status === 409
      ? 'Request conflict'
      : 'Invalid request'
}

function outcomeForStatus(status: number): MappedOperationError['outcome'] {
  switch (status) {
    case 400:
      return 'validation_error'
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 409:
      return 'conflict'
    case 429:
      return 'rate_limited'
    default:
      return 'error'
  }
}
