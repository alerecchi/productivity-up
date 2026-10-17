---
name: verify-productivity-up
description: Launch and drive the Productivity Up web app (board, todos, buckets, migration, auth) in an isolated local instance with Playwright, and capture evidence. Use to prove a change works in the real app, reproduce a UI bug, or verify a feature end to end.
---

# Verify Productivity Up

The app is a TanStack Start web UI running in `vite dev` on the Cloudflare Workers runtime. The harness `pnpm verify` (source: `scripts/verify/cli.ts`) gives each instance its **own throwaway Postgres cluster**: it creates the cluster under `.verify/instances/<port>/`, migrates it, seeds it, and points the dev server at it through process-env overrides. After signing the seed users in, `up` checks that their sessions landed in that cluster, so a dev server pointed at another database fails loudly. The Neon database in `.env.local` and the user's own `pnpm dev` are never touched. Authentication emails go to an invalid Resend key, so none reach a real inbox.

Prerequisites (one time per machine): `brew install postgresql@17` (or set `PG_BIN` to a Postgres 17 `bin/`), `pnpm install`, `pnpm exec playwright install chromium`.

## Launch

```sh
pnpm verify up                 # default port 3107; Postgres on port + 50000 (53107)
pnpm verify up --port 3108     # a second, fully independent instance
```

Ready means usable: `up` waits until `/login` returns 200, signs each seed user in once through the real `/login` form, saves their browser sessions in `.verify/instances/<port>/sessions/`, then prints `[verify] READY http://localhost:<port> ...`. It takes about 30–60 s.

`up` refuses to start when:

- the instance already exists, including one left by a failed or interrupted `up`: run `down`, then `up` again;
- the app port or the Postgres port is taken by another process: pick another `--port`;
- a `.dev.vars*` file exists in the repo root: wrangler would load it instead of the overrides, so ask the user to move it.

## Choose a user

`drive` and `browser open` take `--user`. Pick it from what the feature needs:

| `--user`                        | Starts as                                                            | Use when                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `seed_user_with_data` (default) | Signed in, on a board with 5 buckets, 25 todos, 4 categories, 5 tags | The feature works on existing todos, buckets, categories, or tags: moving, editing, completing the day, assigning. |
| `seed_user_without_data`        | Signed in, on an empty board                                         | The feature's behavior from nothing matters: first visit, empty states, creating the first category or tag.        |
| `none`                          | Signed out                                                           | You are verifying authentication itself: sign-in, route guards.                                                    |

The two seed users' data is not interchangeable: a journey that relies on seed data, like `create-todo.ts` picking the `work` category, fails as `seed_user_without_data`. Credentials, needed only with `--user none`, are in `scripts/seed-users.ts`.

## Doctor

```sh
pnpm verify doctor [--port 3107]
```

This read-only check confirms that the app process is alive, the port's listener belongs to our process group, Postgres is ready, the seed users are present, and each saved session is still valid. It never signs in. Run it first whenever anything looks off. Any `FAIL` line means `down` and `up`; don't drive a half-working instance.

## Explore

Before writing a journey, look at the feature with the step-by-step browser. One Chromium stays open on the instance between commands, so each command acts on the page the previous one left:

```sh
pnpm verify browser open [--user <user>] [--headed]          # opens /board with the saved session (/login for none)
pnpm verify browser snapshot                                # prints the page's accessibility tree: roles and names to target
pnpm verify browser click --role button --name "Add todo" [--nth 0] [--exact]
pnpm verify browser fill --label Title --value "Buy milk"
pnpm verify browser press --key Escape
pnpm verify browser goto /board
pnpm verify browser screenshot <name>
pnpm verify browser close
```

`click` and `fill` take one target: `--role` (with optional `--name`), `--label`, `--text`, or `--selector`. Add `--nth <i>` when several elements match, and `--exact` for exact name matching. Each command waits for hydration and network to settle, then prints the URL plus any console errors and HTTP responses ≥ 400. Run `snapshot` after an action to see what changed; it's cheaper than a screenshot and gives you the exact names for locators. Everything is logged to `.verify/evidence/<timestamp>-browser/` (`transcript.log`, snapshots, screenshots).

Exploring is for understanding the feature and finding selectors. Proof comes from a journey: it can be re-run, asserts, reloads, and records a trace and video.

## Drive

A **journey** is a TypeScript module whose default export receives a signed-in Playwright page:

```sh
pnpm verify drive <journey.ts> [--port 3107] [--user <user>] [--headed]
```

The context type is `JourneyContext` in `scripts/verify/journey.ts`: `page`, `hydrated()`, `shot(name)`, `sql(query, params)`, `step(description)`, `baseUrl`, `evidenceDir`. Before the journey runs, `drive` loads the saved session for `--user`, opens `/board`, and waits for the board region. It never signs in. With `--user none` the browser starts signed out on a blank page.

### Start from the template journey

**`journeys/create-todo.ts` is the template: copy it to start every new journey.** It is the reference for the shape a journey takes, and it shows every proof step in order: screenshot before, act through the UI, screenshot during, assert on screen, `reload()` + `hydrated()` and assert again, then `sql()` to check the row. Change the actions and assertions, keep the shape.

Save the copy in `.verify/journeys/` (gitignored) for a one-off check. Save it in `journeys/` next to this file only when it is worth re-running later. Per-feature selectors and end states are in the **feature map**, `features/README.md`. Read the feature's file before writing the journey.

Rules that keep journeys reliable:

- **Call `await hydrated()` after every `page.goto` / `page.reload` before clicking or typing.** SSR markup is visible before React hydrates, and a click that lands first submits the form natively (`/login?`) or does nothing.
- Use role and name locators (`getByRole('region', { name: 'Inbox' })`, `getByRole('list', { name: 'Inbox Todos' })`, `getByRole('button', { name: 'Drag <title>' })`), data attributes (`data-bucket-id`, `data-completed`, `data-planning-bucket`), and `getByLabel` inside forms. Bucket labels come from the period: `Inbox`, the year (`2026`), the month (`October`), the week (`Week 42 (12-18)`), and the day (`Thursday 15`). Derive them at runtime or match by role and position instead of hard-coding a date.
- Popovers such as the category and tag pickers are portaled outside their dialog, so locate their contents on `page`, not on the dialog.
- Finish with `expect(...)` assertions. A thrown assertion marks the run `FAIL`, and the exit code is 1.

`pnpm verify sql "<select ...>"` runs one statement in a read-only session for ad-hoc inspection; several statements in one call are rejected. `pnpm verify reseed` truncates every table and re-seeds, which is safe because the database is the instance's own. Use it between journeys that need pristine data. The reset deletes every session, so `reseed` signs the seed users in again and re-saves their sessions.

## Evidence

`browser` sessions write `.verify/evidence/<timestamp>-browser/` as described in Explore. Each `drive` writes `.verify/evidence/<timestamp>-<journey>/`:

- `NN-<name>.png` screenshots from `shot()`, plus `failure.png` on failure;
- `transcript.log`: steps, screenshots, and every `sql()` query with its rows, plus browser console errors and warnings, page errors, and HTTP responses ≥ 400;
- `server.log`: the dev-server output produced during this run only;
- `trace.zip`: the Playwright trace (view with `pnpm exec playwright show-trace <path>`), and a `.webm` video;
- `result.json` with `outcome` `pass` or `fail` and the failure stack.

Proof standards:

- Drive the real user path: dialogs, buttons, drag handles. Server functions and DB writes are not the way in; `sql()` is for **checking** results: one statement per call, in a read-only session.
- Capture the action and the resulting state: a screenshot before, one during (dialog filled), and one after.
- Prove persistence and side effects: `page.reload()` and re-assert, then `sql()` the rows (bucket, position, category, `completed`, archived buckets) that the feature should have changed.
- Report the evidence directory path and the `outcome` alongside your conclusion.

## Cleanup

```sh
pnpm verify down [--port 3107]
```

This closes the explore browser if one is open, kills only the process group that `up` started (vite and its workerd children), stops that instance's Postgres, and deletes `.verify/instances/<port>/`. It never kills by process name. `.verify/evidence/` survives `down`; delete old evidence by hand when no longer needed. Run `down` after every session, including failed ones.

## Gotchas

- Right after a dependency change, the first page load can trigger Vite's dependency re-optimization, which reloads the page mid-journey. If a run fails with an unexpected reload right after `pnpm install`, run it again.
- Sign-in is rate limited to 10 per 10 minutes for `127.0.0.1`. Only `up`, `reseed` and `--user none` journeys that sign in spend it. If `transcript.log` shows `http 429 POST .../sign-in/email`, run `pnpm verify reseed`, which also clears the counter.
- Email flows (sign-up verification, password reset) can't be completed: no email is delivered. The `verifications` table holds reset tokens, but reading a token there skips the user path, so report those flows as not verifiable rather than shortcutting them.
- The board scrolls horizontally inside `[data-todo-board]`. Full-page screenshots show only the columns in the 1440 px viewport (the Daily column is cut off). Scroll the board (`locator.scrollIntoViewIfNeeded()`) before shooting columns on the right.
