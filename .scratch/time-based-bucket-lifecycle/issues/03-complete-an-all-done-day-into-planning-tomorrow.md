# Complete An All-Done Day Into Planning Tomorrow

Status: done

## Parent

.scratch/time-based-bucket-lifecycle/PRD.md

## What to build

Add the manual Complete day command for the all-complete daily Bucket path. Clicking Complete day commits the lifecycle transition, advances Planning Date to tomorrow, archives the daily source Bucket, creates or reuses tomorrow's active Buckets, shows a close-only Completion Recap, and then lets the user plan in the future board with completion disabled until real time catches up.

## Acceptance criteria

- [x] Complete day is available on the normal board when Planning Date is not ahead of today.
- [x] Completing an all-done daily Bucket archives that Bucket and sets `archivedAt`.
- [x] Complete day advances Planning Date to tomorrow and reconciles the active Bucket set for that Planning Date.
- [x] The close-only Completion Recap shows completed counts and no migration language.
- [x] The close-only Completion Recap is dismissible because it is success feedback, not a migration gate.
- [x] The all-complete recap can show client-only delight copy or confetti without persisting that presentation state.
- [x] Refreshing after the recap does not restore the old day.
- [x] Future Buckets are usable for normal planning, but manual completion is disabled with clear planning-ahead feedback.
- [x] Component tests cover the all-complete recap, dismiss behavior, planning-ahead status, and disabled Complete day feedback.

## Blocked by

- .scratch/time-based-bucket-lifecycle/issues/02-initialize-first-visit-buckets-through-lifecycle-board-loading.md
