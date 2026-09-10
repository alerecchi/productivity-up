# Backend telemetry options for Productivity Up

Research date: 2026-09-08

## Decision summary

Start the performance baseline with Cloudflare Workers' native logs, traces, and built-in metrics. It is the only option here that needs no new application dependency, and it already knows about Worker invocations, CPU and wall time, response size, deployment version, region, outbound `fetch` calls, and failures.

Keep the application telemetry contract vendor-neutral. Emit one structured outcome record per operation, use stable operation names, and record the same fields in the manual benchmark result. This matters more than the first dashboard.

If one external operational service is added later, Sentry is the stronger fit. Cloudflare can export both logs and traces to Sentry, and Sentry covers error grouping, tracing, logs, custom metrics, dashboards, and alerts. PostHog is a reasonable future choice for product analytics and correlated logs, but Cloudflare currently exports only logs to it, not traces. PostHog should not replace the operational trace source for this baseline.

## Comparison

| Capability | Cloudflare Workers Observability | Sentry | PostHog |
| --- | --- | --- | --- |
| Cloudflare Workers support | Native, with automatic Worker instrumentation | Official `@sentry/cloudflare` SDK; Cloudflare also has a direct OTLP logs and traces destination | Cloudflare has a direct OTLP logs destination; trace export is not supported |
| Structured logs | Invocation logs plus structured `console.*` data, searchable in Workers Logs | Structured logs can be sent through the SDK or Cloudflare OTLP export | OTLP-native log store with searchable attributes |
| Errors | Captures errors and uncaught exceptions, but does not provide Sentry-style issue grouping | Core strength: captured exceptions, stack traces, releases, issue grouping, alerts | Error Tracking captures backend and frontend exceptions and groups them into issues |
| Tracing and performance | Automatic handler, outbound `fetch`, and binding spans; custom spans are available | Distributed tracing and performance views; Cloudflare exports traces directly | No Cloudflare trace destination at present. Product analytics events and logs can still carry timing fields |
| Custom metrics | Workers Analytics Engine supports application-specific performance and business measures; built-in Worker metrics cover platform health | Counters, gauges, and distributions through Application Metrics | Log-based metrics exist, but Application Metrics is still marked alpha. Log-derived value metrics do not yet have p95 or p99 |
| Product analytics | Analytics Engine can store custom events, but it is not a product analytics suite | Not a product analytics suite | Core strength: events, funnels, retention, user paths, feature flags, and replay correlation |
| Privacy and redaction | No automatic application-data redaction promise was found. Invocation and trace data can include URLs and query strings, so the application must control sensitive fields | SDK hooks and server-side data scrubbing can remove sensitive fields before storage; IP storage can be disabled | Log PII scrubbing is opt-in and explicitly best-effort. PostHog says the primary control is to avoid sending sensitive data |
| Credible as the only backend operations tool | Yes for the first baseline, provided short retention is handled | Yes, and stronger for longer-lived error triage and alerts | Not for this use case without substantial custom wide-event logging and a separate trace source |

## What the native Cloudflare option gives us

Workers Logs stores invocation logs, custom logs, errors, and uncaught exceptions. Structured JSON fields are indexed for filtering. The Query Builder can compute counts, averages, and percentiles including p75, p95, and p99 over numeric log fields. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) [Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/)

Workers tracing automatically records handler lifecycles, outbound `fetch` calls, and Cloudflare binding calls. Root spans include invocation ID, deployment version, region, outcome, CPU time, and wall time. HTTP spans include status and request and response sizes. Custom spans can cover application operations. A Neon query sent over HTTP should therefore appear as an outbound request, but per-query count and database-only duration still need application instrumentation. That last sentence is an inference from the documented fetch instrumentation and this repository's `neon-http` adapter. [Workers tracing](https://developers.cloudflare.com/workers/observability/traces/) [Worker span attributes](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/) [Custom spans](https://developers.cloudflare.com/workers/observability/traces/custom-spans/)

The free Workers plan includes 200,000 log events per day with three-day retention. Paid Workers includes 20 million events per month and seven-day retention. Built-in Worker metrics can be inspected for up to three months, which is useful for coarse trend checks. Tracing is free during its initial beta, but Cloudflare says spans will share the observability event quota and pricing from 2026-10-01. [Workers Logs pricing and limits](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) [Worker metrics retention](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/) [Tracing limits and pricing](https://developers.cloudflare.com/workers/observability/traces/)

Workers Analytics Engine is the native option for long-lived custom measurements. The free allowance is 100,000 writes and 10,000 read queries per day. Cloudflare currently says billing is not active. [Analytics Engine pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) [Analytics Engine limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)

The main weakness is retention. A repeatable baseline cannot live only in a three-day or seven-day dashboard. Each manual run must save a small versioned result outside the telemetry vendor, with the commit or deployment version and test conditions attached.

## When Sentry earns a place

Cloudflare documents direct OTLP export of both Worker logs and traces to Sentry. Sentry then adds code-level error and performance investigation, dashboards, and alerts. Cloudflare's OTLP export requires Workers Paid. It is unavailable on Workers Free. [Cloudflare export to Sentry](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/sentry/) [Cloudflare OTLP export limits](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)

Sentry also maintains an official Cloudflare SDK. Its Worker wrapper captures exceptions and traces, and the public API includes structured logging, metrics, and custom spans. Using it would add a dependency and needs separate approval under this repository's rules. [Official Sentry Cloudflare SDK](https://github.com/getsentry/sentry-javascript/tree/develop/packages/cloudflare)

The free Sentry Developer plan is limited to one user. Its published quotas include 5,000 errors, 5 GB of logs, 5 GB of Application Metrics, and 5 million spans, with a 30-day lookback. [Sentry pricing](https://sentry.io/pricing/)

Sentry supports data scrubbing before events are stored, additional sensitive-field rules, and disabling IP storage. Those are safety nets. The application should still redact before capture. [Sentry project privacy controls](https://docs.sentry.io/api/projects/update-a-project/)

## Where PostHog fits

PostHog now has an OTLP-native log store, error tracking, log-based metrics, and its established product analytics. This makes it more relevant to backend debugging than its old "analytics only" reputation suggests. Logs can correlate with people, events, errors, and session replay. [PostHog Logs](https://posthog.com/docs/logs) [PostHog Error Tracking](https://posthog.com/docs/error-tracking/) [PostHog event capture](https://posthog.com/docs/product-analytics/capture-events)

The hard limitation for this baseline is trace ingestion from Cloudflare. Cloudflare's official destination table lists PostHog trace export as unsupported, while Sentry accepts both logs and traces. [Cloudflare export destinations](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/) [Cloudflare export to PostHog](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/posthog/)

PostHog's log-based metrics can count matching logs or aggregate numeric attributes such as `duration_ms`. They can feed dashboards and alerts, but the documentation says Application Metrics is alpha and log-derived value metrics do not yet calculate p95 or p99. [PostHog log-based metrics](https://posthog.com/docs/logs/metrics)

The current free allowances are 10 GB of logs per month, 100,000 exceptions per month, and one million product analytics events per month. Default log retention is 14 days. [PostHog pricing](https://posthog.com/pricing) [PostHog Logs pricing](https://posthog.com/docs/logs/pricing) [PostHog Error Tracking pricing](https://posthog.com/docs/error-tracking/pricing)

PostHog can scrub common PII patterns and sensitive attribute keys at log ingestion. Its own documentation calls that process best-effort and recommends filtering at the source. [PostHog log PII scrubbing](https://posthog.com/docs/logs/pii-scrubbing)

## Minimum vendor-neutral instrumentation

Do this before selecting Sentry or PostHog:

1. Define one versioned structured outcome record for every named backend operation. Do not log Todo text, request bodies, cookies, credentials, tokens, email addresses, raw SQL values, or complete URLs.
2. Include a request or trace ID, operation name, deployment version, safe outcome, HTTP status, total duration, database duration, database remote round trips, third-party duration by safe service name, response bytes, Worker region when available, cold-start signal when available, and conflict or rate-limit flags.
3. Use stable low-cardinality operation names such as `board.load` and `todo.move`. Keep request IDs and pseudonymous user keys out of metric dimensions.
4. Emit one rich completion record rather than many step-by-step lines. Attach error class and a safe error code, not the raw exception payload, when the exception might contain user data.
5. Put all redaction and field allow-listing in one module that callers cannot bypass. Test it with representative secrets and Todo content.
6. Keep the schema compatible with OpenTelemetry concepts: resource identity, trace and span IDs, severity, event name, and typed attributes. OTLP then remains an export choice rather than an application model. [OpenTelemetry Logs data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) [HTTP span conventions](https://opentelemetry.io/docs/specs/semconv/http/http-spans/) [Database span conventions](https://opentelemetry.io/docs/specs/semconv/db/database-spans/)

## Baseline shape

The manual baseline should be a script, not a hand-clicking exercise. Run the same scenarios against the same seeded data shape, warm-up policy, region, and deployment. Record per operation:

- sample count and failure count;
- p50, p75, p95, and maximum end-to-end duration;
- database round trips and database duration;
- third-party calls and duration;
- response bytes;
- cold versus warm runs;
- deployment version, date, Worker plan, Worker region, Neon region, dataset version, and benchmark client location.

Start with board load, create Todo, update Todo, move Todo without rebalance, move Todo with rebalance, and migration confirmation at small and large data sizes. Save the raw per-run result plus a short comparison against the accepted baseline. The dashboard helps explain a regression; the saved benchmark result decides whether one happened.

Do not set a hard latency gate from the first run. Take at least three runs on different days, inspect variance by cold start and region, then select budgets. Until CI exists, run the script before a release and after changes to queries, database access, authentication middleware, payload shape, or caching.
