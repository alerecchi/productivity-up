# Release candidate verification: `29f5b93`

Evidence for [#105](https://github.com/alerecchi/productivity-up/issues/105). The human release decision belongs to [#106](https://github.com/alerecchi/productivity-up/issues/106).

| Item                    | Value                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Release candidate       | `main` at `29f5b93446ce10d07a60133746ccacd0fe3adf65` (#132)                                 |
| Verified on             | 2026-10-16                                                                                  |
| Staging version         | `bd23a843-af6e-48a6-bcb4-19e742b0357f`, tag `main-29f5b93446ce`                             |
| Production at that time | `2864b24c-72a9-4afc-8c73-b226c7dc1eb8`, `main` at `a4c8c56` (2026-09-17), 24 commits behind |

Production still runs a revision from before almost all of the backend overhaul, so this candidate is the first production release of that work.

The tests added by this verification change only tests, plus one schema refactor that does not change behavior (see [Input schemas](#input-schemas)). They are not part of the deployed candidate.

## Acceptance criteria

| Criterion                                               | Result  | Evidence                                                                      |
| ------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `pnpm validate` passes on the release revision          | Pass    | [Validation](#validation)                                                     |
| Ownership matrix for every ID-bearing operation         | Pass    | [Ownership matrix](#ownership-matrix)                                         |
| Atomic workflows: retry, stale state, race, transaction | Pass    | [Atomic workflows](#atomic-workflows)                                         |
| No tests repeated at layers that add no proof           | Pass    | [Redundant tests](#redundant-tests)                                           |
| Deployed smoke tests                                    | Partial | [Deployed evidence](#deployed-evidence). Server-function gap tracked in #134. |
| Completion records: required fields, no forbidden data  | Pass    | [Completion records](#completion-records)                                     |
| Strict input schemas with bound and one-past-bound      | Pass    | [Input schemas](#input-schemas)                                               |
| Residual risks and exceptions recorded                  | Pass    | [Residual risks](#residual-risks-and-exceptions)                              |
| No open launch-critical defect                          | Pass    | [Open defects](#open-defects)                                                 |

## Validation

`pnpm validate` passed in a clean worktree at `29f5b93` after `pnpm install --frozen-lockfile`. It ran 532 unit tests in 37 files, 59 public-contract tests in 2 files, a typecheck, and the production Worker build.

`pnpm validate` also passes with this change's test edits: 506 unit tests (34 redundant cases removed, 8 added) and 59 public-contract tests.

## Ownership matrix

Domain-command tests run against in-memory repositories that model each SQL guard. They prove product behavior. The [predicate review](#predicate-review) proves that the production Drizzle repositories apply the same User predicates. "Same 404" means that the missing and foreign cases return the same `RESOURCE_NOT_FOUND` response.

| Operation                    | Identifier                         | Owned | Missing                                            | Foreign   | Foreign-related | Tests                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------- | ----- | -------------------------------------------------- | --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `todos.create`               | `bucketId`                         | ✓     | ✓                                                  | ✓         | n/a             | `todos/operations.test.ts`: "rejects %s with the indistinguishable not-found error and creates nothing"                                                                                   |
| `todos.create`               | `categoryId`, `tagIds`             | ✓     | ✓                                                  | n/a       | ✓               | same table                                                                                                                                                                                |
| `todos.list`                 | `bucketId`                         | ✓     | ✓                                                  | ✓         | n/a             | "rejects the %s Bucket with the indistinguishable not-found error"                                                                                                                        |
| `todos.update`               | `id`                               | ✓     | ✓                                                  | ✓         | n/a             | "rejects %s with the indistinguishable not-found error and changes nothing"                                                                                                               |
| `todos.update`               | `bucketId`, `categoryId`, `tagIds` | ✓     | ✓ (added: missing Tag, missing destination Bucket) | n/a       | ✓               | same table                                                                                                                                                                                |
| `todos.move`                 | `id`, `targetBucketId`             | ✓     | ✓ (added: missing target Bucket)                   | ✓         | ✓               | "rejects %s with the indistinguishable not-found error" (move)                                                                                                                            |
| `todos.move`                 | `afterTodoId`, `beforeTodoId`      | ✓     | ✓ (same 409)                                       | n/a       | ✓ (same 409)    | stale-order table: "a missing anchor", "another User's anchor"                                                                                                                            |
| `todos.delete`               | `id`                               | ✓     | ✓                                                  | ✓         | n/a             | "rejects deleting %s and keeps it"                                                                                                                                                        |
| `categories.update`/`delete` | `id`                               | ✓     | ✓                                                  | ✓         | n/a             | `categories/operations.test.ts`: "rejects updating/deleting a %s Category as not found"; public seam: `realtime-command.integration.ts` "%s rejects foreign resources without publishing" |
| `tags.update`/`delete`       | `id`                               | ✓     | ✓                                                  | ✓         | n/a             | `tags/operations.test.ts`: "rejects updating/deleting a %s Tag as not found"; same public seam                                                                                            |
| `board.getMigrationStep`     | `sourceBucketId`                   | ✓     | ✓                                                  | ✓ (added) | n/a             | `board/operations.test.ts`: "returns not found for a missing or foreign migration source"                                                                                                 |
| `board.confirmMigrationStep` | `sourceBucketId`                   | ✓     | ✓                                                  | ✓         | n/a             | "returns not found for a missing or foreign source Bucket"                                                                                                                                |
| `board.confirmMigrationStep` | decision Todo IDs                  | ✓     | ✓ (409)                                            | n/a       | ✓ (added, 409)  | "rejects decisions that miss a current incomplete Todo without writing"; "rejects a decision for another User’s Todo without moving either Todo"                                          |

`board.get`, `board.reconcileLifecycle`, `board.completeDay`, `categories.list`, `tags.list`, and `categories.create`/`tags.create` take no resource identifiers. Their User comes only from the verified session, and each list test asserts that another User's rows are excluded.

Migration decisions that name a missing or foreign Todo return `409` rather than `404`. The command treats the decision set as a stale precondition on the source Bucket's current incomplete Todos, and missing and foreign Todos produce the same response.

### Predicate review

Reviewed `src/server/db/todo-repository.ts`, `board-repository.ts`, `category-repository.ts`, and `tag-repository.ts`:

- Every authoritative read, update, and delete of a User-owned table includes `userId` in its final predicate.
- Related Buckets, Categories, and Tags are re-checked with `userId` inside the writing transaction. Categories and Tags are share-locked, and Buckets are locked `FOR UPDATE`.
- `todo_tags` has no `userId` column. Its delete and insert run in the same transaction, after the owning Todo is locked under a `userId` guard and the Tags are share-locked as owned.
- `users` rows are addressed by the session User ID only.

## Atomic workflows

The standard names four invariant-critical workflows. Each one writes inside a single `db.transaction` that first locks the rows it depends on.

| Workflow                                   | Transaction                                                                                               | Retry                                                                                                                          | Stale state                                                                                        | Race                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Lifecycle Reconciliation and Complete Day  | `commitInitialBoardState`, `commitLifecycleTransition`: guarded `users` update, then locked stale Buckets | "revisiting a newly initialized board preserves its Buckets and Planning Date"                                                 | "returns 409 without changes while a Bucket is pending migration"; Planning Date guard             | "concurrent and repeated reconciliation converge…"; "completes a day once when two requests race…"    |
| Migration Step confirmation                | `commitMigrationStep`: locks `users`, then moves Todos and archives the source                            | A replay after commit returns `409` and refreshes ("another tab already resolved…")                                            | "rejects submitted Todos that are no longer incomplete…"; "destination Bucket is no longer active" | "allows only one concurrent Migration Step confirmation to commit"                                    |
| Todo create or update with Tag replacement | `createTodo`, `updateTodo`: lock `users`, Buckets, Todo, and share-lock Category and Tags                 | Update: "converges a retried edit with Tag replacement…" (added). Create: see [residual risks](#residual-risks-and-exceptions) | "creates nothing when %s after validation" (added); "rejects a Bucket change as stale…"            | "returns current Tags after a concurrent replacement…"; "keeps ordinary field edits last-write-wins…" |
| Todo movement and position rebalance       | `moveTodo`: locks Buckets, then Todos in ID order, then compares expected positions                       | "converges a retried move on the already committed placement"                                                                  | "rejects a sparse move when a Todo is appended after its target order was read"                    | "orders tied positions from concurrent creates…"; "commits no partial rebalance…"                     |

Rollback and failure injection at database write boundaries are out of scope for #105. Transaction review covers them, because the real-PostgreSQL test path was removed.

## Redundant tests

- `src/server/core/private-operation.test.ts` ran its signed-out and unverified middleware checks once for each of the 18 operation names. The middleware ignores the name on that path. `src/server/core/public-request.integration.ts` already proves both statuses for every exported server function over HTTP. Both tables are now single cases that keep the assertions only the middleware test makes: the operation is not called and the connection is closed.
- `realtime-command.integration.ts` repeats foreign Category and Tag cases from the domain tests, but it adds that nothing is published, so it stays.
- Aggregate coverage is not a gate: `pnpm validate` does not run coverage.

## Input schemas

`src/server/functions/schemas.test.ts` checks every private operation's schema against the operation inventory. Each one accepts a valid input and rejects an unknown field.

| Bound                                  | At bound | One past | Test                                                                                            |
| -------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| Positive PostgreSQL ID (1 to 2³¹−1)    | ✓        | ✓        | "accepts positive PostgreSQL identifiers at both bounds…"                                       |
| Todo title (256), description (10,000) | ✓        | ✓        | "enforces Todo text and Tag collection bounds…"                                                 |
| Todo Tags (50, unique)                 | ✓        | ✓        | same                                                                                            |
| Category name (64), Tag name (32)      | ✓        | ✓        | "enforces Category and Tag name bounds…"                                                        |
| Migration decisions (500)              | ✓        | ✓        | "enforces the Migration Step work limit…"                                                       |
| Planning Date, IANA Timezone           | valid    | invalid  | "requires Complete Day to name a valid Planning Date"; "requires an actual IANA User Timezone…" |

Update inputs share the same field schemas as create inputs. `UpdateCategoryInput` used to repeat the Category name rule inline. It now uses the shared `categoryNameSchema`, like Tags, so the bound test covers both.

The Timezone length cap (255) has no accepted at-bound case, because no IANA zone is 255 characters long. The cap only rejects oversized input before the IANA check, and a 256-character value is rejected.

## Deployed evidence

`pnpm deploy:staging` built `29f5b93` from a clean workspace, applied the pending Drizzle migration to staging, and deployed. Its smoke test passed:

- Better Auth sign-in through Neon over Hyperdrive.
- An authenticated `/board` load through server-side rendering.
- A Durable Object WebSocket heartbeat, with signed-out, foreign-origin, and forged-User upgrades refused.

`/board` sets `ssr: false`, so the smoke test does not call a private server function. #134 tracks adding that check. For this release, a manual probe called server functions over HTTP on staging with the smoke-test account:

| Call                           | Result                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `board.get`, signed out        | `401` `AUTHENTICATION_REQUIRED` with a matching `X-Request-ID` |
| `board.get`, signed in         | `200`                                                          |
| `categories.list`, `tags.list` | `200`                                                          |
| Non-serialized POST body       | `500` with a library message, no request ID: #133              |

`pnpm test:staging-email` signed up a throwaway `resend.dev` User. The Worker logged `auth_email.send` with outcome `sent` and a provider message ID. The Resend API confirmed that the verification email went to the requested recipient, the script's log check found no recipient, link, password, or credential in the tailed Worker logs, and the script deleted the User. The first run could not confirm delivery because the lookup used the Worker's sending-only key. The script now reads a separate local full-access key, `STAGING_RESEND_LOOKUP_API_KEY`, so the Worker keeps sending-only access.

Not covered for this release: manual end-to-end staging workflows, including two-client convergence. They moved to #111. The realtime convergence check in `docs/deployment.md` remains the manual procedure until then.

## Completion records

Staging logs were captured with `wrangler tail` during the probes. Representative `board.get` success record:

```json
{
  "coldStart": true,
  "conflict": false,
  "connectionCloseFailed": false,
  "databaseDurationMs": 38,
  "databaseRoundTrips": 1,
  "deploymentVersion": "bd23a843-af6e-48a6-bcb4-19e742b0357f",
  "operation": "board.get",
  "outcome": "success",
  "rateLimited": false,
  "region": "MUC",
  "requestId": "6f30d898-030a-4715-9bfa-f8269d9030bf",
  "responseBytes": 36,
  "status": 200,
  "thirdPartyDurationMs": 0,
  "totalDurationMs": 51
}
```

The `401` record has the same fields with `outcome: "unauthorized"`. The `categories.list` and `tags.list` records match. The `auth_email.send` record contains only `deploymentVersion`, `kind`, `operation`, `requestId`, `outcome`, `providerMessageId`, and `thirdPartyDurationMs`.

No application log message contained `@`, a URL, a token, a cookie, a password, a bearer credential, or SQL. Cloudflare reported server-function request URLs with the path ID shown as `REDACTED`, and `redact_query_string` is enabled for both environments.

## Residual risks and exceptions

| Risk or exception                                                                                                 | Accepted because                                                                                                        | Removal condition                             |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Malformed server-function payloads return a `500` with a library message, no request ID, and no completion record | No data exposure, and the real client never sends this payload                                                          | #133 merged                                   |
| The smoke test does not call a private server function                                                            | Manual probe passed for this release                                                                                    | #134 merged                                   |
| No automated end-to-end coverage of user flows or two-client convergence                                          | Unit and public-contract coverage; manual convergence procedure is documented                                           | #111 merged                                   |
| Atomicity, locking, and SQL predicates are proven by review, not by tests against PostgreSQL                      | Real-PostgreSQL tests were removed on purpose                                                                           | Permanent, by decision                        |
| A retried Todo create after a lost response can create a duplicate Todo                                           | The standard forbids an idempotency-key framework without a demonstrated need, and duplicates are visible and deletable | A named workflow shows the need               |
| A Migration Step replayed after an uncertain outcome returns `409` and refetches instead of confirming success    | Safe, and the canonical refetch repairs the client                                                                      | #123 resolved                                 |
| Migration Step confirmation issues one `UPDATE` per moved Todo while the User row is locked                       | No evidence of slowness; numeric budgets wait for evidence                                                              | #80                                           |
| Production Users who never verified their email lose product access until they verify                             | Production has no Users yet                                                                                             | Accepted by the maintainer                    |
| Rolling production back to `a4c8c56` would need the deleted authentication-email Queues                           | Forward fixes are the documented recovery path                                                                          | Permanent, documented in `docs/deployment.md` |

The only migration between production and this candidate is `drizzle/0002_auth_rate_limits.sql`. It creates one table and one index and does not touch existing data.

The pre-production exception has ended, as `docs/deployment.md` states. Production changes, including this release, must preserve compatibility through ordinary migrations and rollout planning. #106 was updated to match.

## Open defects

No open issue describes a launch-critical isolation, atomicity, cache, realtime, email, or sensitive-logging defect:

- #133 is a contract and logging-hygiene defect with no data exposure.
- #134 and #111 are coverage gaps.
- #123 investigates an improvement to Migration Step retries. The current behavior is safe.
- #80 is a performance investigation that waits for evidence.
