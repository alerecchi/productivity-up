# Use Planning Date for Bucket Lifecycle

Todo Buckets uses a stored Planning Date, interpreted in the user's stored timezone, to decide which time-based Buckets belong on the board. This lets a user manually complete the most granular Bucket early and plan tomorrow while keeping lifecycle reconciliation deterministic: destination Buckets are created for the Planning Date, pending source Buckets gate board access until migration is resolved, and skipped periods are not backfilled.

**Considered Options**

- Strict calendar mode: simpler because active Buckets always match the real current date, but it cannot support completing the day early without creating confusing mixed-period boards.
- Daily-only early mode: lets the daily Bucket advance early, but can show a future daily Bucket alongside old week or month Buckets.
- Planning Date mode: adds stored user state, but keeps all active Bucket Horizons aligned to one local planning date and makes manual completion coherent across week, month, and year boundaries.
