/**
 * Accounts created by `pnpm seed`. The verify harness signs them in by key (`--user seed_user_with_data`).
 * Each password equals its email.
 */
export const seedUsers = {
  /** Owns the seeded board: 5 buckets, 25 todos, 4 categories, 5 tags. */
  seed_user_with_data: {
    email: 'seed_user_with_data@example.com',
    id: 'seed_user_with_data',
    name: 'Seed User With Data',
    password: 'seed_user_with_data@example.com',
  },
  /** Has no buckets, todos, categories, or tags. */
  seed_user_without_data: {
    email: 'seed_user_without_data@example.com',
    id: 'seed_user_without_data',
    name: 'Seed User Without Data',
    password: 'seed_user_without_data@example.com',
  },
} as const

export type SeedUserKey = keyof typeof seedUsers
