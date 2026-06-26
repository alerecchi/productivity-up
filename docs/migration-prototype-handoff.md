# Todo Buckets Migration Prototype Handoff

## Relevant Artifacts

- Migration prototype route: `$REPO_ROOT/src/routes/prototype/migration.tsx`
- Prototype notes: `$REPO_ROOT/src/routes/prototype/NOTES.md`

Do not duplicate the prototype code into the next prompt. Read the route file directly if implementation details matter.

## Current Prototype Shape

The migration prototype lives at `/prototype/migration`.

It is a throwaway, in-memory UI prototype. It does not persist decisions and does not call server functions. It exists to validate the flow and information architecture.

## Prototype Cleanup Requirement

After the real migration implementation ships, remove the prototype artifacts instead of keeping them as parallel app code. This includes the `/prototype/migration` route, prototype-only mock data/state, and any prototype notes that are no longer useful as implementation documentation.

The route now contains only the selected direction, previously called variant B: a dense todo worklist on the left and a persistent side explanation on the right. The earlier alternate variants were discarded.

The prototype supports two scenarios through top controls:

- `Single step`: only the daily migration step.
- `Multi-step flow`: daily, then weekly, then monthly.

When a migration step resolves, the same page advances to the next expired bucket. The ordering is most granular to least granular: daily -> weekly -> monthly.

## Interaction Model

Each incomplete todo row shows:

- todo title
- category badge
- tag badge
- category-colored left border
- two normal buttons:
  - `Move back`
  - `Carry forward`

The row buttons intentionally do not include destination dates or bucket names. Those are explained in the side box.

The side box title is:

`X todos need a new home`

It then shows:

- `Move back`: the broader/parent bucket for this step
- `Carry forward`: the new bucket at the same horizon

There is no side-box subtitle for now.

The bottom sticky bar shows:

- a progress bar
- decision count, e.g. `1/4`
- `Move all back`
- `Carry all forward`
- `Confirm choices`, disabled until every todo has an individual decision

Bulk actions resolve the current migration step immediately. Manual confirmation also resolves the step once all decisions are taken.

The todo list is constrained and scrollable so it can move behind neither the side context nor the fixed bottom bar.

## Mock Flow Data

The current mock steps are:

- Daily: `Friday, 26 June` -> move back to `Week 26 (22-28 Jun)` or carry forward to `Monday, 29 June`
- Weekly: `Week 26 (22-28 Jun)` -> move back to `June 2026` or carry forward to `Week 27 (29 Jun-5 Jul)`
- Monthly: `June 2026` -> move back to `2026` or carry forward to `July 2026`

These are mock labels for UX testing, not final canonical period keys.

## What To Grill Next

Recommended grilling focus:

1. Does the side box carry enough explanatory weight now that row buttons omit destination names?
2. Are `Move back` and `Carry forward` the right verbs across daily, weekly, monthly, and yearly migration?
3. Does bulk action resolving the step immediately feel too abrupt, or should it ask for confirmation in some cases?
4. In multi-step migration, does changing content in place provide enough continuity, or does the user need a visible upcoming-step queue?
5. Is the scrollable todo-list behavior obvious and comfortable when the step has many todos?
6. Should the completion screen summarize what moved where before returning to the board?
