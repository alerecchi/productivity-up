# Enforce Pending-Migration Gates And Conflict Recovery

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Harden the server behavior around Pending Migration Buckets. While any pending migration exists for a user, reject normal board Todo mutations and board-adjacent Tag/Category management. Make Migration Step confirmation safe for retries and two-tab conflicts without depending on database transactions.

## Acceptance criteria

- [x] Normal Todo create, update, complete, move, and delete operations are rejected while the user has any Pending Migration Buckets.
- [x] Tag and Category management operations reachable from the board are rejected while the user has any Pending Migration Buckets.
- [x] Pending Migration Buckets are read-only except through migration confirmation.
- [x] Normal Todo operations require active Buckets and reject archived Bucket sources or destinations.
- [x] Server functions reject cross-user Bucket and Todo mutation attempts in lifecycle and migration paths.
- [x] Migration confirmation rejects or conflicts if the source Bucket is no longer pending migration.
- [x] Migration confirmation rejects or conflicts if submitted Todos are no longer incomplete in the expected source Bucket.
- [x] Retrying an already-applied Migration Step does not move Todos twice.
- [x] A second browser tab confirming an already-resolved step receives a refreshable conflict or already-resolved result.
- [x] Tests cover authorization, archived Bucket rejection, pending migration status enforcement, and the no-transaction recovery path expected with Neon HTTP.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/05-migrate-a-single-pending-bucket-end-to-end.md
