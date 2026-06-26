# Initialize First-Visit Buckets Through Lifecycle Board Loading

Status: ready-for-agent

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Introduce the lifecycle-aware board loading path for a new active user. On first authenticated board visit, store the User Timezone and Planning Date, create the inbox plus all enabled current time-based Buckets, and return a ready board state with those active Buckets.

## Acceptance criteria

- [ ] User lifecycle state stores User Timezone and date-only Planning Date.
- [ ] Buckets support `active`, `pending_migration`, and `archived` statuses, plus `createdAt` and `archivedAt`.
- [ ] The database enforces one Bucket per user, type, and Period Key.
- [ ] First board visit accepts browser timezone only when the user has no stored User Timezone.
- [ ] First board visit creates inbox, yearly, monthly, weekly, and daily active Buckets for the Planning Date.
- [ ] Signup/user creation does not create Buckets; a new user has no Buckets until first authenticated board lifecycle loading.
- [ ] Later board visits do not silently change the stored User Timezone when browser timezone differs.
- [ ] The board uses the lifecycle-aware ready state instead of rendering low-level active Bucket reads directly.
- [ ] Bucket expiration boundaries remain derived from Bucket type, Period Key, and User Timezone; no start/end columns are added in v1.
- [ ] V1 does not add Todo `completedAt`, migration history tables, migration workflow tables, or draft migration-decision storage.
- [ ] Tests cover first-visit initialization, timezone storage, date-only Planning Date storage, and the no-Buckets-before-board-visit rule.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/01-derive-period-keys-and-bucket-labels.md
