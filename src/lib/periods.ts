import type { BucketType } from '@/lib/types/Bucket'

export type TimeBasedBucketType = Exclude<BucketType, 'inbox'>
export type EnabledBucketType = BucketType

type BucketReference = {
  period: string
  type: BucketType
}

export const TIME_BASED_BUCKET_TYPES = [
  'yearly',
  'monthly',
  'weekly',
  'daily',
] as const satisfies Array<TimeBasedBucketType>
const BUCKET_TYPE_ORDER = ['inbox', ...TIME_BASED_BUCKET_TYPES] as const satisfies Array<BucketType>
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' })

export function derivePeriodKeys(localDate: string): Record<BucketType, string> {
  return {
    daily: derivePeriodKey('daily', localDate),
    inbox: 'inbox',
    monthly: derivePeriodKey('monthly', localDate),
    weekly: derivePeriodKey('weekly', localDate),
    yearly: derivePeriodKey('yearly', localDate),
  }
}

export function derivePeriodKey(type: BucketType, localDate: string): string {
  if (type === 'inbox') {
    return 'inbox'
  }

  const dateParts = parseLocalDate(localDate)

  if (type === 'yearly') {
    return String(dateParts.year)
  }

  if (type === 'monthly') {
    return `${dateParts.year}-${pad2(dateParts.month)}`
  }

  if (type === 'daily') {
    return formatLocalDateParts(dateParts)
  }

  const isoWeek = getIsoWeek(dateParts)
  return `${isoWeek.year}-W${pad2(isoWeek.week)}`
}

export function formatBucketLabel({ periodKey, type }: { periodKey: string; type: BucketType }): string {
  if (type === 'inbox') {
    return 'Inbox'
  }

  if (type === 'yearly') {
    return periodKey
  }

  if (type === 'monthly') {
    const [year, month] = parseYearMonthKey(periodKey)
    return MONTH_FORMATTER.format(toUtcDate({ day: 1, month, year }))
  }

  if (type === 'daily') {
    const dateParts = parseLocalDate(periodKey)
    return `${WEEKDAY_FORMATTER.format(toUtcDate(dateParts))} ${dateParts.day}`
  }

  const range = getIsoWeekDateRange(periodKey)
  const weekNumber = Number(periodKey.slice(6))
  const startMonth = range.start.month
  const endMonth = range.end.month
  const dateRange =
    startMonth === endMonth
      ? `${range.start.day}-${range.end.day}`
      : `${range.start.day} ${SHORT_MONTH_FORMATTER.format(toUtcDate(range.start))}-${range.end.day} ${SHORT_MONTH_FORMATTER.format(toUtcDate(range.end))}`

  return `Week ${weekNumber} (${dateRange})`
}

export function getPeriodBoundaries({
  periodKey,
  timeZone,
  type,
}: {
  periodKey: string
  timeZone: string
  type: TimeBasedBucketType
}): { end: Date; start: Date } {
  const start = getPeriodStartDate(type, periodKey)
  const end = addDaysToLocalDate(getPeriodEndDate(type, periodKey), 0)

  return {
    end: localMidnightToInstant(end, timeZone),
    start: localMidnightToInstant(start, timeZone),
  }
}

export function getTodayLocalDate(instant: Date, timeZone: string): string {
  return formatLocalDateParts(getZonedDateParts(instant, timeZone))
}

export function isFutureBucket({
  bucket,
  planningDate,
  today,
}: {
  bucket: BucketReference
  planningDate: string
  today: string
}): boolean {
  if (bucket.type === 'inbox' || planningDate <= today) {
    return false
  }

  return bucket.period === derivePeriodKey(bucket.type, planningDate)
}

export function getEnabledBucketTypes(enabledHorizons: Array<TimeBasedBucketType>): Array<EnabledBucketType> {
  const enabled = new Set(enabledHorizons)
  return BUCKET_TYPE_ORDER.filter((type) => type === 'inbox' || enabled.has(type))
}

export function getIsoWeekRange(periodKey: string): { end: string; start: string } {
  const range = getIsoWeekDateRange(periodKey)
  return {
    end: formatLocalDateParts(range.end),
    start: formatLocalDateParts(range.start),
  }
}

function getPeriodStartDate(type: TimeBasedBucketType, periodKey: string): LocalDateParts {
  if (type === 'yearly') {
    return { day: 1, month: 1, year: Number(periodKey) }
  }

  if (type === 'monthly') {
    const [year, month] = parseYearMonthKey(periodKey)
    return { day: 1, month, year }
  }

  if (type === 'daily') {
    return parseLocalDate(periodKey)
  }

  return getIsoWeekDateRange(periodKey).start
}

function getPeriodEndDate(type: TimeBasedBucketType, periodKey: string): LocalDateParts {
  if (type === 'yearly') {
    return { day: 1, month: 1, year: Number(periodKey) + 1 }
  }

  if (type === 'monthly') {
    const [year, month] = parseYearMonthKey(periodKey)
    return month === 12 ? { day: 1, month: 1, year: year + 1 } : { day: 1, month: month + 1, year }
  }

  if (type === 'daily') {
    return addDaysToLocalDate(parseLocalDate(periodKey), 1)
  }

  return addDaysToLocalDate(getIsoWeekDateRange(periodKey).start, 7)
}

function getIsoWeekDateRange(periodKey: string): { end: LocalDateParts; start: LocalDateParts } {
  const [yearText, weekText] = periodKey.split('-W')
  const year = Number(yearText)
  const week = Number(weekText)
  const weekOneMonday = startOfIsoWeek({ day: 4, month: 1, year })
  const start = addDaysToLocalDate(weekOneMonday, (week - 1) * 7)

  return {
    end: addDaysToLocalDate(start, 6),
    start,
  }
}

function getIsoWeek(dateParts: LocalDateParts): { week: number; year: number } {
  const weekStart = startOfIsoWeek(dateParts)
  const thursday = addDaysToLocalDate(weekStart, 3)
  const weekYear = thursday.year
  const weekOneMonday = startOfIsoWeek({ day: 4, month: 1, year: weekYear })
  const week = Math.floor((toUtcDate(weekStart).getTime() - toUtcDate(weekOneMonday).getTime()) / MS_PER_DAY / 7) + 1

  return { week, year: weekYear }
}

function startOfIsoWeek(dateParts: LocalDateParts): LocalDateParts {
  const date = toUtcDate(dateParts)
  const mondayBasedDay = (date.getUTCDay() + 6) % 7
  return addDaysToLocalDate(dateParts, -mondayBasedDay)
}

function addDaysToLocalDate(dateParts: LocalDateParts, days: number): LocalDateParts {
  const date = toUtcDate(dateParts)
  date.setUTCDate(date.getUTCDate() + days)

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  }
}

function localMidnightToInstant(dateParts: LocalDateParts, timeZone: string): Date {
  return localDateTimeToInstant({ ...dateParts, hour: 0, millisecond: 0, minute: 0, second: 0 }, timeZone)
}

function localDateTimeToInstant(dateTimeParts: LocalDateTimeParts, timeZone: string): Date {
  let utcMillis = Date.UTC(
    dateTimeParts.year,
    dateTimeParts.month - 1,
    dateTimeParts.day,
    dateTimeParts.hour,
    dateTimeParts.minute,
    dateTimeParts.second,
    dateTimeParts.millisecond,
  )

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const zonedParts = getZonedDateTimeParts(new Date(utcMillis), timeZone)
    const diff =
      Date.UTC(
        zonedParts.year,
        zonedParts.month - 1,
        zonedParts.day,
        zonedParts.hour,
        zonedParts.minute,
        zonedParts.second,
        zonedParts.millisecond,
      ) -
      Date.UTC(
        dateTimeParts.year,
        dateTimeParts.month - 1,
        dateTimeParts.day,
        dateTimeParts.hour,
        dateTimeParts.minute,
        dateTimeParts.second,
        dateTimeParts.millisecond,
      )

    if (diff === 0) {
      break
    }

    utcMillis -= diff
  }

  return new Date(utcMillis)
}

function getZonedDateParts(instant: Date, timeZone: string): LocalDateParts {
  const parts = getZonedDateTimeParts(instant, timeZone)
  return {
    day: parts.day,
    month: parts.month,
    year: parts.year,
  }
}

function getZonedDateTimeParts(instant: Date, timeZone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    fractionalSecondDigits: 3,
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  })
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]))

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    millisecond: Number(parts.fractionalSecond),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
  }
}

type LocalDateParts = {
  day: number
  month: number
  year: number
}

type LocalDateTimeParts = LocalDateParts & {
  hour: number
  millisecond: number
  minute: number
  second: number
}

function parseLocalDate(localDate: string): LocalDateParts {
  const [year, month, day] = localDate.split('-').map(Number)
  return { day, month, year }
}

function parseYearMonthKey(periodKey: string): [number, number] {
  const [year, month] = periodKey.split('-').map(Number)
  return [year, month]
}

function formatLocalDateParts({ day, month, year }: LocalDateParts): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function toUtcDate({ day, month, year }: LocalDateParts): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
