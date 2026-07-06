# Support Multi-Step Migration Flows Across Boundaries

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Extend migration from a single source Bucket to a multi-step Migration Flow. When daily, weekly, monthly, or yearly Buckets require migration together, process them from most granular to least granular, show lightweight progress, and keep each step scoped to its own Pending Migration Bucket source.

## Acceptance criteria

- [x] Migration Flow orders pending source Buckets daily, weekly, monthly, yearly.
- [x] The flow shows lightweight progress such as current step number and compact upcoming Bucket names.
- [x] One Completion Recap appears before the whole flow, not before every step.
- [x] The recap shows aggregate completed and incomplete counts across pending migration Buckets plus compact per-Bucket breakdown rows.
- [x] Manual Complete day on week, month, or year boundaries reconciles higher-horizon Buckets against the new Planning Date.
- [x] Completed-only higher-horizon Buckets archive quietly and do not appear in the recap.
- [x] A Todo moved into an active destination Bucket by an earlier step does not appear in a later step.
- [x] Leaving or refreshing mid-flow resumes from the next unresolved Pending Migration Bucket without repeating confirmed steps.
- [x] After the last step, the user goes directly to the board without a migration-complete summary screen.
- [x] Component tests cover multi-step ordering, progress display, one recap before the flow, resume behavior, and no migration-complete summary screen.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/05-migrate-a-single-pending-bucket-end-to-end.md
