# Migrate A Single Pending Bucket End To End

Status: ready-for-agent

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Implement the first complete Migration Flow for one Pending Migration Bucket. Lifecycle reconciliation should mark an expired or completed source Bucket with incomplete Todos as pending migration, create or reuse active destination Buckets, gate the board, show the Completion Recap, let the user choose per incomplete Todo, confirm the Migration Step, append migrated Todos to their destinations, archive the source when resolved, and return to the board.

## Acceptance criteria

- [ ] Buckets with incomplete Todos become Pending Migration Buckets when they no longer match Planning Date.
- [ ] Inbox never becomes a Pending Migration Bucket and is never archived by migration.
- [ ] Active destination Buckets are created before migration, but the board stays gated while pending migration exists.
- [ ] Completion Recap summarizes only Buckets that require migration.
- [ ] Migration-required Completion Recap and Migration Flow have no cancel, dismiss, review-later, or back-to-board exits; the only in-app path is forward.
- [ ] The Migration Step shows incomplete Todos only; completed Todos remain in the source Bucket and appear only in aggregate counts.
- [ ] Todo title, Category, and Tags are shown as read-only context.
- [ ] Each incomplete Todo requires a `Move back` or `Carry forward` decision before manual confirmation is enabled.
- [ ] `Carry forward` targets the active Bucket for the same horizon and current Planning Date.
- [ ] `Move back` targets the nearest broader enabled active Bucket for the new Planning Date, falling back to inbox and never targeting Pending Migration Buckets.
- [ ] Row actions use short verbs while the step context panel explains concrete destinations.
- [ ] Confirming the step changes only Todo `bucketId` and `position`, appending migrated Todos to destination Buckets in source order.
- [ ] Migration confirmation submits the source Pending Migration Bucket and a full destination decision map for all current incomplete Todos in that source Bucket.
- [ ] Draft choices inside an unconfirmed Migration Step are not persisted; refreshing or leaving the step discards them.
- [ ] Confirmed Migration Steps are one-way; the flow does not offer back navigation to confirmed steps.
- [ ] The source Bucket archives with completed Todos left in place once no incomplete Todos remain.
- [ ] Pending migration state is derived from Buckets and Todos; no `migration_steps`, `bucket_migrations`, draft decision storage, migration history, or movement audit entries are added in v1.
- [ ] Core tests cover full decision requirements, destination lookup, append positions, completed Todo exclusion, source archival, and no persistence for draft choices.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/02-initialize-first-visit-buckets-through-lifecycle-board-loading.md
- .scratch/time-based-bucket-lifecycle/issues/04-reconcile-quiet-expiration-without-migration.md
