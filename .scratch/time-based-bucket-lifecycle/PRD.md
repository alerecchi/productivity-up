# Time-Based Bucket Lifecycle and Todo Migration

Status: ready-for-agent

## Problem Statement

Todo Buckets is built around moving Todos from broader Buckets toward narrower Buckets, but the current app treats Buckets as static active columns. New users do not get their initial Buckets automatically, Buckets do not expire, the app does not know the user's timezone, and incomplete Todos from ended periods have no structured migration path.

Users need the board to always represent their current planning context while preserving unfinished work. When a period ends, completed work should be retained for future retrospective views, and incomplete work should be reviewed so the user can either keep it at the same Bucket Horizon in the new period or move it back to the Broader Bucket.

## Solution

Add Lifecycle Reconciliation for the authenticated board. On first board visit, the app stores the User Timezone, stores the Planning Date, and creates the enabled active Buckets: inbox, yearly, monthly, weekly, and daily. On later visits, reconciliation aligns active Buckets with the user's Planning Date, creates or reuses current-period Buckets, archives Buckets that require no attention, and gates the board behind a Completion Recap and Migration Flow when incomplete Todos require user choices.

The board uses Planning Date mode. Planning Date is normally today in the User Timezone, but manual completion of the Most Granular Bucket can advance it to tomorrow. Future Buckets are visible planning-ahead state, and the user cannot manually complete them again until real time catches up.

Migration is resolved one Bucket at a time. Each Migration Step asks the user to choose, per incomplete Todo, whether to carry it forward into the new Bucket at the same Bucket Horizon or move it back to the Broader Bucket. Bulk actions let the user carry all forward or move all back. Migration progress is saved only when a step is confirmed; draft choices inside the current step are not persisted.

## User Stories

1. As a new signed-in user, I want the board to create my initial Buckets on first visit, so that I can start planning without setup.
2. As a signed-in user, I want the app to use my stored timezone for Bucket lifecycle rules, so that Bucket periods match my local calendar.
3. As a signed-in user, I want the board to show exactly one active Bucket for each enabled Bucket type, so that my planning view is predictable.
4. As a signed-in user, I want inbox to never expire, so that unplanned Todos always have a stable place.
5. As a signed-in user, I want yearly, monthly, weekly, and daily Buckets to represent the current period for my Planning Date, so that the board reflects where I am planning.
6. As a signed-in user, I want Bucket labels to be human-readable while Bucket identity remains stable, so that the UI can improve without breaking data.
7. As a signed-in user, I want period labels like June, Week 26 (22-28), and Friday 26, so that Buckets are compact and scannable.
8. As a signed-in user, I want cross-month week labels to disambiguate month names, so that Week 27 (29 Jun-5 Jul) is clear.
9. As a signed-in user, I want completed-only expired Buckets to close quietly during automatic lifecycle checks, so that I am not interrupted when no decision is needed.
10. As a signed-in user, I want incomplete Todos from ended Buckets to trigger a clear review flow, so that unfinished work is never silently moved or lost.
11. As a signed-in user, I want to start migration from a Completion Recap, so that I understand what ended and what needs attention.
12. As a signed-in user, I want the Completion Recap to summarize the Migration Flow that is about to happen, so that I know how much work needs review.
13. As a signed-in user, I want the Completion Recap to include only Buckets that require migration, so that it focuses on things I need to handle.
14. As a signed-in user, I want a Bucket with only incomplete Todos to still show the usual recap and migration flow, so that the interaction stays consistent.
15. As a signed-in user, I want one recap before a multi-step Migration Flow, so that I am not forced through repeated interstitial screens.
16. As a signed-in user, I want each Migration Step to focus on one Bucket, so that I can make decisions in a small context.
17. As a signed-in user, I want multi-step migrations to run from most granular to least granular, so that daily decisions happen before weekly, monthly, and yearly decisions.
18. As a signed-in user, I want to decide per Todo whether it moves back or carries forward, so that each unfinished Todo goes where it belongs.
19. As a signed-in user, I want bulk actions to move all Todos back or carry all Todos forward, so that I can finish a Migration Step quickly.
20. As a signed-in user, I want migration choices to stay simple even after a long gap, so that I can finish required review before doing deeper reprioritization on the board.
21. As a signed-in user, I want confirming a Migration Step to save that whole step, so that leaving later does not lose completed steps.
22. As a signed-in user, I want draft choices inside an unconfirmed Migration Step to be disposable, so that the implementation stays simple and the flow is easy to recover.
23. As a signed-in user, I want the board blocked while migrations are pending, so that I cannot plan in an inconsistent state.
24. As a signed-in user, I want the app to resume from the next unresolved Migration Step after I leave mid-flow, so that I can continue without repeating confirmed work.
25. As a signed-in user, I want a conflict message if another tab already resolved a Migration Step, so that duplicate submissions do not move Todos twice.
26. As a signed-in user, I want skipped calendar periods to avoid synthetic Buckets, so that history only contains periods I actually planned in.
27. As a signed-in user, I want returning after a weekend to jump the daily Bucket to the current Planning Date, so that missed days do not create noise.
28. As a signed-in user, I want carrying Todos forward after a gap to move them directly into the current-period Bucket, so that missed intermediate periods are skipped.
29. As a signed-in user, I want manual Complete day to show a satisfying close moment when all Todos are completed, so that finishing a day feels good.
30. As a signed-in user, I want manual Complete day with unfinished Todos to start the recap and migration flow, so that I can close the day intentionally.
31. As a signed-in user, I want the all-complete manual recap to show only counts and an encouraging client-side message, so that the close moment is lightweight.
32. As a signed-in user, I want manual Complete day to advance Planning Date to tomorrow, so that I can prepare the next day early.
33. As a signed-in user, I want Complete day disabled while Planning Date is ahead of today, so that I cannot complete future Buckets.
34. As a signed-in user, I want clear "Planning tomorrow" or "Planning ahead" feedback, so that disabled completion feels intentional.
35. As a signed-in user, I want Planning Date to become normal when real time catches up, so that the board leaves planning-ahead state automatically.
36. As a signed-in user, I want Planning Date to jump to today when I return after being away, so that the board is never behind after reconciliation.
37. As a developer, I want pending migration state derived from Buckets and Todos, so that v1 avoids a dedicated workflow table.
38. As a developer, I want Pending Migration Buckets to have a distinct status, so that old Buckets can be hidden from the board while still serving as migration sources.
39. As a developer, I want replacement Buckets created or reused before migration decisions are made, so that carry-forward destinations are concrete.
40. As a developer, I want Migration Step confirmation to be idempotent and recoverable, so that Neon HTTP's lack of transaction support does not corrupt state.
41. As a developer, I want one Bucket per user, type, and Period Key, so that lifecycle reconciliation is safe to retry and call concurrently.
42. As a developer, I want normal Todo mutations to require active Buckets, so that Pending Migration Buckets are read-only except through migration confirmation.
43. As a developer, I want migration to change only Todo `bucketId` and `position`, so that Todo content and metadata remain stable.
44. As a developer, I want migrated Todos appended to destination Buckets in source order, so that migration avoids extra placement decisions.
45. As a maintainer, I want lifecycle code to use an enabled-horizons list, so that future disabled Bucket Horizons do not require hard-coded rewrites.

## Implementation Decisions

**Expected Implementation Seams**

- Add a period/date utility layer that derives Period Keys, Bucket labels, period start/end boundaries, ISO week ranges, Planning Date comparisons, Future Bucket state, and enabled-horizon ordering from a User Timezone.
- Add a lifecycle reconciliation core seam that accepts user lifecycle state, current Buckets, current Todos or Todo counts, the current instant, and an optional first-setup timezone. It returns the durable changes needed to align Buckets with Planning Date and the board lifecycle state to show next.
- Add an authenticated board lifecycle query/server function that runs Lifecycle Reconciliation before returning board data. It accepts the browser timezone only when the user has no stored User Timezone yet.
- Add a Complete day server command. Clicking Complete day is a commit operation that advances Planning Date, runs Lifecycle Reconciliation, and returns either the close-only recap state, the migration-required state, or the ready board state.
- Add a migration step confirmation server command. It accepts the source Pending Migration Bucket and a full destination decision map for the current incomplete Todos in that source Bucket.
- Replace the board's direct active-Bucket loading path with the board lifecycle state. The board renders active Buckets only when the lifecycle state is `ready`.
- Add the board gate UI, Completion Recap UI, Migration Flow UI, bulk-action confirmation dialog, and planning-ahead board state.
- Keep low-level Bucket reads and Todo reads as internal building blocks as needed, but the board feature surface should flow through lifecycle-aware APIs.

**Schema and Data Model Changes**

- Store User Timezone on the user record.
- Store Planning Date on the user record as a date-only value.
- Add Bucket statuses `active`, `pending_migration`, and `archived`.
- Add Bucket `createdAt` and `archivedAt` timestamps.
- Add a unique constraint for one Bucket per user, type, and Period Key.
- Keep Bucket expiration boundaries derived from Bucket type, Period Key, and User Timezone; do not add start/end columns in v1.
- Do not add Todo `completedAt`, migration history, migration workflow tables, or draft migration-decision storage in v1.

- Use Planning Date mode rather than strict calendar mode. The board is organized around a stored local date that is normally today but may be tomorrow after manual completion.
- Store User Timezone on first authenticated board visit when creating the user's first Buckets. Do not silently update it later if the browser timezone changes.
- Store Planning Date as a date-only value, such as `2026-06-26`, interpreted with the User Timezone.
- Lifecycle Reconciliation runs from the authenticated board load/query path, not during signup.
- New users have no Buckets until first board visit. First board visit creates inbox plus all enabled time-based Buckets.
- V1 has no user setting for disabled Bucket Horizons. Still implement horizon ordering and Broader Bucket lookup through an enabled-horizons list.
- V1 uses ISO weeks starting Monday.
- `bucket.period` is a canonical Period Key, not a display label.
- Period Key conventions are `inbox`, `YYYY`, `YYYY-MM`, `YYYY-Www`, and `YYYY-MM-DD`.
- Bucket labels are derived from Period Keys and timezone. V1 labels are Inbox, 2026, June, Week 26 (22-28), and Friday 26, with month names added for cross-month weekly ranges.
- Bucket expiration boundaries are derived from Bucket type, Period Key, and User Timezone rather than stored on each Bucket.
- A time-based Bucket expires at the exclusive end of its period in the User Timezone.
- Add a distinct Pending Migration Bucket state. Bucket statuses are `active`, `pending_migration`, and `archived`.
- Add `createdAt` and `archivedAt` to Buckets. Set `createdAt` when the Bucket is created and set `archivedAt` when a Bucket becomes archived. Active and pending migration Buckets do not have `archivedAt` set.
- The normal board shows only active Buckets. Pending Migration Buckets are sources for the migration UI, not board columns.
- Board loading should use a higher-level lifecycle state rather than rendering `getBuckets` directly. The server should return at least `ready` and `migration_required` states so the client does not render active destination Buckets while pending source Buckets still gate access.
- Completed Todos remain in the source Bucket. Migration Steps show only incomplete Todos.
- When an expired or manually completed Bucket has no incomplete Todos, it can be archived without entering `pending_migration`.
- When an expired or manually completed Bucket has incomplete Todos, it becomes pending migration.
- Replacement active Buckets should be created or reused before the user resolves migration, but the board stays gated until all pending migration is resolved. The database may temporarily contain an old source Bucket with `pending_migration` status and a new destination Bucket with `active` status for the same horizon; active Buckets are ready as migration destinations, not usable board columns until pending source Buckets are resolved.
- Pending migration state is derived from Bucket and Todo state for v1. Do not add a `migration_steps` or `bucket_migrations` table in v1.
- Migration progress is saved only when a Migration Step is confirmed. Draft in-step choices are not persisted.
- Confirmed Migration Steps are one-way in v1 because they already changed durable Todo state. The flow should not offer back navigation to confirmed steps; copy may softly reassure users that they can adjust Todos on the board after migration is complete.
- Confirming a Migration Step requires decisions for all current incomplete Todos in the source Bucket.
- A Migration Step submission includes the source Bucket and a full decision map for the incomplete Todos shown to the user.
- Bulk actions in a Migration Step require a simple confirmation dialog before committing the step. Cancelling the dialog leaves the step unchanged. Manual per-Todo choices use the normal Confirm choices action without an extra confirmation dialog.
- The server rejects or conflicts a Migration Step confirmation if the source Bucket is no longer pending migration or any submitted Todo is no longer incomplete in that source Bucket.
- Confirmed Migration Steps must be idempotent and recoverable rather than transaction-dependent because Neon HTTP does not support database transactions.
- Migration confirmation should create/reuse destination Buckets by unique keys, move submitted Todos only from the expected source Bucket, and archive the source Bucket only when no incomplete Todos remain.
- Add a unique database constraint for one Bucket per user, type, and Period Key.
- Lifecycle Reconciliation should be safe to call repeatedly and concurrently from board load, retries, or multiple tabs.
- Normal Todo create/update/move operations require active Buckets. Pending Migration Buckets are read-only except through migration confirmation.
- While a user has any Pending Migration Buckets, normal board Todo mutations should be rejected until migration is resolved, even if the requested destination Bucket is active. This mirrors the UI gate and prevents another tab from planning in active destination Buckets before required migration is complete.
- While a user has any Pending Migration Buckets, board-adjacent metadata mutations such as Tag and Category management should also be rejected in v1.
- Migration changes only `bucketId` and `position`; it does not change Todo title, description, category, tags, completion state, or created time.
- The migration UI shows Todo title, Category, and Tags as read-only context. Users are not supposed to edit a Todo during migration except by choosing its destination Bucket.
- Migration actions use the verbs `Move back` and `Carry forward` in v1. Row actions should stay short; concrete destination labels should be shown in the step context panel rather than repeated on every Todo row.
- The Migration Flow should show lightweight progress such as current step number and compact upcoming Bucket names when multiple steps are pending.
- Migrated Todos append to the bottom of the destination Bucket, preserving source Bucket relative order.
- V1 does not record migration history or movement audit entries.
- Inbox never expires and never migrates.
- A Todo migrating from a time-based Bucket can either remain at the same Bucket Horizon in the new period or move back to the Broader Bucket.
- V1 migration supports only two choices per Todo: carry forward to the active Bucket for the same horizon, or move back to the nearest broader active Bucket for the new Planning Date. Moving farther back remains a normal board action after migration is complete.
- Broader Bucket lookup should use the nearest broader enabled horizon, falling back to inbox. It must target active Buckets, not Pending Migration Buckets.
- Multi-step Migration Flows run from most granular to least granular.
- Each Migration Step operates only on its Pending Migration Bucket source. Todos moved into active destination Buckets by earlier steps do not appear in later steps in the same flow.
- Skipped Periods do not get Buckets created retroactively. If the user returns after a gap, destination Buckets match the current Planning Date.
- If a user manually completed a day and explicitly created a future active Bucket, then returns after that future date has also passed, that explicitly planned Bucket is treated as the expired source for migration. Skipped periods still do not get Buckets backfilled.
- Todos created in a future active Bucket are treated like any other Todos in that Bucket. If the user returns after that future period has passed and those Todos remain incomplete, they appear in that Bucket's Migration Step.
- If stored Planning Date is before today during lifecycle reconciliation, update it to today and reconcile Buckets against today.
- If Planning Date is tomorrow and today has not caught up, do not advance it further automatically.
- Future Buckets should get visible planning-ahead UI state and cannot be manually completed.
- If no migrations are pending, Future Buckets are usable for normal planning. Users can create, edit, complete, and move Todos in the future active board; only manual completion of the Most Granular Bucket is blocked until real time catches up.
- Manual completion targets the Most Granular Bucket. In v1 that is the daily Bucket.
- V1 user-facing copy can stay daily-specific, such as `Complete day`. Generic copy for future disabled Bucket Horizons is out of scope until those settings exist.
- Clicking Complete day is the commitment point for manual completion. It advances Planning Date, runs Lifecycle Reconciliation, archives or marks source Buckets as needed, and then shows the Completion Recap for the resulting state.
- Manual completion with no incomplete Todos shows a close-only Completion Recap after the Bucket has been archived and Planning Date has advanced. If the user refreshes after this point, the day remains completed.
- Automatic lifecycle on board visit also commits reconciliation before showing any Completion Recap. Recaps explain durable lifecycle state; they are not draft previews.
- Automatic lifecycle with no pending migration should go directly to the board without showing a Completion Recap.
- The all-complete manual recap may show confetti and a random congratulatory sentence. This is client-only presentation, not persisted domain state. The all-complete manual recap is dismissible after the commit because it is success feedback, not a migration gate.
- Completion Recap summarizes the Migration Flow that is about to happen based on the already-reconciled lifecycle state. When no Migration Flow is needed, it can still support the manual all-complete close moment.
- The Completion Recap includes only Buckets that require migration for automatic or migration-needed flows. Completed-only Buckets handled during the same reconciliation are excluded.
- The Completion Recap should show aggregate completed and incomplete counts across the pending migration Buckets, plus compact per-Bucket breakdown rows when multiple Buckets require migration.
- When migration is required, the Completion Recap and Migration Flow should not offer cancel, dismiss, review-later, or back-to-board exits. The only in-app path is forward through migration; users can still close or refresh the browser.
- After the last Migration Step is confirmed, show the board directly. Do not add a migration-complete summary screen in v1.
- Prototype routes and prototype-only code are directional references, not exact implementation specs. Remove prototype routes, mock data, prototype-only state, and obsolete prototype notes after the real implementation ships.
- Do not add new libraries for this feature unless the user approves first.

## Testing Decisions

- Prefer the highest practical behavior seams. Lifecycle and migration rules should be tested in server core modules with injectable repositories and clocks/timezones.
- Add a lifecycle core seam that can be tested without rendering React. It should cover first-visit initialization, timezone storage, Planning Date normalization, current-period Bucket creation/reuse, skipped periods, future Planning Date behavior, completed-only archival, and pending migration detection.
- Add a migration confirmation core seam that can be tested without the UI. It should cover full decision requirements, destination lookup, append positions, completed Todo exclusion, conflict detection, idempotent retry behavior, and archiving the source Bucket when resolved.
- Add server function tests around authorization and status enforcement. Users must not mutate another user's Buckets or Todos, and normal Todo operations must reject pending migration and archived Buckets.
- Add component tests for the board lifecycle gate, Completion Recap, Migration Flow, bulk actions, per-Todo choices, disabled confirmation until all choices are made, and planning-ahead status.
- Use existing Todo server-function tests as prior art for repository-injected core behavior, ownership checks, and conflict responses.
- Use existing board/component tests as prior art for TanStack Query cache behavior and user-visible workflows.
- Test external behavior rather than implementation details. Avoid tests that assert private helper names or intermediate arrays unless they are the public seam for pure lifecycle logic.
- Include conflict tests for two tabs submitting the same Migration Step. The second submit should not reapply moves and should produce a refreshable conflict/already-resolved result.
- Include manual QA for first visit, normal daily completion, all-complete recap, incomplete daily migration, returning after a weekend, completing the day before week/month/year boundaries, planning tomorrow state, future-bucket return after a gap, two-tab migration conflict, and multi-step migrations.

## Out of Scope

- User settings for disabling Bucket Horizons.
- Configurable week starts or non-ISO weeks.
- Silent timezone updates after first setup.
- Backfilling Buckets for Skipped Periods.
- Persisting draft decisions inside a Migration Step.
- Search or filtering inside a Migration Step.
- Dedicated migration workflow tables.
- Migration history, audit logs, or analytics for moved Todos.
- Retrospective/history views over archived Buckets.
- Arbitrary future planning beyond tomorrow.
- Drag-and-drop placement inside the Migration Flow.
- Exact prototype layout, spacing, and wording as implementation requirements.
- Keeping prototype routes after the real implementation ships.
- New libraries unless separately approved.

## Further Notes

- The Planning Date model is recorded in ADR 0005 because it is a meaningful trade-off against strict calendar mode.
- The existing prototype handoffs are directional. The PRD owns the product decisions; prototype files should not become a second source of truth.
- The pre-migration prototype explored the Completion Recap entry screen. The migration prototype explored a dense worklist with a persistent side explanation, per-Todo decisions, bulk actions, and step-by-step progression.
- Neon HTTP does not support database transactions, so implementation should favor idempotent operations, unique keys, status checks, and recoverability.
- Keep this as one PRD for the product capability. Split implementation into issues rather than separate PRDs unless future scope changes force a larger planning reset.
