import { z } from 'zod'

export const AUTH_USER_FIELDS = {
  timeZone: {
    required: true,
    type: 'string',
  },
} as const

export const UserTimeZoneSchema = z.string().min(1).refine(isValidTimeZone, 'Timezone must be a valid IANA timezone')

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}
