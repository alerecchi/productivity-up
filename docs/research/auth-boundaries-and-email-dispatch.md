# Auth boundaries and email dispatch on Cloudflare

Research date: 2026-09-08

Current product decisions updated: 2026-10-03

## Decision summary

Configure Better Auth explicitly for Cloudflare rather than accepting runtime-dependent defaults: use shared rate-limit storage, trust only Cloudflare's `cf-connecting-ip`, keep the session cookie cache short, bypass it for sensitive operations, and revoke other sessions after a password reset.

Do not let a GET server function reconcile board lifecycle state. TanStack Start treats server-function GET as read-only even when its automatic same-origin checks are active. Split lazy reconciliation into an idempotent POST followed by a pure GET, or make the whole load operation POST.

Verification and password-reset mail use direct Resend delivery through `waitUntil()`, sanitized send records, and user-requested resend. Delivery is best-effort. The current product does not require durable email processing or application response padding.

Initial board state belongs to the first verified board visit. Reuse the Lifecycle Reconciliation POST and show a dedicated creation state with retry; registration only establishes identity.

## Better Auth rate limiting on Workers

Better Auth rate limits client-initiated auth requests, but not server-side calls through `auth.api`. It is enabled by default only in production and has a stricter built-in rule for `/sign-in/email`. The documented storage choices are memory, database, and secondary storage; memory is the default. [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit)

An in-memory counter belongs to one Worker isolate, so it cannot enforce a global limit across a distributed serverless deployment. This is an architectural inference from Better Auth's memory storage model and the Workers runtime. Use `database` or `secondary-storage` for production. The initial choice is between reusing Neon, which is simpler but adds database work to auth requests, and provisioning a lower-latency shared store.

Set route rules explicitly for sign-up, email sign-in, password-reset request, password reset, and verification-email resend. The exact windows and thresholds are abuse-policy choices; the important standard is that they are deliberate, shared across isolates, and tested. Internal code that calls `auth.api` needs its own abuse control if it is exposed indirectly.

Better Auth checks `x-forwarded-for` by default but documents `cf-connecting-ip` for Cloudflare. It does not trust arbitrary comma-separated forwarded chains. Configure `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`, keep the origin reachable only through Cloudflare, and do not fall back to a client-supplied forwarding header. [Better Auth connecting-IP guidance](https://better-auth.com/docs/concepts/rate-limit)

## Session cache and revocation

Better Auth's cookie cache avoids a database lookup by storing signed session data in a separate short-lived cookie. A revoked session on another device can remain usable until that cache expires. Better Auth recommends disabling the cache, shortening `maxAge`, or using `disableCookieCache: true` when immediate validation matters. [Better Auth session caching](https://better-auth.com/docs/concepts/session-management)

The standard agreed for this project should therefore be:

- a five-minute cookie-cache maximum for ordinary product reads;
- a database-backed session check for password changes, account deletion, security settings, and other sensitive operations;
- `emailAndPassword.revokeSessionsOnPasswordReset: true`, because Better Auth otherwise leaves other sessions active after a reset. [Better Auth email and password](https://better-auth.com/docs/authentication/email-password)

Better Auth also documents that `GET /get-session` performs database writes when refreshing a session. `session.deferSessionRefresh: true` keeps that GET read-only and lets the client issue a POST when refresh is required. This option fits the project's strict GET semantics. [Better Auth deferred session refresh](https://better-auth.com/docs/concepts/session-management)

## Verification and reset access

Better Auth supplies the verification and password-reset flows: verification can be sent on sign-up, on sign-in for an unverified account, or by an explicit resend call; clicking the verification URL verifies the address and redirects to the supplied callback. [Better Auth email verification](https://better-auth.com/docs/concepts/email)

The application boundary should classify the flows as follows:

- public and unauthenticated: sign-up, sign-in, password-reset request, reset using a valid token, verification using a valid token, and verification resend by email address;
- authenticated but unverified, when such a session exists: session/status, sign-out, and recovery paths;
- authenticated and verified: board and Todo operations.

Public authentication requests require shared rate limits and generic response content for existing and missing addresses. Response timing follows Better Auth without application-level equalization. Whether verification should automatically create a session is a product choice; Better Auth's `autoSignInAfterVerification` supports it. The current repository enables automatic sign-in and sends verification on both sign-up and unverified sign-in.

## GET mutations and same-origin protection

TanStack Start server functions default to GET. Its documentation says GET must not mutate state; POST, PUT, or DELETE should be used for mutation. [TanStack Start server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) [TanStack Start authentication primitives](https://tanstack.com/start/latest/docs/framework/react/guide/authentication-server-primitives#csrf-for-non-get-rpcs)

Start's CSRF middleware proves browser RPC requests are same-origin using `Sec-Fetch-Site`, `Origin`, or `Referer`. It is installed automatically when there is no custom `src/start.ts`; a custom start file must add `createCsrfMiddleware()` explicitly. Requests missing all three headers are rejected by default. [TanStack Start same-origin requests](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions#same-origin-requests) [TanStack Start CSRF middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware#csrf-middleware)

These checks do not make a mutating GET safe. SameSite cookies also do not replace origin checks for non-GET RPCs on sibling subdomains. Better Auth's CSRF and origin checks should remain enabled as a separate boundary. [Better Auth security](https://better-auth.com/docs/1.6/reference/security)

In the current repository, `getBoard` uses the default GET method but calls lifecycle-loading code that may create, archive, or transition buckets. The recommended seam is an idempotent `POST reconcileBoardLifecycle`, followed by a pure GET for board data. A single POST that reconciles and returns the board is also correct but gives up normal read semantics and caching. A scheduled reconciliation job is a third product option if lifecycle transitions must happen without a board visit.

## Best-effort email dispatch

Use direct provider sending through Cloudflare `waitUntil()`. The callback handles failures and emits a sanitized outcome; it does not wait for provider completion when request context is available. Outside a Worker request, the local path awaits the send. [Better Auth email verification](https://better-auth.com/docs/concepts/email) [Better Auth email and password](https://better-auth.com/docs/authentication/email-password)

Cloudflare requires asynchronous work to be awaited or registered with `ctx.waitUntil()`. Background work can be canceled when its execution lifetime expires. The product accepts this delivery limitation and provides user-requested resend with a 60-second UI cooldown and authoritative server limits. A provider failure does not change the public accepted response. [Workers execution context](https://developers.cloudflare.com/workers/runtime-apis/context/)

## Low-noise logging and redaction

Workers logs show request URLs and tracing exposes full URLs and query strings. Verification and reset links therefore make query strings sensitive telemetry. Enable `observability.logs.redact_query_string` for logs and traces. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) [Worker span attributes](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/) [Workers script observability settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/)

Cloudflare heuristically redacts sensitive Tail request headers and URL material, but `console.*` arguments and exception messages remain application-controlled. Treat platform redaction as defense in depth. Emit allow-listed fields such as event name, safe outcome, duration, provider, retry count, and stable error code. Never log cookies, authorization headers, email addresses, token-bearing URLs, request bodies, email contents, or raw provider responses. [Tail handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/)

Keep API keys and auth tokens in Workers secrets, not plaintext variables, and never commit local `.dev.vars` or `.env` files. [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

The email sender records only allow-listed outcomes. Better Auth logging must also discard raw messages and arguments, and auth forms must not log their responses.

## Current product decisions

1. Shared rate-limit storage: Neon, with atomic counters across Worker isolates.
2. Per-route limits and `Retry-After` remain the authoritative abuse controls.
3. Successful verification signs in automatically.
4. Board entry reads through GET, then uses the Lifecycle Reconciliation POST for initial creation or current-period changes.
5. Email delivery: best-effort `waitUntil()`, safe failure records, and manual resend recovery.
