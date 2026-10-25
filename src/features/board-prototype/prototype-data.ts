// PROTOTYPE, throwaway. Five board variants on /board?variant=<key>, in-memory data only.
// See src/features/board-prototype/board-prototype.tsx for the switcher.

export const BUCKET_IDS = ['inbox', 'year', 'month', 'week', 'today'] as const
export type BucketId = (typeof BUCKET_IDS)[number]

/** Narrowest horizon first: the order most variants read in. */
export const BUCKETS_BY_URGENCY: Array<BucketId> = ['today', 'week', 'month', 'year', 'inbox']

export type CategoryId = 'work' | 'home' | 'health' | 'side' | 'people'

export type Category = {
  id: CategoryId
  name: string
  /** Category colours are exempt from theme tokens: each one is a Tailwind hue. */
  dot: string
  chip: string
  stripe: string
}

export const CATEGORIES: Record<CategoryId, Category> = {
  work: {
    id: 'work',
    name: 'Work',
    dot: 'bg-sky-500',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    stripe: 'bg-sky-500',
  },
  home: {
    id: 'home',
    name: 'Home',
    dot: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    stripe: 'bg-amber-500',
  },
  health: {
    id: 'health',
    name: 'Health',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    stripe: 'bg-emerald-500',
  },
  side: {
    id: 'side',
    name: 'Side project',
    dot: 'bg-violet-500',
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
    stripe: 'bg-violet-500',
  },
  people: {
    id: 'people',
    name: 'People',
    dot: 'bg-rose-500',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
    stripe: 'bg-rose-500',
  },
}

export type Todo = {
  id: string
  title: string
  categoryId?: CategoryId
  tags: Array<string>
  done: boolean
}

export type BoardState = {
  todos: Record<string, Todo>
  order: Record<BucketId, Array<string>>
}

type Seed = [title: string, categoryId?: CategoryId, tags?: Array<string>, done?: boolean]

const SEED: Record<BucketId, Array<Seed>> = {
  today: [
    ['Book the dentist', 'health', ['phone']],
    ['Review Luca’s pull request on the billing retry logic', 'work', ['review', 'quick']],
    ['Call grandma', 'people', ['phone']],
    ['Send the Q4 roadmap draft to Marta', 'work', ['deep-work'], true],
    ['Water the plants', 'home', [], true],
  ],
  week: [
    ['Prepare the slides for Thursday’s all-hands', 'work', ['deep-work']],
    ['Pick up the parcel at the post office', 'home', ['errand']],
    ['30-minute run, twice', 'health'],
    ['Reply to the wedding invitation', 'people', ['quick']],
    ['Fix the leaking kitchen tap', 'home', ['diy', 'weekend']],
  ],
  month: [
    ['Ship the onboarding checklist for the side project', 'side', ['launch', 'deep-work']],
    ['Renew the car insurance', 'home', ['admin', 'deadline']],
    ['Plan Sara’s birthday dinner', 'people'],
    ['Write the performance self-review', 'work', ['writing']],
  ],
  year: [
    ['Run a half marathon', 'health', ['goal']],
    ['Learn enough Japanese to order dinner in Kyoto without pointing at pictures', 'side', ['learning', 'travel']],
    ['Repaint the bedroom', 'home', ['diy']],
    ['Get the AWS certification', 'work', ['learning']],
  ],
  inbox: [
    ['Look into that budgeting app Tom mentioned'],
    ['Buy a new bike helmet', 'health', ['errand']],
    ['Idea: weekly newsletter for the side project', 'side', ['writing', 'idea', 'launch', 'someday']],
    ['Sort out old photos', 'home'],
    ['Check if the passport needs renewing', undefined, ['admin']],
    ['Find a pottery class'],
  ],
}

export function createSeedState(): BoardState {
  const todos: Record<string, Todo> = {}
  const order = {} as Record<BucketId, Array<string>>
  let n = 0

  for (const bucketId of BUCKET_IDS) {
    order[bucketId] = SEED[bucketId].map(([title, categoryId, tags = [], done = false]) => {
      const id = `t${++n}`
      todos[id] = { id, title, categoryId, tags, done }
      return id
    })
  }

  return { todos, order }
}

type BucketMeta = {
  id: BucketId
  name: string
  /** Short name for tabs and chips. */
  short: string
  /** 5 for Today down to 1 for Inbox: how loudly a variant should present the bucket. */
  weight: 1 | 2 | 3 | 4 | 5
}

export const BUCKET_META: Record<BucketId, BucketMeta> = {
  today: { id: 'today', name: 'Today', short: 'Today', weight: 5 },
  week: { id: 'week', name: 'This week', short: 'Week', weight: 4 },
  month: { id: 'month', name: 'This month', short: 'Month', weight: 3 },
  year: { id: 'year', name: 'This year', short: 'Year', weight: 2 },
  inbox: { id: 'inbox', name: 'Inbox', short: 'Inbox', weight: 1 },
}

/** The calendar period each bucket covers right now, e.g. "Sat 24 Oct" or "19–25 Oct". */
export function periodLabel(bucketId: BucketId, now = new Date()) {
  switch (bucketId) {
    case 'today':
      return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
    case 'week': {
      const monday = new Date(now)
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).formatRange(monday, sunday)
    }
    case 'month':
      return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)
    case 'year':
      return new Intl.DateTimeFormat(undefined, { year: 'numeric' }).format(now)
    case 'inbox':
      return 'No deadline'
  }
}

export function plural(count: number, one: string, other: string) {
  return new Intl.PluralRules().select(count) === 'one'
    ? one.replace('#', String(count))
    : other.replace('#', String(count))
}
