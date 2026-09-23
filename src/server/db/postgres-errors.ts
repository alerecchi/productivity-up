export function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  let current = error

  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const databaseError = current as {
      cause?: unknown
      code?: unknown
      constraint?: unknown
      constraint_name?: unknown
    }

    if (databaseError.code === '23505') {
      const constraint = databaseError.constraint ?? databaseError.constraint_name
      return constraint === undefined || constraint === constraintName
    }

    current = databaseError.cause
  }

  return false
}
