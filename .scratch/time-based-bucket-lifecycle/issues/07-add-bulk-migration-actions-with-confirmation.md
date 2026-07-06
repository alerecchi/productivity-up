# Add Bulk Migration Actions With Confirmation

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Add bulk actions to the Migration Step so users can quickly resolve all incomplete Todos in the current source Bucket. Bulk actions should require a simple confirmation dialog before committing the step, while manual per-Todo choices continue to use the normal Confirm choices action without an extra dialog.

## Acceptance criteria

- [x] `Move all back` opens a confirmation dialog for the current Migration Step.
- [x] `Carry all forward` opens a confirmation dialog for the current Migration Step.
- [x] Confirming a bulk dialog commits the current Migration Step immediately with that destination for every incomplete Todo.
- [x] Cancelling a bulk dialog leaves the Migration Step unchanged.
- [x] Manual per-Todo confirmation does not show an additional confirmation dialog.
- [x] Bulk actions respect the same source Bucket, destination, append-order, and archival rules as manual confirmation.
- [x] Component tests cover both bulk dialogs, confirm/cancel behavior, and manual confirmation without an extra dialog.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/05-migrate-a-single-pending-bucket-end-to-end.md
