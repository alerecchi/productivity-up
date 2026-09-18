# Backend standard

This document is the repository standard for new and changed backend code.

The standard is a ratchet. New and changed backend code must follow it. Existing violations remain separately trackable and do not need to be repaired as unrelated work. Every temporary exception must name the issue that owns it and the condition that removes it.

Use `MUST` for a required rule, `MUST NOT` for a prohibited choice, and `SHOULD` for a recommendation that needs a documented reason to ignore.

## Rule registry

This registry makes the mandatory rules reviewable. The detailed sections below define the exact behavior.

| Rule                             | Protects                                                               | Scope                                   | Cheapest enforcement point                                      | Verification                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Strict request boundary          | Prevents malformed, oversized, or ambiguous requests                   | Every private server function           | Strict Zod boundary schema and explicit method                  | Public request tests, unknown-field tests, and bound plus one-past-bound tests |
| Verified session identity        | Prevents signed-out and unverified access to product data              | Every private server function           | Shared authentication and verification middleware               | Signed-out and unverified request tests                                        |
| Final User ownership predicate   | Prevents cross-User reads and writes                                   | Every User-owned SQL operation          | Drizzle query or command predicate                              | Real PostgreSQL owned, missing, and foreign cases                              |
| Related-resource ownership       | Prevents cross-User Bucket, Category, Tag, and relationship references | Commands with foreign IDs               | User-scoped persistence adapter                                 | Foreign-related identifier integration tests                                   |
| Database-owned invariants        | Prevents invalid relationships, duplicates, and delete drift           | PostgreSQL schema                       | Constraints, indexes, and foreign keys                          | Migration checks and real PostgreSQL constraint tests                          |
| Atomic command writes            | Prevents partial lifecycle, migration, Todo, and position state        | Invariant-critical multi-write commands | One SQL statement or proven database atomic operation           | Failure injection at every write boundary, rollback, race, and retry tests     |
| Safe command conflicts           | Prevents accidental conflict semantics and lost updates                | Mutation error mapping                  | Central error mapper plus authoritative stale predicates        | Last-write-wins and `409` contract tests                                       |
| Canonical DTOs and consequences  | Prevents persistence leakage and client guesses                        | Server responses and mutation results   | Domain response mapper                                          | Public response-shape tests                                                    |
| Cache reconciliation             | Prevents optimistic and derived-cache drift                            | TanStack Query state                    | One cache-reconciliation module                                 | Success, rollback, absent-cache, conflict, and resynchronization tests         |
| Per-User realtime hints          | Prevents cross-User leakage and pre-commit publication                 | Realtime invalidation                   | Authenticated gateway after commit                              | Multi-client isolation and publication-order tests                             |
| Authentication controls          | Prevents session reuse, enumeration, and abuse                         | Better Auth flows                       | Better Auth configuration, Neon-backed limits, and route policy | Session, reset, rate-limit, and enumeration tests                              |
| Durable email delivery           | Prevents lost verification and reset messages                          | Authentication email                    | Queue with retries and dead-letter handling                     | Provider failure, retry, and dead-letter tests                                 |
| Telemetry allow-list             | Prevents sensitive-data leakage while preserving diagnosis             | Completion records and logs             | Typed completion record and Cloudflare redaction config         | Required-field and forbidden-field tests plus staging inspection               |
| Production-shaped testing        | Prevents fake-only confidence in SQL and concurrency behavior          | Persistence and integration behavior    | Production Drizzle adapter against isolated PostgreSQL          | Ownership, atomicity, concurrency, and cleanup tests                           |
| Local validation gate            | Prevents formatting, test, type, and build regressions                 | Every backend change                    | `pnpm validate`                                                 | Clean-checkout validation run; zero-tests failure test                         |
| Evidence-based performance       | Prevents speculative budgets and infrastructure                        | First-release performance policy        | Production-shaped telemetry and issue #80 triggers              | Recorded measurements before numeric budgets or new infrastructure             |
| Dependency and exception control | Prevents unreviewed libraries and permanent shortcuts                  | Repository changes and exceptions       | Maintainer approval, issue owner, and removal condition         | Review checklist and tracked issue verification                                |

## Architecture boundaries

- PostgreSQL is the source of truth for Users, Buckets, Todos, Categories, Tags, Todo-Tag relationships, planning state, lifecycle state, and Todo positions.
- Drizzle is the database interface. Better Auth owns identity and sessions. TanStack Start server functions are the private request boundary. TanStack Query is a derived client cache.
- Client code may import server behavior only from `server/functions`.
- Portable domain rules stay separate from request, persistence, and deployment adapters.
- Server functions return domain response DTOs and domain consequences. They do not expose persistence rows merely because a query returned them.

## Request boundaries and authorization

Every private server function MUST:

- declare its HTTP method explicitly;
- validate a strict Zod input at the boundary;
- derive the User from the verified session, never from request data;
- use the shared authentication and database middleware;
- return an explicit response DTO;
- reject unknown fields and enforce positive identifiers, valid IANA timezones, bounded text and collections, and operation-specific work limits.

Authenticated but unverified Users MUST be limited to verification, verification resend, sign-out, and account recovery. Product data is unavailable until verification succeeds.

The application MUST keep Better Auth origin, CSRF, and cookie protections. Session cookie caching is allowed only for ordinary session reads and MUST be bypassed for sensitive account operations. Password reset MUST revoke existing sessions.

Authentication limits MUST be stored in Neon so they apply across Worker isolates. Route-specific limits cover sign-up, sign-in, password-reset request and completion, and verification resend. Responses MUST NOT reveal whether an email address exists. Only Cloudflare's connecting-IP header may be trusted for the client IP at the edge.

## Persistence and ownership

### Runtime connection path

The Worker runtime uses Drizzle with `pg` through the `HYPERDRIVE` binding. Hyperdrive is the approved connection-pooling layer for this application. It keeps the origin pool outside Worker isolates, so the application creates a database client for each invocation and closes it when the invocation finishes.

Cloudflare's guidance supports this path:

- [Hyperdrive connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/)
- [Hyperdrive connection lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/)
- [Cloudflare's node-postgres example](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/)

Direct Neon URLs are reserved for local development, schema migrations, deployment setup, and isolated integration tests. They MUST NOT be exposed as Worker secrets or used to create an application-managed pool. Neon pooler URLs, PgBouncer, a persistent PostgreSQL client, and a second application pool are not part of this architecture.

Hyperdrive query caching MUST be considered when adding reads. Durable writes remain authoritative, and a write does not automatically invalidate cached reads. Do not enable query caching for reads whose freshness or correctness requirements have not been established.

### Ownership and invariants

- Every authoritative read, update, and delete of User-owned data MUST include the authenticated User in its final SQL predicate.
- Raw ID-only persistence helpers MUST remain private to the persistence adapter.
- Referenced Buckets, Categories, Tags, and other related resources MUST be checked against the same User.
- Missing and foreign resources MUST produce the same safe response.
- PostgreSQL constraints own structural invariants, uniqueness, relationship integrity, and delete behavior.
- Zod owns request shape and input caps.
- Middleware owns authentication and verification.
- Domain modules own product rules.
- Persistence adapters own ownership predicates and stale-state guards.
- Response DTOs own data minimization.

### Atomic commands and isolation

Invariant-critical multi-write commands MUST commit as one database operation. Prefer one SQL statement, usually a CTE, when it can express the whole command. Use a database-supported atomic transaction or batch only when the selected Hyperdrive-compatible adapter can prove the required behavior.

The application uses PostgreSQL's default `READ COMMITTED` isolation. It MUST NOT add global version columns, serializable isolation, a general locking framework, or a general idempotency-key framework without a named workflow that demonstrates the need.

Commands MUST be retry-safe through constraints, authoritative state predicates, and atomicity. The required workflows are:

- Lifecycle Reconciliation and Complete Day: Bucket creation, status changes, and planning-date changes commit together.
- Migration Step confirmation: every Todo move and the source Bucket transition commit together.
- Todo creation or update with Tag replacement: the Todo and all Tag changes commit together.
- Todo movement and position rebalance: the moved Todo and every changed position commit together.

Todo field edits are last-write-wins. Return `409` only for stale required preconditions or uniqueness conflicts. Do not use `409` for ordinary field-edit races.

Todo moves MUST use server-derived positions and stale source/destination anchors. Deterministic order is `position`, then Todo ID.

## Errors and response contracts

Map errors centrally:

| Status | Meaning                                                |
| ------ | ------------------------------------------------------ |
| `400`  | Safe validation details                                |
| `401`  | Missing or invalid session                             |
| `403`  | Unverified session, with `EMAIL_VERIFICATION_REQUIRED` |
| `404`  | Missing or foreign resource, without revealing which   |
| `409`  | Stale required precondition or uniqueness conflict     |
| `429`  | Throttled request with retry guidance                  |
| `500`  | Unexpected failure with a request ID and no internals  |

Successful commands return the smallest complete domain result needed by the client. They MUST NOT perform an unconditional final board read when the command result already determines the required consequence.

Examples:

- Todo create returns the full canonical Todo.
- Todo update or toggle returns the full canonical Todo and the server-derived previous Bucket ID.
- Todo move returns the canonical Todo, source and affected Bucket IDs, and every changed position.
- Todo delete returns the deleted Todo ID and previous Bucket ID.
- Category and Tag commands return canonical display DTOs or the deleted entity ID.
- Lifecycle commands return canonical board state and any affected scopes.

## Cache reconciliation and realtime hints

Query keys and QueryClient operations MUST live behind one cache-reconciliation module. Mutation hooks MUST NOT manipulate query keys directly.

The cache module exposes three operations:

1. Begin and roll back a deterministic optimistic change.
2. Apply a domain consequence.
3. Resynchronize a named domain scope.

Optimistic updates are limited to deterministic Todo edits and moves. The client cancels affected queries, snapshots loaded data, applies the optimistic change, restores the snapshot on failure, and replaces every assumption with the server result on success.

If a consequence cannot construct a complete entity absent from a loaded cache, refetch instead of creating partial data. Apply canonical position patches before sorting.

After a mutation commits, publish one atomic list of domain consequences. Realtime hints contain no User ID and no TanStack Query key. Notify the User's other active clients. Suppress the originating client only when its successful response reconciles every affected cache.

Duplicate hints are harmless. Malformed or unknown hints trigger full resynchronization. Reconnect, focus recovery, session changes, conflicts, and uncertain mutation outcomes trigger canonical refetches.

Do not add replay cursors, sequence numbers, client-mutation IDs, or protocol versions until replay, ordered patches, long-lived clients, or cross-deployment compatibility creates a concrete need.

## Authentication email and sensitive data

Verification and password-reset email MUST be sent to the requested recipient through durable, retrying delivery with a dead-letter path. Provider failures MUST not silently discard authentication email.

Application logs, traces, and completion records MUST NOT contain:

- Todo content or request bodies;
- cookies, credentials, authorization headers, or tokens;
- email addresses or email bodies;
- complete URLs or token-bearing query strings;
- SQL values or raw provider responses;
- environment values or secret material.

Cloudflare logs and traces MUST redact URL query strings. Error output uses safe error classes or codes, not raw provider or database payloads.

## Telemetry

Each named backend operation MUST emit one completion record. The record contains only allow-listed fields:

- stable operation name;
- request or trace ID;
- deployment version;
- safe outcome and HTTP status;
- total duration and database duration;
- database round-trip count;
- third-party duration;
- response bytes;
- region;
- cold-start signal when available;
- conflict and rate-limit flags.

Emit the record once at completion, including failed operations. Use structured fields that can be queried in Cloudflare Workers Logs and correlated with traces. Keep aggregate coverage and telemetry volume informational until production-shaped evidence supports numeric budgets.

## Testing and validation

Test behavior at the highest seam that proves it:

- Public server-function tests prove authentication, verification, strict input validation, status mapping, DTOs, and safe request IDs.
- Domain-command tests prove deterministic product rules with injected dependencies.
- Production Drizzle adapters against isolated real PostgreSQL prove ownership predicates, constraints, atomicity, and concurrency.
- Cache tests use a real in-memory QueryClient through the cache module's public interface.
- Realtime tests use the authenticated invalidation gateway and cache interface.
- Component tests cover user-visible interaction and mock public server or cache seams, not private implementation details.

Every ID-bearing operation needs owned, missing, foreign, and foreign-related cases. Every atomic workflow needs rollback, retry, stale-state, race, and failure-injection coverage at each invariant-critical write boundary.

`pnpm validate` is the local no-regression gate. It MUST fail on formatting, lint, tests, typechecking, production Worker build failures, and zero discovered tests. Aggregate coverage is informational and is not a release gate.

Validation does not deploy, migrate, or access staging. Those prerequisites belong in the deployment documentation.

## Performance and dependencies

First-release performance requirements are functional and evidence-based. Do not set numeric latency, query-count, payload, convergence, or cost budgets before representative data exists.

Investigate numeric budgets when production-shaped telemetry shows real slowness, cost, or capacity pressure, or when a backend change creates a concrete risk. Track that investigation under [issue #80](https://github.com/alerecchi/productivity-up/issues/80).

Adding or replacing a library requires maintainer approval and an update to the recorded tech stack. This ticket does not add a library.

## Review checklist

Every backend change should answer these questions in its pull request or review:

- Does each touched server function have an explicit method, strict input, verified session, User-derived identity, and response DTO?
- Do final SQL predicates enforce User and related-resource ownership?
- Which threat or invariant does each new rule protect?
- Where is each invariant enforced, and what test proves it?
- Is every invariant-critical multi-write atomic and retry-safe?
- Are `409` responses limited to stale required preconditions and uniqueness conflicts?
- Does the command return a canonical domain consequence rather than persistence rows or a universal envelope?
- Does cache reconciliation handle success, rollback, conflict, uncertainty, inactive caches, and absent entities?
- Are realtime hints published only after commit and isolated per User?
- Could logs, traces, errors, or provider calls expose content, credentials, tokens, email data, SQL values, URLs, or environment values?
- Does `pnpm validate` pass?
- If the change does not yet meet the standard, is the exception tied to an issue with a named removal condition?

## Existing work and tracked gaps

The standard applies immediately to new and changed code. Existing work is tracked by the implementation issues that own each contract:

| Area                                                               | Owning work                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed Cloudflare runtime and bindings                              | [#88](https://github.com/alerecchi/productivity-up/issues/88)                                                                                                                                         |
| Private request, authorization, error, DTO, and telemetry contract | [#90](https://github.com/alerecchi/productivity-up/issues/90)                                                                                                                                         |
| Pure board reads and atomic lifecycle commands                     | [#91](https://github.com/alerecchi/productivity-up/issues/91)                                                                                                                                         |
| Atomic Migration Step confirmation                                 | [#92](https://github.com/alerecchi/productivity-up/issues/92)                                                                                                                                         |
| Atomic Todo commands                                               | [#93](https://github.com/alerecchi/productivity-up/issues/93)                                                                                                                                         |
| User-owned Category and Tag commands                               | [#94](https://github.com/alerecchi/productivity-up/issues/94)                                                                                                                                         |
| Cache reconciliation                                               | [#95](https://github.com/alerecchi/productivity-up/issues/95) and [#96](https://github.com/alerecchi/productivity-up/issues/96)                                                                       |
| Lifecycle and Migration consequences                               | [#97](https://github.com/alerecchi/productivity-up/issues/97)                                                                                                                                         |
| Taxonomy consequences and standalone Buckets cleanup               | [#98](https://github.com/alerecchi/productivity-up/issues/98)                                                                                                                                         |
| Authenticated realtime transport and convergence                   | [#99](https://github.com/alerecchi/productivity-up/issues/99), [#100](https://github.com/alerecchi/productivity-up/issues/100), and [#101](https://github.com/alerecchi/productivity-up/issues/101)   |
| Session, abuse, and authentication-email hardening                 | [#102](https://github.com/alerecchi/productivity-up/issues/102), [#103](https://github.com/alerecchi/productivity-up/issues/103), and [#104](https://github.com/alerecchi/productivity-up/issues/104) |
| Production-shaped verification                                     | [#105](https://github.com/alerecchi/productivity-up/issues/105)                                                                                                                                       |

An exception is not complete when it has an owner alone. It also needs a removal condition, such as a named issue being merged, a verification result being recorded, or a backend contract being migrated.
