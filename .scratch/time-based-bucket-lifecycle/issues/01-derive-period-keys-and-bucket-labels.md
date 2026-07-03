# Derive Period Keys And Bucket Labels

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Add the date and period utility seam that turns a User Timezone and local date into canonical Period Keys, Bucket labels, period boundaries, ISO week ranges, Future Bucket detection, and enabled-horizon ordering. Use that seam to render real Bucket labels on the current board without changing lifecycle behavior yet.

## Acceptance criteria

- [x] Period Keys are derived for inbox, yearly, monthly, weekly, and daily Buckets using the PRD conventions.
- [x] V1 Bucket labels render as Inbox, year number, month name, compact ISO week range, and weekday/day number.
- [x] Cross-month week labels include month names only when needed.
- [x] ISO weeks start on Monday and produce stable `YYYY-Www` keys.
- [x] Period boundaries include the exclusive period end in the User Timezone for each time-based Bucket type.
- [x] The utility layer has focused tests for Period Keys, labels, period boundaries, ISO week ranges, Future Bucket detection, and enabled-horizon ordering.
- [x] Boundary tests cover expiration at the exclusive end of the period in the User Timezone.

## Blocked by

None - can start immediately.
