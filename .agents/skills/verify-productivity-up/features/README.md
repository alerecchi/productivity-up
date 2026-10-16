# Productivity Up verification map

This directory is the maintained source for verifying the user-facing behavior of Productivity Up. Read this index before driving the app, then use the matching feature file as the recipe. Launch, doctor, evidence, and cleanup live in `../SKILL.md`.

## Baseline preconditions

- An instance started by this run with `pnpm verify up [--port N]`, and `pnpm verify doctor` all `OK`.
- Seed data from `scripts/seed.ts`: `seed_user_with_data` owns 5 active buckets for the current periods (Inbox, year, month, ISO week, day), 25 todos titled `Seed Todo 01`..`Seed Todo 25` spread round-robin across them, categories `work`, `home admin`, `personal`, `health`, and tags `urgent`, `focus`, `blocked`, `waiting`, `quick-win`. `seed_user_without_data` has no board yet.
- `pnpm verify reseed` restores this baseline and re-saves the seed users' sessions.

## Driving conventions

- Every journey runs through `pnpm verify drive <journey.ts>`, starting on `/board` with `seed_user_with_data`'s saved session unless the feature says otherwise.
- `await hydrated()` after every `goto`/`reload`, before interacting.
- Locate by role and accessible name; bucket columns are `region`s named by their label, their todo lists are `list`s named `<label> Todos`, and each card exposes a `Drag <title>` button.
- Give created entities a unique title (`Verify ... ${Date.now()}`) so assertions and `sql()` lookups can't match seed data.

## Proof and skip reporting

- Proof = screenshots of the action and resulting state, a `reload()` re-assertion, and a `sql()` read of the rows the feature changed, all in the run's evidence directory.
- Report the feature file, sub-feature IDs, and evidence path with every claim.
- A path you could not reach is reported as unverified with the unmet precondition; never claim it through a different entry point.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with pnpm verify drive`, `Gotchas`. A `Status:` line under the title says whether the recipe has been exercised; promote it after a passing run.

## Features

- [Todo dialog](./todo-dialog.md): create, edit, complete, and delete todos. Proven journey, and the template for new ones: `journeys/create-todo.ts`.
- [Move todos](./move-todos.md): drag-and-drop reorder within a bucket and move across buckets.
- [Categories and tags](./categories-and-tags.md): assign, create, edit, and delete categories and tags from the todo dialog.
- [Complete day and migration](./complete-day-and-migration.md): close the day, completion recap, and the bucket migration flow.
- [Authentication](./authentication.md): sign in, sign out, route guards, and the email flows that cannot be completed locally.
