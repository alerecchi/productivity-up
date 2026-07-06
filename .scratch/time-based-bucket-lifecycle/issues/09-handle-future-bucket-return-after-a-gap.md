# Handle Future Bucket Return After A Gap

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Handle the case where a user manually completes the day, plans in a future active Bucket, then returns after that future period has passed. The explicitly created future Bucket should become the expired source for migration, while skipped periods that were never planned should still not get backfilled.

## Acceptance criteria

- [x] If Planning Date is tomorrow and today has not caught up, reconciliation leaves Planning Date alone.
- [x] If the user returns after the stored Planning Date has passed, reconciliation updates Planning Date to today.
- [x] An explicitly created future active daily Bucket becomes the pending migration source if it contains incomplete Todos after its period has passed.
- [x] Todos created in that future Bucket appear in its Migration Step if they remain incomplete.
- [x] Skipped periods between the planned future Bucket and the return date do not get retroactive Buckets.
- [x] Destination Buckets match the new current Planning Date.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/03-complete-an-all-done-day-into-planning-tomorrow.md
- .scratch/time-based-bucket-lifecycle/issues/05-migrate-a-single-pending-bucket-end-to-end.md
- .scratch/time-based-bucket-lifecycle/issues/06-support-multi-step-migration-flows-across-boundaries.md
