# Migrate A Single Pending Bucket End To End

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Implement the first complete Migration Flow for one Pending Migration Bucket. Lifecycle reconciliation should mark an expired or completed source Bucket with incomplete Todos as pending migration, create or reuse active destination Buckets, gate the board, show the Completion Recap, let the user choose per incomplete Todo, confirm the Migration Step, append migrated Todos to their destinations, archive the source when resolved, and return to the board.

## Acceptance criteria

- [x] Buckets with incomplete Todos become Pending Migration Buckets when they no longer match Planning Date.
- [x] Inbox never becomes a Pending Migration Bucket and is never archived by migration.
- [x] Active destination Buckets are created before migration, but the board stays gated while pending migration exists.
- [x] Completion Recap summarizes only Buckets that require migration.
- [x] Migration-required Completion Recap and Migration Flow have no cancel, dismiss, review-later, or back-to-board exits; the only in-app path is forward.
- [x] The Migration Step shows incomplete Todos only; completed Todos remain in the source Bucket and appear only in aggregate counts.
- [x] Todo title, Category, and Tags are shown as read-only context.
- [x] Each incomplete Todo requires a `Move back` or `Carry forward` decision before manual confirmation is enabled.
- [x] `Carry forward` targets the active Bucket for the same horizon and current Planning Date.
- [x] `Move back` targets the nearest broader enabled active Bucket for the new Planning Date, falling back to inbox and never targeting Pending Migration Buckets.
- [x] Row actions use short verbs while the step context panel explains concrete destinations.
- [x] Confirming the step changes only Todo `bucketId` and `position`, appending migrated Todos to destination Buckets in source order.
- [x] Migration confirmation submits the source Pending Migration Bucket and a full destination decision map for all current incomplete Todos in that source Bucket.
- [x] Draft choices inside an unconfirmed Migration Step are not persisted; refreshing or leaving the step discards them.
- [x] Confirmed Migration Steps are one-way; the flow does not offer back navigation to confirmed steps.
- [x] The source Bucket archives with completed Todos left in place once no incomplete Todos remain.
- [x] Pending migration state is derived from Buckets and Todos; no `migration_steps`, `bucket_migrations`, draft decision storage, migration history, or movement audit entries are added in v1.
- [x] Core tests cover full decision requirements, destination lookup, append positions, completed Todo exclusion, source archival, and no persistence for draft choices.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/02-initialize-first-visit-buckets-through-lifecycle-board-loading.md
- .scratch/time-based-bucket-lifecycle/issues/04-reconcile-quiet-expiration-without-migration.md
