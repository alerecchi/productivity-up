# Hosting, transactions, and PostgreSQL connections

Research date: 2026-08-13  
Scope: Wayfinder issue [#70](https://github.com/alerecchi/productivity-up/issues/70)  
Method: current first-party documentation and version-pinned upstream source; no deployment or backend changes were made.

## Answer

Use **Cloudflare Workers + Neon** as the leading proof-of-compatibility candidate. It passes TanStack Start's documented hosting path, has the most useful unrestricted free tier in this shortlist, can place compute near the database, and offers a credible same-provider path to per-User WebSocket fan-out through Durable Objects. Keep **Neon HTTP** for ordinary operations and fixed atomic batches while the workflow audit establishes whether interactive transactions are actually required. If they are required and Cloudflare wins the hosting bakeoff, test **Drizzle + `pg` through Hyperdrive**, with a direct Neon origin and query caching disabled for auth, permissions, mutable board data, and read-after-write paths.

Keep **Netlify + Neon HTTP** as the simplest serverless fallback and **Railway Node + Neon** as the persistent-connection reference architecture. Railway has the cleanest native fit for a long-lived PostgreSQL pool and long-lived WebSockets, but its continuing free allowance is only $1/month. **Vercel + Neon** is viable only when its Hobby terms fit: Hobby is generous numerically but limited to personal, non-commercial use.

The current connection is more capable than “no transactions” suggests:

- Drizzle 0.45.2's `neon-http` adapter deliberately throws for the interactive callback API `db.transaction(...)`.
- The same adapter implements `db.batch([...])` by sending the prepared statements through Neon's HTTP `transaction(...)` API. That is one non-interactive, atomic transaction, but later statements cannot branch on earlier results.
- Therefore, do not replace the connection solely to make a fixed set of writes atomic. First prefer one SQL statement/CTE or `db.batch`. Move to an interactive driver only for a workflow whose later SQL genuinely depends on an earlier result or that needs session semantics.

These conclusions are research inputs, not an approval to add the Cloudflare adapter, Hyperdrive, `pg`, Postgres.js, WebSocket infrastructure, or any other library.

## Current baseline

The repository currently constructs `neon(DATABASE_URL)` and passes it to `drizzle-orm/neon-http` in [`src/server/db/client.ts`](../../../src/server/db/client.ts). The pinned dependency ranges are Drizzle `^0.45.2` and `@neondatabase/serverless` `^1.1.0` in [`package.json`](../../../package.json). TanStack Start has no host-specific adapter in [`vite.config.ts`](../../../vite.config.ts), and the application declares Node `>=24`.

TanStack Start's current hosting guide names Cloudflare Workers, Netlify, Railway, Vercel, Nitro, and a Node server as supported deployments; Cloudflare, Netlify, and Railway are official hosting partners. The guide also makes clear that each target needs its own build/runtime setup rather than assuming the default build is portable without verification. ([TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting))

Runtime compatibility is a gate, not a scoring preference. Every candidate must build and smoke-test TanStack Start SSR/server functions, Better Auth cookies and callbacks, the `process.env` validation path, Resend calls, and Drizzle before its price or convenience matters.

## Hosting shortlist

All shortlisted arrangements keep the full TanStack Start application together and treat Neon as an external managed database. Splitting the UI from Start's server functions would create a new API, cookie/CORS, deployment, and failure boundary; that is not justified by the present requirements. A separate realtime coordinator is a narrower split and remains eligible.

| Rank | Combination | Gate and free tier | Latency and connections | Reactivity/background | Operations, observability, and portability |
| --- | --- | --- | --- | --- | --- |
| 1 | **Cloudflare Workers + Neon HTTP**, optionally Hyperdrive and a Durable Object | TanStack documents a first-party Workers setup. Workers Free permits 100,000 requests/day; Hyperdrive Free permits 100,000 SQL statements/day. SQLite-backed Durable Objects are available on Free. ([hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/workers/platform/pricing/#durable-objects)) | Workers run near ingress by default; Smart Placement can move execution near a database and is available on all plans. Hyperdrive removes repeated TCP/TLS/authentication setup and pools near the origin. ([placement](https://developers.cloudflare.com/workers/configuration/placement/), [Hyperdrive lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/)) | Workers and Durable Objects can terminate WebSockets; one Durable Object can coordinate many clients and hibernate without dropping sockets. This is the strongest native path to the ~1-second per-User sync target. Request-triggered lifecycle reconciliation needs no scheduler. ([Durable Object WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)) | Highest initial runtime-adapter risk because Workers is not a full Node process, although Node compatibility is available. Free Workers Logs allow 200,000 events/day with 3-day retention. Hyperdrive and Durable Objects add concepts, but all remain on one app platform. ([Node compatibility for database drivers](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)) |
| 2 | **Netlify + Neon HTTP**; use a request-scoped transaction-capable connection only if proven necessary | TanStack lists Netlify as an official partner. Free supplies 300 credits/month with a hard limit. Function compute costs 10 credits/GB-hour, each production deploy 15 credits, 10,000 web requests 2 credits, and 1 GB bandwidth 20 credits, so the tier is useful for an early app but all usage competes for one pool. ([Netlify credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)) | Functions are ephemeral, but a site/function region can be selected, including Frankfurt, to colocate with Neon Frankfurt. Prefer HTTP for ordinary queries; a TCP application pool can multiply across function instances and must be bounded behind the Neon pooler. ([function regions](https://docs.netlify.com/build/functions/configuration/#region)) | Functions support background mode, which can return `202` while work continues, but Netlify does not document a Durable-Object-like coordinator for cross-instance client fan-out. Treat realtime as a separate managed or custom service. ([Functions API](https://docs.netlify.com/build/functions/api/#background-mode)) | Simpler full-stack serverless operations than a Worker plus Hyperdrive/DO. Free includes only current/past-day real-user monitoring and analytics; function metrics/logs are available. Credit accounting and the hard cutoff are less predictable than Cloudflare's request/query quotas. ([plan comparison](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/#compare-credit-based-plans), [function usage](https://docs.netlify.com/build/functions/usage-and-billing/)) |
| 3 | **Railway Node server + Neon**, using a small persistent driver pool | TanStack lists Railway as an official partner and documents a Node-style deployment. After the $5/30-day trial, Free supplies only $1 credit/month, so it is not a generous continuing tier and is unlikely to sustain a continuously active service. ([Railway free trial](https://docs.railway.com/pricing/free-trial), [plans](https://docs.railway.com/pricing/plans)) | A long-running Node process can reuse a small `pg` or Postgres.js pool and supports full interactive Drizzle transactions. Railway's deployment regions are US West, US East, Europe West (Amsterdam), and Asia Southeast; choose Europe West for a European Neon project and measure the remaining regional RTT. ([edge and deployment regions](https://docs.railway.com/networking/edge-networking)) | Railway supports long-lived WebSockets; current docs say WebSocket connections are exempt from inactivity timeouts. A single replica can fan out in memory initially; multiple replicas require a broker/adapter. ([Railway WebSockets](https://docs.railway.com/guides/socketio)) | The easiest transaction and process-lifecycle model, strong portability via the Node server output, and built-in logs/metrics dashboards. App sleep can reduce cost but introduces wake-up latency and makes socket continuity impossible while asleep. ([observability](https://docs.railway.com/observability), [serverless sleep/cost control](https://docs.railway.com/pricing/cost-control)) |
| 4, conditional | **Vercel + Neon HTTP** | TanStack documents Vercel deployment. Hobby includes 1,000,000 function invocations, 4 active CPU-hours, and 360 GB-hours provisioned memory, but the plan is for personal, non-commercial use. It is not a free production option if Productivity Up becomes commercial. ([TanStack hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [Vercel Hobby](https://vercel.com/docs/plans/hobby)) | Hobby can choose one function region; set `fra1` when Neon is in Frankfurt instead of accepting the `iad1` default. Static assets remain global. ([function regions](https://vercel.com/docs/functions/configuring-functions/region), [region list](https://vercel.com/docs/regions)) | Vercel's June 2026 guidance says Functions now accept WebSockets, but a connection is pinned only for the function's maximum duration and later connections have no instance affinity; durable fan-out still needs shared state such as marketplace Redis. ([Vercel WebSockets](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)) | Excellent previews and a portable serverless shape, but Hobby runtime logs retain only one hour and GitHub organization repositories cannot connect to Hobby. ([runtime logs](https://vercel.com/docs/logs/runtime), [limits](https://vercel.com/docs/limits)) |

### Split-deployment conclusions

1. **Keep the TanStack application together.** Splitting static assets is already handled by each platform's CDN. Do not extract an API merely to gain a nominally cheaper static host.
2. **A separate realtime plane is legitimate.** Cloudflare Durable Objects alongside a Cloudflare app is the least fragmented option. With Netlify or Vercel, a separate broker/service adds another auth, region, quota, and observability boundary. With one Railway replica, the app process can initially own sockets; scaling replicas creates the broker requirement.
3. **Keep schema migration connectivity separate from runtime connectivity.** Neon recommends a direct connection for ORM migrations because transaction-mode pooling does not preserve all required session behavior. ([Neon pooling](https://neon.com/docs/connect/connection-pooling))
4. **Keep app compute near the write-primary.** Neon explicitly recommends same-region application/database placement and minimizing sequential round trips. Its Frankfurt region can align exactly with Netlify `fra` or Vercel `fra1`; Railway Europe West is Amsterdam; Workers can use Smart Placement or Hyperdrive. ([Neon latency guidance](https://neon.com/faster), [Neon regional status/locations](https://neon.com/docs/introduction/status))

## Exact transaction semantics

### Drizzle 0.45.2 + Neon HTTP (the current adapter)

Each ordinary Neon HTTP query is one HTTPS `fetch`. There is no persistent PostgreSQL session, and the version-pinned driver documentation says a single fetch query does not support sessions or transactions. The underlying client separately supports a **non-interactive** `sql.transaction([...])`: all queries are supplied before execution and issued in one fetch. ([Neon serverless 1.1.0 README](https://github.com/neondatabase/serverless/blob/v1.1.0/README.md#sessions-transactions-and-node-postgres-compatibility))

Drizzle exposes two distinct behaviors in 0.45.2:

- `db.transaction(async tx => ...)` throws `No transactions support in neon-http driver`. ([version-pinned source](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/neon-http/session.ts#L230-L245))
- `db.batch([query1, query2, ...])` prepares every query and calls `client.transaction(builtQueries, ...)`; the batch therefore uses Neon's one-fetch, non-interactive transaction. ([version-pinned source](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/neon-http/session.ts#L185-L203))

The raw Neon transaction API accepts isolation level, read-only, and deferrable options and sends them as batch headers. Drizzle's 0.45.2 `db.batch` wrapper does not expose a transaction-config argument and passes only result-shape options, so workflows needing explicit isolation must use a supported alternative rather than assuming `db.batch` configures it. ([Neon 1.1.0 implementation](https://github.com/neondatabase/serverless/blob/v1.1.0/src/httpQuery.ts#L242-L300))

Use this path when every statement and parameter is known in advance. It is not interactive: code cannot read statement 1's returned ID, decide what statement 2 should be, and remain inside the same transaction. Often the best HTTP-compatible answer is one data-modifying CTE, one `INSERT ... RETURNING` statement, a database constraint, or an atomic conditional `UPDATE`, because one statement is inherently transactional and saves round trips.

### Neon WebSockets (`@neondatabase/serverless` `Pool`/`Client`)

The WebSocket constructors are node-postgres compatible and support sessions and interactive transactions. In an edge/serverless handler, the Pool or Client must be created, used, and closed within that single request because the socket cannot outlive it. The driver's own example notes that a request-scoped `Pool` does not actually reuse its pool across requests. ([Neon serverless driver](https://neon.com/docs/serverless/serverless-driver))

This is the least conceptually disruptive way to add interactive transactions on Netlify/Vercel-style ephemeral compute while retaining Neon-specific transport. It does add a WebSocket handshake and request cleanup; benchmark it against HTTP batch/single-statement designs. On a persistent Node server, the WebSocket pool can live with the process, but a standard PostgreSQL TCP driver is more portable and is explicitly recommended by Drizzle for serverful environments. ([Drizzle + Neon connections](https://orm.drizzle.team/docs/connect-neon))

### Persistent PostgreSQL drivers (`pg` and Postgres.js)

Drizzle natively supports node-postgres and Postgres.js. Both provide interactive transactions and connection reuse. ([Drizzle PostgreSQL connections](https://orm.drizzle.team/docs/get-started-postgresql), [Drizzle transactions](https://orm.drizzle.team/docs/transactions))

On a long-running Node server, create one bounded process-level pool, reuse it across requests, and close it during graceful shutdown. node-postgres documents that establishing a new connection costs a handshake and that PostgreSQL has a finite client limit; a pool avoids paying that cost per query. Every transaction must use one acquired client, never independent `pool.query` calls. ([node-postgres pooling](https://node-postgres.com/features/pooling), [node-postgres transactions](https://node-postgres.com/features/transactions))

Postgres.js lazily opens up to ten connections by default and reserves one connection for `sql.begin(...)`; its default prepared statements and pool size must be checked against the selected pooler. ([Postgres.js README](https://github.com/porsager/postgres#the-connection-pool))

On autoscaled functions, every warm instance can own a separate process-local pool. Defaults multiply quickly, so set a small maximum and use Neon PgBouncer when many instances may coexist—or avoid TCP/WebSockets and use Neon HTTP.

## Pooling layers

### Neon PgBouncer

A Neon pooled URL adds `-pooler` to the hostname. Neon PgBouncer accepts up to 10,000 client connections and multiplexes them over a smaller number of PostgreSQL connections. It runs in **transaction mode**: one backend connection is held for a transaction, then returned. The 10,000 figure is not 10,000 simultaneously executing database transactions; excess work queues behind the finite backend pool. ([Neon connection pooling](https://neon.com/docs/connect/connection-pooling))

Interactive transactions work because their statements remain on one backend connection until commit/rollback. Session state does not persist between transactions. Neon lists unsupported session features including session-level `SET`/`RESET`, `LISTEN`, holdable cursors, SQL `PREPARE`/`DEALLOCATE`, certain temporary-table modes, `LOAD`, and session advisory locks. Protocol-level prepared statements are supported by Neon's current PgBouncer configuration. Use the direct URL for migrations, tools, `LISTEN/NOTIFY`, and any required session feature. ([Neon pooling limitations](https://neon.com/docs/connect/connection-pooling#connection-pooling-in-transaction-mode))

Neon PgBouncer is useful when many ephemeral app instances or app-side pools would otherwise exceed PostgreSQL connection limits. It is not a reason to make pools large: a small application pool feeding PgBouncer retains backpressure and consumes fewer client connections.

### Cloudflare Hyperdrive

Hyperdrive is a Workers-only connection accelerator, transaction-mode pooler, and optional query cache. A Worker creates a `pg` Client or Postgres.js client **inside each handler** using the Hyperdrive binding. Hyperdrive retains and shares the underlying connections; a driver pool in global Worker scope becomes stale and is explicitly discouraged. ([Hyperdrive lifecycle](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/))

For Neon, Cloudflare's current provider guide says to give Hyperdrive an **unpooled/direct Neon URL** and connect through `pg` or Postgres.js rather than the Neon serverless driver. Layering Hyperdrive over the Neon `-pooler` URL is redundant double transaction pooling and removes more session guarantees without adding application-facing capacity. ([Hyperdrive + Neon](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/))

Drizzle is supported through `drizzle-orm/node-postgres` with a per-request Client. Migrations continue to use a separate direct `DATABASE_URL`, not the runtime Hyperdrive binding. ([Hyperdrive + Drizzle](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/))

Hyperdrive query caching must be off for authentication, sessions, authorization, mutable board reads, and reads immediately following writes. Cloudflare recommends a cache-disabled binding for fresh reads and allows a second binding only for deliberately stale-tolerant reads. Start with caching disabled everywhere; adding cache invalidation complexity before measurements would violate the minimum-sufficient principle. ([Hyperdrive FAQ](https://developers.cloudflare.com/hyperdrive/reference/faq/#can-i-use-hyperdrive-if-some-reads-need-read-after-write-consistency))

Hyperdrive's free quota counts every SQL statement, including cached queries and writes, against 100,000/day. A multi-statement transaction consumes multiple query units even though it uses one transaction. ([Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/))

## When pooling is needed, redundant, or harmful

### Needed

- A persistent Node service making frequent queries: a small app-side `pg`/Postgres.js pool amortizes connection handshakes.
- Many short-lived function instances using PostgreSQL/WebSocket connections: Neon PgBouncer prevents client-connection storms.
- Cloudflare Workers using ordinary PostgreSQL drivers: Hyperdrive shares origin connections and avoids the full per-request remote connection setup.

### Redundant

- Neon HTTP plus an application pool: HTTP exposes no reusable PostgreSQL session for an app pool to manage.
- A request-scoped Neon WebSocket `Pool` used for one query: the Neon docs explicitly note that this does not exercise pooling; use Client or HTTP unless the API convenience is worth it.
- Hyperdrive pointing at Neon's pooled endpoint: current Cloudflare guidance calls for the direct endpoint because Hyperdrive is already the pooler.
- Large driver pools in front of PgBouncer: they increase client connections and waiting without increasing PostgreSQL execution capacity.

### Harmful

- A global database Client/Pool in a normal Cloudflare Worker: I/O objects cannot safely cross request contexts and become stale.
- Any unbounded or default-sized pool multiplied across autoscaled instances: it can exhaust Neon connections and hides overload until timeout queues form.
- Transaction-mode pooling when code needs `LISTEN/NOTIFY`, session advisory locks, durable `SET` state, or migration-tool session behavior.
- Long transactions: both Neon PgBouncer and Hyperdrive pin one scarce backend connection until completion. Keep external email/API calls and CPU work outside the transaction.
- Hyperdrive caching on security- or freshness-sensitive reads: it can serve stale authorization or post-mutation state.

## Decision-ready recommendation

1. **Do not change the database transport yet.** Inventory the actual atomicity requirements first. Use database constraints, conditional statements, CTEs, and current `db.batch` for fixed groups.
2. **Run a Cloudflare Workers and a Netlify production-build smoke test.** Cloudflare leads on free quota and reactivity; Netlify is the lower-concept-count fallback. Keep Railway as the control result for a persistent Node server.
3. **Place the test runtime near the existing Neon region.** If the project is not already in Frankfurt, record its actual region rather than assuming it. Measure hot and cold workflow latency.
4. **Only add an interactive transport when a named workflow proves the need.** For Cloudflare, test Hyperdrive + `pg` + Drizzle with a direct Neon origin and caching off. For a persistent Railway deployment, test a small `pg`/Postgres.js pool, choosing direct or Neon-pooled URL from measured concurrency and session-feature needs. For Netlify/Vercel, compare request-scoped Neon WebSockets with `pg` through the Neon pooled endpoint.
5. **Use one runtime database abstraction.** Avoid permanently mixing HTTP and transaction-capable Drizzle clients unless measurements show a material win that outweighs dual semantics and test burden.
6. **Keep reactivity separate from transaction choice.** PostgreSQL connection pooling does not deliver cross-tab updates. Validate Cloudflare Durable Object fan-out if Cloudflare wins; validate an explicit broker before multi-replica Railway; expect a separate realtime component on Netlify/Vercel.

## Required bakeoff evidence

The architecture ticket should require the following before choosing a host or transport:

- successful production build and deployment with no Node/runtime polyfill surprises;
- Better Auth sign-up, verification, login, cookie refresh, logout, and reset-password smoke tests;
- per-User isolation tests on every server operation;
- failure injection proving rollback for each workflow claimed to be atomic;
- hot/cold p50/p95 latency and SQL round-trip counts for board load, create/edit/move/delete Todo, and lifecycle reconciliation;
- database connection counts and pool wait time under concurrent requests;
- two-tab/two-device update propagation within the ~1-second target;
- free-tier consumption projected from measured requests, SQL statements, compute time, bandwidth, log volume, and deploy frequency;
- fresh-read tests after writes, especially if any cache is enabled;
- a direct migration connection kept separate from runtime pooled credentials.

## Primary sources

- [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [Drizzle 0.45.2 Neon HTTP session implementation](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/neon-http/session.ts)
- [Neon serverless driver 1.1.0 README](https://github.com/neondatabase/serverless/blob/v1.1.0/README.md)
- [Drizzle Neon connection guide](https://orm.drizzle.team/docs/connect-neon)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Cloudflare Hyperdrive concepts and provider guidance](https://developers.cloudflare.com/hyperdrive/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Netlify credit-based pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- [Railway pricing](https://docs.railway.com/pricing)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)

