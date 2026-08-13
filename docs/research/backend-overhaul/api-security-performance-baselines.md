# Minimum-sufficient API security and performance baseline

_Research date: 2026-08-13. Scope: the current Productivity Up stack on `main` (`@tanstack/react-start` 1.168, TanStack Query 5.101, Better Auth 1.6, Drizzle 0.45, `@neondatabase/serverless` 1.1, PostgreSQL/Neon HTTP), for a public application whose private data boundary is one User. This is a launch baseline, not a compliance profile or an implementation plan._

## Answer

The minimum sufficient baseline is not “run every possible security check.” It is a small set of non-negotiable controls placed at the cheapest authoritative boundary:

1. authenticate each private request once;
2. derive the User identity only from the verified session;
3. scope every data access and mutation to that User in the SQL operation that reads or changes the row;
4. validate untrusted input once at the server-function/auth-route boundary, with explicit writable fields and bounded work;
5. put durable invariants in PostgreSQL constraints and make multi-write invariants atomic;
6. retain TanStack Start and Better Auth's same-origin/CSRF protections and secure-cookie defaults;
7. rate-limit only abuse-sensitive or cost-amplifying flows, using storage that works across the chosen runtime's instances;
8. return safe errors and record low-cardinality security and latency signals without secrets or payloads;
9. measure real user interaction latency and whole-workflow server/database cost before setting backend latency or query-count budgets.

This is both safer and faster than a stack of preflight reads: one User-scoped `UPDATE ... WHERE id = ? AND user_id = ? RETURNING ...` authorizes and mutates in one round trip; a unique constraint resolves races more reliably than a “does this exist?” query; an atomic compare-and-set rejects stale state without locking every request.

## Why this is the right threat model

Productivity Up is multi-user but has no organization/workspace sharing or roles. The security invariant is therefore **strict per-User isolation**: a signed-in User may only observe or change their own Buckets, Todos, Categories, Tags, and planning/lifecycle state. IDs are sequential integers, but replacing them with UUIDs would only make guessing harder; OWASP requires object-level authorization for every operation that accepts a client-controlled object ID regardless of ID format ([OWASP API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)).

The other concrete launch threats are:

- unauthenticated access or a stolen/revoked session;
- cross-site requests made with a User's cookies;
- property smuggling, malformed or unbounded input, and unintended response fields;
- concurrent requests leaving partial lifecycle, ordering, or Todo–Tag state;
- brute force or automated email/password-reset abuse;
- expensive requests, oversized collections, or third-party email spend;
- secrets, stack traces, tokens, or personal data leaking through bundles, responses, or logs;
- slow workflows caused by sequential serverless database round trips, N+1 loops, missing query-aligned indexes, cold starts, or cross-region placement.

There is no current role hierarchy, public API, file upload, admin surface, collaborative editing, or regulated-data requirement. Controls for those hypothetical risks are out of baseline until the product introduces them.

## Required controls and their cheapest authoritative placement

| Invariant or threat                                                             | Minimum sufficient control                                                                                                                                                       | Best enforcement                                                                                               | Avoid as redundant or misleading                                                                                                |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Private endpoint reached without a valid session                                | Apply one shared server-side auth middleware to every private server function; route guards are UX only                                                                          | TanStack Start server-function middleware calling Better Auth once and passing the verified session in context | Rechecking the session in repository methods; trusting client User IDs; relying on `beforeLoad`                                 |
| User A supplies User B's object ID                                              | Include session `userId` in every object lookup/write predicate; return the same not-found response for absent and foreign rows                                                  | One User-scoped SQL statement or one owned aggregate query                                                     | “ID is hard to guess”; separate unscoped lookup followed by an ownership check; duplicate ownership reads before a scoped write |
| A relation crosses the User boundary                                            | Validate related IDs with User-scoped queries and, where schema design permits, use composite keys/foreign keys that make cross-User references impossible                       | PostgreSQL constraint plus scoped application query for a useful error                                         | Trusting a foreign key that proves existence but not same-User ownership                                                        |
| Client changes fields it should not                                             | Strict input schemas and explicit update/response projection                                                                                                                     | Zod at `createServerFn().inputValidator(...)`, then explicit Drizzle `.set(...)`/column selection              | Passing request objects directly to Drizzle; validating the same payload again in each layer                                    |
| Malformed or oversized work                                                     | Bound string lengths, collection sizes, pagination, and request body/runtime limits; reject unknown fields                                                                       | Boundary schema and hosting/runtime limits                                                                     | Generic “sanitize everything”; regexes unrelated to a domain rule; unlimited lists because current data is small                |
| Cross-site cookie-authenticated mutation                                        | Preserve same-origin server-function checks and Better Auth origin/Fetch Metadata/SameSite protections; exact production origins only                                            | TanStack Start CSRF middleware and Better Auth `trustedOrigins`/cookie defaults                                | A second CSRF-token system for the same endpoints; disabling origin checks to fix proxy configuration                           |
| SQL injection                                                                   | Use Drizzle parameters and tagged `sql` expressions; review any raw SQL boundary                                                                                                 | ORM/query construction                                                                                         | HTML escaping or SQL “sanitizing” already-typed values; string-built SQL                                                        |
| Two requests violate an invariant or a multi-write operation partially succeeds | Unique/check/foreign-key constraints, conditional writes, and transactions for workflows whose intermediate state must never be visible                                          | PostgreSQL                                                                                                     | A pre-check without a constraint; swallowing partial failures; a global transaction around single-statement writes              |
| Credential and email flow abuse                                                 | Keep Better Auth's production limits, use trustworthy client-IP derivation, distributed limiter state in multi-instance/serverless deployments, and provider spend alerts/limits | Better Auth + deployment edge/provider                                                                         | Blanket low limits on ordinary authenticated Todo operations; an in-memory limiter assumed to be global                         |
| Sensitive information leaks                                                     | Server-only imports/secrets, least response fields, generic 5xx errors, HTTPS, and redacted structured logs                                                                      | Build/runtime boundary and common error/logging layer                                                          | Logging request/response bodies, cookies, reset URLs, auth tokens, or database errors to clients                                |
| User-visible slowness                                                           | Instrument end-to-end actions, server functions, database round trips, payload size, and third-party calls; optimize only measured hot paths                                     | Field telemetry plus server spans/query metrics                                                                | A universal “one query” rule; arbitrary per-query milliseconds; indexes or caches without workload evidence                     |

TanStack Start explicitly treats server functions as independently reachable API endpoints: private data must be protected in the endpoint, not only in the route that renders its UI. It also supports runtime input validation and installs same-origin protection automatically when the application does not define its own `src/start.ts` ([TanStack Start server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)). Productivity Up currently has no `src/start.ts`, so the baseline is to **verify the generated deployment preserves this protection**, not add another CSRF mechanism. If a future `src/start.ts` is added, `createCsrfMiddleware` must be configured explicitly.

Better Auth already validates origins/Fetch Metadata, defaults session cookies to `SameSite=Lax`, `HttpOnly`, and secure cookies in production, and warns that disabling CSRF or origin checks opens CSRF/open-redirect exposure ([Better Auth security](https://better-auth.com/docs/reference/security), [cookies](https://better-auth.com/docs/concepts/cookies)). Configure exact production origins and the canonical public base URL; do not allow protocol-agnostic wildcards or production localhost origins.

## Authentication and session decisions

- **One authentication check per private server-function request is mandatory.** Continue passing `context.session.user.id`; no API payload may select a User.
- **Cookie caching is a conscious revocation-latency tradeoff, not a free optimization.** Better Auth says a revoked session can remain usable on another device until `cookieCache.maxAge` expires and recommends bypassing or shortening the cache for sensitive operations ([session management](https://better-auth.com/docs/concepts/session-management)). The current configuration is 15 minutes although its comment says five. For public launch, document and test one accepted revocation window; five minutes is a reasonable initial product choice, not a standard-derived threshold. Password reset should revoke existing sessions, and any future destructive account/security operation should force database validation.
- **Do not implement password crypto, tokens, OAuth state, or session cookies locally.** Better Auth owns them. Keep its dependencies current and exercise its configuration in integration tests.
- **Do not await user-enumerable email delivery on the request's critical path.** Better Auth recommends dispatching reset/verification email through the runtime's durable `waitUntil`-style mechanism to reduce timing leakage; a bare fire-and-forget promise is unsafe in serverless runtimes ([Better Auth email](https://better-auth.com/docs/concepts/email)). The concrete runtime mechanism belongs to the deployment decision.

## Authorization and data-model implications for this repository

The existing pattern in Todo/Category/Tag writes—`WHERE id = ? AND user_id = ?` with `RETURNING`—is the baseline pattern. It is both the authorization check and the mutation result. The core tests should prove it rejects a second User's IDs.

Repository inspection also shows why the rule must cover **every** access, not merely public handlers:

- several Board repository operations (`archiveBucket`, `markBucketPendingMigration`, and reads by `bucketId`) are keyed only by a Bucket ID after earlier ownership checks;
- `todos.bucket_id`, `todos.category_id`, and `todo_tags.tag_id` foreign keys prove referenced rows exist, but do not prove the rows share the same `user_id`;
- `replaceTodoTags` deletes then inserts in separate statements;
- Todo rebalancing and Migration Steps perform loops of conditional updates; `completeDay` and Lifecycle Reconciliation perform multiple state transitions.

These are **audit targets**, not a claim that every helper is directly exploitable. A helper can omit a repeated ownership predicate only when its interface makes the earlier proof impossible to bypass and all operations remain within the same atomic unit. Otherwise accept `userId` and scope the query. For durable defense in depth, evaluate composite same-User foreign keys or another schema shape that prevents cross-User relationships at the database layer.

PostgreSQL constraints are authoritative under concurrency, while Drizzle `relations` are query metadata and do not create database foreign keys ([Drizzle relations](https://orm.drizzle.team/docs/relations), [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)). Keep constraints for:

- one Bucket per `(user_id, type, period)`;
- one normalized Category/Tag name per User;
- unique Todo–Tag membership;
- referential integrity and any feasible same-User relationship;
- domain-valid status/type combinations and position rules when expressible locally.

Use an application check for invariants spanning rows or current time, but back race-sensitive results with a conditional write, constraint, or transaction. PostgreSQL's default `READ COMMITTED` isolation gives each command a fresh snapshot; a read followed by a write can therefore observe intervening work, while higher isolation levels may require retrying serialization failures ([PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)).

The current `drizzle-orm/neon-http` path is optimized for one-shot queries. Neon supports multiple non-interactive HTTP queries as a batch, but session/interactive transactions require WebSockets or a compatible serverful driver; Drizzle likewise directs interactive-transaction users to its WebSocket Neon driver ([Neon serverless driver](https://neon.com/docs/serverless/serverless-driver), [Drizzle–Neon connection guide](https://orm.drizzle.team/docs/connect-neon), [Drizzle transactions](https://orm.drizzle.team/docs/transactions)). Therefore:

- do not add a transaction to every handler;
- prefer a single atomic SQL statement or conditional `UPDATE` when it expresses the invariant;
- use a non-interactive HTTP transaction/batch only when the complete statement list is known up front and the ORM/driver path exposes the required semantics;
- require interactive transaction support (or redesign the workflow) where later writes depend on earlier results and partial success is invalid—especially Todo–Tag replacement, multi-row reordering, Bucket Migration, and lifecycle state transitions.

The transport/hosting ticket should decide how to supply that capability; security policy should state the required atomic outcome, not prescribe a driver prematurely.

## Resource and abuse controls

OWASP recommends bounded payloads/collections, timeouts, endpoint-specific rate limits, and third-party spending limits rather than a single global throttle ([OWASP API4:2023](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)). Applied here:

- keep bounded Todo titles/descriptions, Tag/Category names, decision maps, tag-ID arrays, and any future pagination limits;
- cap the number of Todos a move/rebalance or Migration Step can process in one request, or redesign it into bounded server work;
- set runtime request/body/execution limits and database statement timeouts appropriate to measured legitimate workflows;
- keep Better Auth's production endpoint-specific limits and explicitly protect sign-in, sign-up, verification, and reset-email flows;
- configure Resend budget/usage alerts and monitor send errors;
- add per-User or per-IP limits to ordinary server functions only after abuse evidence or where one call has clear amplification.

Better Auth's production default is 100 requests per 60 seconds with stricter rules for sensitive routes, but its default limiter storage is in-memory and documented as unsuitable for many serverless deployments. A horizontally scaled launch must choose database, secondary, or custom shared storage and configure IP headers only from a trusted proxy ([Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)). The numeric defaults are a starting configuration to load-test, not proof that the business flows are safe.

## Performance baseline: measure the User's wait, not security-check count

No primary source can supply a correct millisecond or query-count budget for Productivity Up's data shape, region, provider, cold-start rate, and network path. Issue 66 therefore correctly leaves numeric workflow budgets open until a measured baseline exists. Launch readiness should require the following measurement loop:

1. define representative workflows: authenticated board load with and without reconciliation; create/edit/complete/delete Todo; cross-Bucket move with and without rebalance; create/update Tag or Category; begin/confirm each Migration Step; sign-in and session refresh;
2. run them against a production-like deployment and realistic small/large per-User datasets, including warm and cold requests;
3. record client interaction-to-paint, end-to-end request duration, server execution, database duration and round-trip count, rows/bytes returned, third-party duration, status, cold-start indicator, and region—without recording Todo text or credentials;
4. establish p50/p75/p95/p99 per workflow and a failure/conflict rate; set the first budgets just above demonstrated healthy distributions, then tighten from field data;
5. make CI reject material regressions on deterministic query counts, payload ceilings, or benchmark fixtures; alert on production latency/error SLOs rather than making noisy network timings unit-test gates.

For the user-facing outer bound, use the current Core Web Vitals thresholds at the 75th percentile: INP at or below 200 ms, LCP at or below 2.5 s, and CLS at or below 0.1, segmented by mobile and desktop ([web.dev Web Vitals](https://web.dev/articles/vitals)). Those are page/interaction thresholds, not API SLOs. The product's separately agreed reactivity target is state propagation to the User's other active tabs/devices in about one second. Same-device mutations should update optimistically when safe, then reconcile or roll back on the authoritative response.

### Query and latency rules

- **Count remote round trips, not ORM calls alone.** HTTP is efficient for one-shot queries; sequential loops amplify network latency. Combine work into one SQL statement/Drizzle relational query, a safe batch, or a transaction where that preserves clarity and correctness.
- **Parallelize only independent reads.** Do not hide an ordering or atomicity dependency behind `Promise.all`.
- **Eliminate N+1 behavior on measured workflows.** Board lifecycle and migration loops deserve explicit round-trip budgets after instrumentation. Drizzle relational queries generate one SQL statement for nested data ([Drizzle query data](https://orm.drizzle.team/docs/data-querying)).
- **Index demonstrated predicates and ordering.** Likely candidates combine `user_id` with Bucket status/type/period and Todo Bucket/position, but verify with production-like row counts and `EXPLAIN (ANALYZE, BUFFERS)`. PostgreSQL notes that `EXPLAIN ANALYZE` executes statements, and actual plans/row estimates—not intuition—should guide tuning ([PostgreSQL `EXPLAIN`](https://www.postgresql.org/docs/current/using-explain.html)).
- **Do not add prepared statements, caches, a pool, or a second data store by default.** Drizzle supports prepared queries, but their value depends on driver/runtime reuse and measured parse/plan cost ([Drizzle query performance](https://orm.drizzle.team/docs/perf-queries)). A private response cache must never be shared across Users, and invalidation complexity must earn its latency benefit.
- **Co-locate application and database regions.** Measure split deployments from the User through the app to Neon; a generous free tier is valuable only if cold starts and cross-region hops still meet the workflow budgets.

## Errors, secrets, and observability

OWASP recommends rejecting unexpected input, safe response content types, generic errors, HTTPS, and security-event logging without exposing technical details ([OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)). The minimum here is:

- consistent `401` for no session, `404` for absent-or-not-owned objects, `409` for stale business state, `422`/framework validation response for invalid input, `429` with retry guidance, and generic `500` responses;
- no stack, SQL text with values, environment value, cookie, auth/reset token, email body/link, or Todo content in client errors or logs;
- structured request IDs and spans for server function, User-safe pseudonymous identifier if needed, outcome/status, duration, database round trips/time, response bytes, and third-party duration;
- security signals for repeated auth failure, rate-limit activation, impossible discrete enum input, and repeated cross-User/not-found probing, with sampling/aggregation to avoid alert noise;
- production source maps and detailed exceptions only in an access-controlled observability system with retention/redaction rules.

TanStack Start recommends keeping database URLs and API secrets in server-only code and checking client bundles; its environment guidance also warns that some edge runtimes inject environment values per request, making module-scope reads unreliable and potentially unsafe ([execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model), [environment variables](https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables)). Productivity Up currently parses all server environment variables at module load; deployment compatibility must be verified for the selected runtime.

## Enforcement matrix

| Control                                     | Automated test / CI                                                                                                            | Production measurement                           | Human review only when needed                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------- |
| Every private server function authenticates | Architecture test or lightweight source policy enumerating exported server functions; explicit allowlist for public auth route | Unauthorized request rate                        | New endpoint classification                                       |
| Per-User object authorization               | Two-User integration matrix for every ID-bearing read/write and related-object input                                           | Sampled not-found/probing signals                | Query/aggregate ownership semantics                               |
| Boundary schema and write projection        | Unit tests for unknown keys, limits, enums, malformed IDs; TypeScript/build                                                    | Validation failure cardinality, sampled          | Domain-specific semantic limits                                   |
| CSRF/origin/cookies                         | Browser/integration tests for foreign `Origin`, missing metadata as deployed, cookie attributes, redirects                     | Rejected-origin count                            | Proxy/origin topology changes                                     |
| Constraints and atomicity                   | Migration/schema assertions; concurrency tests against real PostgreSQL; fault injection between writes                         | Conflict/retry/partial-failure counters          | Decide which invariant needs a transaction versus conditional SQL |
| Auth/email abuse                            | Integration tests for limiter and trusted IP behavior                                                                          | 429s, email volume/cost/failure alerts           | Tune endpoint limits from legitimate traffic                      |
| Safe responses/logs                         | Snapshot/error-contract tests; secret scanner and client-bundle inspection                                                     | Redaction canaries, error volume                 | New sensitive fields and retention policy                         |
| Workflow performance                        | Deterministic fixture benchmarks, query-count/payload regression tests                                                         | Field Web Vitals and per-workflow p50–p99 traces | Approve budgets after baseline; review `EXPLAIN` plans            |

Avoid brittle custom lint rules that merely recognize a spelling such as `.middleware([authRequiredMiddleware])`; composition or future wrappers will create false confidence. Prefer behavior tests plus a small, explicit endpoint inventory. Static checks are valuable for forbidden client imports of `src/server/**`, leaked environment prefixes, unbounded schema constructs, and direct unsafe SQL APIs when they can be made semantic and low-noise.

## Launch gate and non-goals

The backend meets this baseline when:

- every private endpoint passes unauthenticated and two-User isolation tests;
- every untrusted payload is strictly bounded and only explicit properties reach a write;
- schema constraints and PostgreSQL concurrency tests prove the named invariants, with no partial multi-write outcomes;
- deployed same-origin/auth cookie behavior and shared rate limiting are verified through the actual proxy/runtime;
- secrets and internal errors do not reach client bundles, responses, or logs;
- representative workflows have field/server/database instrumentation, an initial measured budget, and no unexplained sequential round-trip hot spot;
- auth/email abuse and provider cost alerts are active;
- dependency and configuration review is part of regular maintenance.

Not required for this launch baseline: organization tenancy/RBAC, database Row-Level Security as a second full authorization system, MFA, UUID conversion, a WAF, blanket rate limiting of all Todo calls, encryption beyond platform TLS/managed storage, proactive background Lifecycle Reconciliation, universal response schemas, or a security product/plugin. Any may become justified by a new threat, sharing model, compliance need, or production evidence; none substitutes for the per-User predicates, constraints, and tests above.

## Sources

- [OWASP API1:2023 — Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP API4:2023 — Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [TanStack Start — Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start — Execution Model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)
- [TanStack Start — Environment Variables](https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables)
- [Better Auth — Security](https://better-auth.com/docs/reference/security)
- [Better Auth — Cookies](https://better-auth.com/docs/concepts/cookies)
- [Better Auth — Session Management](https://better-auth.com/docs/concepts/session-management)
- [Better Auth — Rate Limiting](https://better-auth.com/docs/concepts/rate-limit)
- [Better Auth — Email](https://better-auth.com/docs/concepts/email)
- [Drizzle — Neon](https://orm.drizzle.team/docs/connect-neon)
- [Drizzle — Transactions](https://orm.drizzle.team/docs/transactions)
- [Drizzle — Relations and foreign keys](https://orm.drizzle.team/docs/relations)
- [Drizzle — Query data](https://orm.drizzle.team/docs/data-querying)
- [Drizzle — Query performance](https://orm.drizzle.team/docs/perf-queries)
- [Neon — Serverless driver](https://neon.com/docs/serverless/serverless-driver)
- [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL — Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL — Using `EXPLAIN`](https://www.postgresql.org/docs/current/using-explain.html)
- [web.dev — Core Web Vitals](https://web.dev/articles/vitals)
