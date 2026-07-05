# Reconcile Quiet Expiration Without Migration

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Extend board lifecycle loading so automatic reconciliation commits completed-only expiration without user interruption. If stored Planning Date is behind today, jump it to today, create or reuse the current active Bucket set, archive expired completed-only Buckets, and go straight to the board when no migration is required.

## Acceptance criteria

- [x] Automatic lifecycle reconciliation runs before board data is returned.
- [x] Automatic lifecycle reconciliation uses the derived exclusive end of each time-based period in the User Timezone.
- [x] If Planning Date is behind today in the User Timezone, reconciliation updates it to today.
- [x] Completed-only expired Buckets archive quietly and set `archivedAt`.
- [x] Inbox is excluded from expiration and migration; it remains the stable active unplanned Bucket.
- [x] Skipped Periods do not get Buckets created retroactively.
- [x] Destination Buckets for the current Planning Date are created or reused.
- [x] When no pending migration exists, the user goes directly to the board without a Completion Recap.
- [x] Repeated or concurrent lifecycle reconciliation converges to the same active, pending, and archived Bucket state without duplicating Buckets.
- [x] Tests cover weekend gaps, current-period creation/reuse, completed-only archival, no-recap ready state, exclusive-end expiration, and repeated/concurrent reconciliation.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/02-initialize-first-visit-buckets-through-lifecycle-board-loading.md
