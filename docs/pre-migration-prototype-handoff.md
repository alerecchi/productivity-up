# Todo Buckets Prototype Handoff

## Purpose

The prototype work covers the **pre-migration recap** shown when a daily bucket is manually completed or when lifecycle reconciliation needs user migration choices.

## Prototype Cleanup Requirement

After the real pre-migration implementation ships, remove the prototype artifacts instead of keeping them as parallel app code. This includes the `/prototype/pre-migration` route, prototype-only scenario toggles/mock state, and any prototype notes that are no longer useful as implementation documentation.

## Current Prototype State

The selected pre-migration direction is the **Timeline handoff** at `/prototype/pre-migration`.

Its documented verdict and behavior live in [prototype notes](/Users/alessandrorecchi/Documents/projects/todo-buckets/src/routes/prototype/NOTES.md). The implemented route is [pre-migration.tsx](/Users/alessandrorecchi/Documents/projects/todo-buckets/src/routes/prototype/pre-migration.tsx).

Selected characteristics:

- Modal with a static backdrop: clicking outside must not dismiss it.
- One forward action only. There is no "review later" or "back to board" exit.
- The flow is shown as a sequence: review today, migrate unfinished todos when needed, then open the next daily bucket.
- The **Review today** row contains compact status chips for completed and unfinished todo counts; it does not use large standalone metric cards.
- The Review today supporting copy is intentionally non-numeric: “Capture the end of this daily cycle before choosing what happens next.”
- The route has a local scenario toggle for unfinished todos vs all todos complete. It is in-memory, prototype-only state.
- The prototype in `/prototype/pre-migration` should be discarded after the real implementation is done.

The prior alternative pre-migration designs were discarded. There is no longer a variant query parameter or variant switcher on the pre-migration route.
