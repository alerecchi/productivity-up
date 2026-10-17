# Complete day and migration

Users close the current day with `Complete day`; a completion recap summarizes each ended bucket, and when incomplete todos remain, the migration flow asks, per todo, to carry it forward into the next period or move it back to the broader bucket.

Status: derived from source; not yet exercised.

## Sub-features

- `day-complete` closes the planning day and advances the board to tomorrow (`Planning tomorrow`).
- `day-recap` shows completed/incomplete counts per ended bucket.
- `migration-step` resolves one bucket's incomplete todos with `Move back` / `Carry forward`, per row or in bulk.
- `migration-route` `/migration` shows the flow, or `No migration needed` when nothing is pending.

## How to get to it (user POV)

- `/board` header → `Complete day` (disabled while a migration is pending or while planning ahead).
- `/migration` directly.

## Driving it with pnpm verify drive

Preconditions: baseline; signed in as `seed_user_with_data` (the daily bucket holds incomplete seed todos, so completing the day requires migration). Use `--user seed_user_without_data` for an empty board.

- **Complete day.** `getByRole('button', { name: 'Complete day' }).click()`. A recap dialog lists the daily bucket with `N completed, M incomplete` and an action (`Continue to migration`, or `Close and plan tomorrow` when nothing is left).
- **Migrate.** Continue; `Place unfinished work` lists each incomplete todo with `Move back` and `Carry forward` (`aria-pressed` shows the choice). Choose per row, or bulk via `Carry all forward?` / `Move all back?` and their confirm buttons, then confirm the step.
- **Board after.** The header reads `Planning tomorrow` and `Complete day is disabled while planning ahead.`; the daily column shows tomorrow's label and the carried todos; moved-back todos appear in the weekly column.
- **Proof.** `sql("select type, period, status from buckets where user_id = 'seed_user_with_data' order by type, period")` shows the old daily bucket archived and a new one for tomorrow; `sql("select planning_date from users where id = 'seed_user_with_data'")`.

## Gotchas

- This mutates the planning date; `reseed` before running any other journey that assumes `Planning today`.
- Lifecycle depends on the real clock and the user's stored timezone; a run near local midnight can see reconciliation instead of a manual completion.
- Seed users start with a null timezone and planning date, set on first board visit from the browser's timezone (Playwright's default is the host's).
