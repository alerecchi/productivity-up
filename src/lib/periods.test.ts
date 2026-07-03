import { describe, expect, it } from 'vitest'

import {
  derivePeriodKey,
  derivePeriodKeys,
  formatBucketLabel,
  getEnabledBucketTypes,
  getIsoWeekRange,
  getPeriodBoundaries,
  getTodayLocalDate,
  isFutureBucket,
} from '@/lib/periods'

describe('period utilities', () => {
  it('derives canonical Period Keys for a local Planning Date', () => {
    expect(derivePeriodKeys('2026-07-03')).toEqual({
      daily: '2026-07-03',
      inbox: 'inbox',
      monthly: '2026-07',
      weekly: '2026-W27',
      yearly: '2026',
    })

    expect(derivePeriodKey('weekly', '2026-01-01')).toBe('2026-W01')
    expect(derivePeriodKey('weekly', '2027-01-01')).toBe('2026-W53')
  })

  it('formats Bucket labels from Period Keys', () => {
    expect(formatBucketLabel({ periodKey: 'inbox', type: 'inbox' })).toBe('Inbox')
    expect(formatBucketLabel({ periodKey: '2026', type: 'yearly' })).toBe('2026')
    expect(formatBucketLabel({ periodKey: '2026-07', type: 'monthly' })).toBe('July')
    expect(formatBucketLabel({ periodKey: '2026-W26', type: 'weekly' })).toBe('Week 26 (22-28)')
    expect(formatBucketLabel({ periodKey: '2026-W27', type: 'weekly' })).toBe('Week 27 (29 Jun-5 Jul)')
    expect(formatBucketLabel({ periodKey: '2026-07-03', type: 'daily' })).toBe('Friday 3')

    expect(getIsoWeekRange('2026-W27')).toEqual({
      end: '2026-07-05',
      start: '2026-06-29',
    })
  })

  it('returns exclusive period ends in the User Timezone', () => {
    expect(getPeriodBoundaries({ periodKey: '2026-07-03', timeZone: 'Europe/Berlin', type: 'daily' })).toEqual({
      end: new Date('2026-07-03T22:00:00.000Z'),
      start: new Date('2026-07-02T22:00:00.000Z'),
    })

    expect(getPeriodBoundaries({ periodKey: '2026-W27', timeZone: 'Europe/Berlin', type: 'weekly' })).toEqual({
      end: new Date('2026-07-05T22:00:00.000Z'),
      start: new Date('2026-06-28T22:00:00.000Z'),
    })

    expect(getPeriodBoundaries({ periodKey: '2026-03', timeZone: 'Europe/Berlin', type: 'monthly' })).toEqual({
      end: new Date('2026-03-31T22:00:00.000Z'),
      start: new Date('2026-02-28T23:00:00.000Z'),
    })

    expect(getPeriodBoundaries({ periodKey: '2026', timeZone: 'Europe/Berlin', type: 'yearly' })).toEqual({
      end: new Date('2026-12-31T23:00:00.000Z'),
      start: new Date('2025-12-31T23:00:00.000Z'),
    })
  })

  it('detects Future Buckets from Planning Date and today in the User Timezone', () => {
    expect(getTodayLocalDate(new Date('2026-07-02T22:30:00.000Z'), 'Europe/Berlin')).toBe('2026-07-03')
    expect(
      isFutureBucket({
        bucket: { period: '2026-07-04', type: 'daily' },
        planningDate: '2026-07-04',
        today: '2026-07-03',
      }),
    ).toBe(true)
    expect(
      isFutureBucket({
        bucket: { period: '2026-07-03', type: 'daily' },
        planningDate: '2026-07-03',
        today: '2026-07-03',
      }),
    ).toBe(false)
  })

  it('orders enabled Bucket Horizons from broadest to most granular with inbox first', () => {
    expect(getEnabledBucketTypes(['daily', 'yearly', 'weekly'])).toEqual(['inbox', 'yearly', 'weekly', 'daily'])
  })
})
