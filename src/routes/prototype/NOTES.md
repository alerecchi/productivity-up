# Pre-Migration Prototype Notes

Question: Which pre-migration step best explains the end of the daily bucket before either closing it or starting todo migration?

Route: `/prototype/pre-migration`

Selected direction: **Timeline handoff**. It frames the daily recap as the first step in a clear transition toward the next planning date.

The completed and unfinished totals are compact status chips within the **Review today** row. That row's supporting copy describes the purpose of the checkpoint, rather than duplicating those counts. The dialog has a static backdrop and one forward action.

Verdict: selected for further UX iteration.

## Migration Flow Prototype

Question: Which page-level layout makes per-todo migration choices, bulk actions, and multi-step progression easiest to understand?

Route: `/prototype/migration`

Selected direction: **Two destinations**. It keeps the todo list dense and full-width while the side box explains the two allowed destinations for the current step.

The row actions use normal button styling, without destination dates in the labels. The side box carries the current destination labels, the bottom bar tracks decision progress, and bulk actions resolve the current migration step immediately. The multi-step scenario advances daily -> weekly -> monthly.
