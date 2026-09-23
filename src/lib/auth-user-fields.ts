import { z } from 'zod'

export const AUTH_USER_FIELDS = {
  timeZone: {
    required: true,
    type: 'string',
  },
} as const

export const USER_TIME_ZONE_MAX_LENGTH = 255

export const UserTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(USER_TIME_ZONE_MAX_LENGTH)
  .refine(isValidTimeZone, 'Timezone must be a valid IANA timezone')

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
