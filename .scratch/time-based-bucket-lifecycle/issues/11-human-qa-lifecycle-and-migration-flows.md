# Human QA Lifecycle And Migration Flows

Status: ready-for-human

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Run the end-to-end human QA journeys for the time-based Bucket lifecycle and Todo migration feature after the implementation slices are complete. This ticket is for manual verification of the real user experience across first setup, normal planning, manual completion, automatic reconciliation, migration, conflicts, and prototype cleanup.

## Acceptance criteria

- [ ] First visit: a new active user reaches the board, stores User Timezone and Planning Date, and sees inbox, yearly, monthly, weekly, and daily active Buckets with correct labels.
- [ ] Normal board: creating, editing, completing, and moving Todos works when no migration is pending.
- [ ] All-complete day: completing a daily Bucket with all Todos complete commits the day, shows the close-only recap, advances Planning Date, and allows planning tomorrow with Complete day disabled.
- [ ] Incomplete day: completing a daily Bucket with incomplete Todos shows the recap, then a single daily Migration Step with read-only Todo context and required per-Todo choices.
- [ ] Bulk actions: Move all back and Carry all forward each show a confirmation dialog, commit the current step when confirmed, and leave the step unchanged when cancelled.
- [ ] Weekend gap: returning after missed days jumps to the current Planning Date, creates no skipped Buckets, and migrates the last explicitly planned daily Bucket when needed.
- [ ] Boundary completion: completing a day before week, month, or year rollover creates the new active destination Buckets and gates the board behind any required multi-step migration.
- [ ] Multi-step flow: daily, weekly, monthly, and yearly pending sources appear most-granular first with lightweight progress, and moved Todos do not appear in later steps.
- [ ] Move destinations: Carry forward targets the active Bucket for the same horizon; Move back targets the nearest broader active Bucket for the new Planning Date.
- [ ] Future return: planning tomorrow, adding Todos, and returning after that future day has passed treats the explicitly planned future Bucket as the migration source.
- [ ] Pending gate: while migration is pending, board Todo mutations and Tag/Category management are blocked in another tab.
- [ ] Two-tab conflict: confirming the same Migration Step in two tabs does not apply moves twice, and the stale tab receives a refreshable conflict or already-resolved result.
- [ ] Quiet expiration: completed-only expired Buckets archive without showing a recap during automatic lifecycle.
- [ ] Final transition: after the last Migration Step, the board appears directly without a migration-complete summary screen.
- [ ] Prototype cleanup: prototype routes and obsolete prototype-only artifacts are gone after the real implementation ships.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/10-remove-prototype-routes-after-real-implementation.md
