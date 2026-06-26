# Remove Prototype Routes After Real Implementation

Status: ready-for-agent

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Remove the throwaway pre-migration and migration prototype artifacts once the real Completion Recap and Migration Flow are implemented. The prototypes are directional references only and should not remain as parallel app code.

## Acceptance criteria

- [ ] The `/prototype/pre-migration` route and prototype-only state are removed.
- [ ] The `/prototype/migration` route and prototype-only mock data are removed.
- [ ] Prototype-only shared helpers are removed if no real code uses them.
- [ ] Generated route artifacts no longer include removed prototype routes.
- [ ] Obsolete prototype notes are removed or reduced to useful implementation documentation only.
- [ ] The real implementation remains covered by the PRD and issue tests rather than prototype routes.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/03-complete-an-all-done-day-into-planning-tomorrow.md
- .scratch/time-based-bucket-lifecycle/issues/05-migrate-a-single-pending-bucket-end-to-end.md
- .scratch/time-based-bucket-lifecycle/issues/06-support-multi-step-migration-flows-across-boundaries.md
- .scratch/time-based-bucket-lifecycle/issues/07-add-bulk-migration-actions-with-confirmation.md
- .scratch/time-based-bucket-lifecycle/issues/08-enforce-pending-migration-gates-and-conflict-recovery.md
- .scratch/time-based-bucket-lifecycle/issues/09-handle-future-bucket-return-after-a-gap.md
