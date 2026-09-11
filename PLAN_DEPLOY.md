# Deployment ticket completion plan

## Goal

Complete the Cloudflare deployment slice with two release commands:

- `pnpm deploy:staging` deploys the pinned `main@origin` revision to staging, migrates the staging database, and runs the authenticated read-only smoke test.
- `pnpm deploy:production` promotes the same revision currently live on staging, or deploys `main@origin` directly after explicit confirmation or `--allow-unstaged`.

Both Workers use Cloudflare Hyperdrive for PostgreSQL connection pooling. Drizzle migrations connect directly to Neon. Production serves `https://productivity-up.com` and `https://www.productivity-up.com`, with the apex domain as the canonical application and Better Auth URL.

## Fixed decisions

- Development, staging, and production use separate Neon branches or databases.
- Cloudflare has only staging and production Hyperdrive configurations and Workers. Local development uses `DATABASE_URL` from the existing ignored `.env.local` file to connect directly to the Neon development branch.
- Hyperdrive receives each deployed environment's direct Neon connection URL as its origin. Neon pooler URLs are not used.
- Both Workers receive a binding named `HYPERDRIVE`. They do not receive `DATABASE_URL`.
- Disable Hyperdrive query caching. This application requires fresh reads after writes; Hyperdrive is being used for connection pooling.
- Drizzle migrations use the environment's direct Neon URL outside the Worker runtime.
- Only staging runs a smoke test. A post-deployment smoke-test failure exits nonzero and reports that staging remains deployed.
- Every deployment fetches and pins `main@origin`, then builds and deploys from a temporary jj workspace at that revision.
- Never place credentials, connection strings, or smoke-test passwords in tracked files or command output.

The database credentials previously shared in chat have been rotated.

## Current state

The working-copy change already contains:

- Cloudflare Vite and Wrangler setup.
- Staging and production Wrangler environments and production custom-domain routes.
- Initial Drizzle migration files.
- Deployment scripts that fetch and pin `main@origin` using jj.
- Staging revision verification before production deployment.
- The explicit direct-to-production override.
- A staging-only authenticated board smoke test.
- Deployment metadata parsing tests and deployment documentation.

Runtime database access now uses request-scoped PostgreSQL connections: deployed Workers read `HYPERDRIVE.connectionString`, while local development falls back to `DATABASE_URL` from `.env.local`. Better Auth and server functions share the request-scoped Drizzle client, and each request closes its client when complete.

## 1. [DONE] Record the rotated Neon credentials

Credential rotation is complete. Obtain one current direct connection URL for each Neon environment.

1. Put the staging and production direct URLs in the ignored `.env.deploy.local` file as:

   ```dotenv
   STAGING_DATABASE_URL_DIRECT=...
   PRODUCTION_DATABASE_URL_DIRECT=...
   ```

2. Keep the development direct URL in the ignored `.env.local` file as described in the local development section.
3. Remove the old URLs from local ignored setup files if present.
4. Confirm all three URLs use the intended Neon branch or database and use non-pooler hosts.

Completion criterion: all three current direct URLs connect to their intended Neon environment without printing their values, and no old URL remains in a local setup file.

## 2. [DONE] Create the Hyperdrive configurations

Created Cloudflare resources:

- Staging, `productivity-up-staging-db`: `54f12cc46b24472ebd9e18c282ca2fa5`
- Production, `productivity-up-production-db`: `5cefb00a2fe4478a880ab163764e5f3b`

Use the logged-in Cloudflare account and the project-local Wrangler version.

1. Review existing configurations:

   ```sh
   pnpm exec wrangler hyperdrive list
   ```

2. Create `productivity-up-staging-db` from `STAGING_DATABASE_URL_DIRECT`.
3. Create `productivity-up-production-db` from `PRODUCTION_DATABASE_URL_DIRECT`.
4. Pass `--caching-disabled` to both creation commands.
5. Do not use `--update-config`; add the returned IDs to the correct Wrangler environments deliberately.
6. Record only the two Hyperdrive configuration IDs. The IDs are not secrets and belong in `wrangler.jsonc`.
7. Inspect both configurations with `wrangler hyperdrive get <id>` and confirm the database, host, caching setting, and environment are correct.

Wrangler validates the database connection when it creates a Hyperdrive configuration. Supply connection strings from the ignored environment file without echoing them or placing literal credentials in shell history.

Completion criterion: Cloudflare has one cache-disabled Hyperdrive configuration for staging and one for production, each targeting the correct Neon database, and both IDs are known.

## 3. [DONE] Bind each Worker to Hyperdrive

Update `wrangler.jsonc`:

1. Add a staging `hyperdrive` entry whose binding is `HYPERDRIVE` and whose ID is the staging configuration ID.
2. Add a production entry with the same binding name and the production configuration ID.
3. Remove `DATABASE_URL` from both `secrets.required` lists.
4. Keep observability enabled and keep the existing staging and production routing.
5. Regenerate `worker-configuration.d.ts` with `pnpm cf:typegen` instead of editing it by hand.

Completion criterion: generated types expose `HYPERDRIVE: Hyperdrive` in both environments and no longer require `DATABASE_URL`.

## 4. [DONE] Move runtime database access to Hyperdrive

Cloudflare's supported Drizzle path uses a PostgreSQL driver with `drizzle-orm/node-postgres` or `drizzle-orm/postgres-js`. The current `@neondatabase/serverless` HTTP query path cannot send queries through Hyperdrive.

1. Obtain approval before adding dependencies, as required by `AGENTS.md`.
2. Unless another driver is selected, add runtime dependency `pg` and development dependency `@types/pg`.
3. Add the selected driver to the `AGENTS.md` technology list with its role.
4. Replace `src/server/db/client.ts` with a request-scoped database factory that reads `env.HYPERDRIVE.connectionString` and creates the Drizzle client from the PostgreSQL driver.
5. Create and close the driver connection within the request lifecycle. Hyperdrive owns the underlying origin pool.
6. Convert the Better Auth singleton to a request-scoped factory because its Drizzle adapter also needs the request's database client.
7. Update the auth route, session helper, server functions, and database helpers to obtain the request-scoped client rather than importing a module-level `db` singleton.
8. Keep schema registration in the Drizzle client so relational queries and the Better Auth adapter retain the current schema contract.
9. Treat `DATABASE_URL` as an optional local-only value. Deployed environments require `HYPERDRIVE`; local development requires `DATABASE_URL`. Validate that the appropriate source exists at runtime.
10. Remove `@neondatabase/serverless` only if no remaining runtime or script uses it. The seed script currently uses it, so either retain it for that script or migrate the script separately without expanding deployment behavior.

Completion criterion: deployed Worker database and Better Auth operations use `HYPERDRIVE.connectionString`, local development uses `DATABASE_URL`, and no database client survives across requests.

## 5. [DONE] Configure local development database access

Local development should use the existing Neon development branch. It must not connect to staging or production.

1. Keep the development branch's direct Neon URL in the existing ignored `.env.local` file:

   ```dotenv
   DATABASE_URL=...
   ```

2. Keep `.env.local` ignored. It already contains the other server-only and `VITE_*` values used by local development.
3. Do not create `.dev.vars`. When that file exists, the Cloudflare Vite plugin excludes values from `.env` files. Without it, `vite dev` loads `.env.local` automatically.
4. Keep `pnpm dev` as the local Vite command. It must not select `CLOUDFLARE_ENV=staging` or `production`, and it needs no extra environment-file configuration.
5. Make the database factory use `DATABASE_URL` when no `HYPERDRIVE` binding exists. Use the same PostgreSQL driver and Drizzle schema in both paths.
6. Add a safe development migration command or documented invocation that passes the local `DATABASE_URL` to Drizzle as `DATABASE_URL_DIRECT`. Keep this separate from both deployment commands.
7. Run `pnpm dev` and perform a read against the development branch.
8. Perform a reversible test write, verify it appears only in development, and remove the test record through the application.
9. Local database access has no Hyperdrive binding, pooling, query caching, Worker deployment, or Cloudflare database resource. The Cloudflare Vite plugin still runs the server code in a local Workers-compatible runtime because Workers are the deployment target.

Completion criterion: `pnpm dev` automatically reads `DATABASE_URL` from `.env.local`, reads and writes only the Neon development branch, and Cloudflare contains no development Worker or Hyperdrive configuration.

## 6. [DONE] Keep migrations on the direct connection

1. Keep `drizzle.config.ts` reading `DATABASE_URL_DIRECT`.
2. Keep the deployment script mapping the selected environment's `*_DATABASE_URL_DIRECT` value into the migration subprocess only.
3. Ensure Worker builds and Wrangler deploy subprocesses do not inherit either direct connection URL.
4. Keep migration-before-deployment ordering.
5. Keep migrations compatible with the previously deployed Worker. Use expand, application change, then contract for future breaking schema changes.

Completion criterion: a migration dry run or controlled test uses the intended direct database, while build and deployment environments contain neither direct URL.

## 7. [DONE] Configure environment values and Worker secrets

Use distinct values for staging and production.

Worker secrets:

- `BETTER_AUTH_SECRET`, at least 32 characters and unique per environment.
- `RESEND_API_KEY`, scoped to the intended environment where possible.

Non-secret Worker variables:

- `BETTER_AUTH_URL`.
- `EMAIL_FROM`.
- `APP_NAME`.

Build inputs:

- `VITE_APP_NAME`.
- `VITE_SERVER_URL`.

Environment URLs:

- Staging: `https://productivity-up-staging.ale-recchi.workers.dev`.
- Production canonical URL: `https://productivity-up.com`.
- Production also routes `https://www.productivity-up.com`.

Before applying secrets, inspect the installed Wrangler commands and choose the first-deployment secret workflow that does not print secret values. Treat secret changes as Worker version changes. Do not mix resource provisioning with a normal application release report.

Completion criterion: each Worker environment has only its own values, both Better Auth secrets differ, and no secret is present in tracked files or shell output.

Cloudflare setup is complete. The Worker service records were created without deployments through Cloudflare's Create Worker API. Wrangler uploaded draft versions with each environment's Resend key and generated Better Auth secret. The Better Auth secrets use distinct environment prefixes and independent random values, and are retained in the ignored `.env.cloudflare-setup.local` file for future setup and rotation. Neither Worker has a deployment or receives traffic.

## 8. [DONE] Finish email configuration

1. Verify `productivity-up.com` in Resend.
2. Complete the required DNS records in Cloudflare DNS.
3. Choose environment-specific sender addresses under the verified domain.
4. Create or select the Resend API keys and configure them as Worker secrets.
5. Confirm Better Auth links use the matching environment URL.

Completion criterion: Resend reports the domain as verified and each environment can send authentication email with its configured sender.

Resend now reports `productivity-up.com` as verified in the Ireland region. Cloudflare DNS contains the required DKIM record and the `send` subdomain's SPF and MX records. Resend verified all three records. Delivery tests using the staging key with `noreply-staging@productivity-up.com` and the production key with `noreply@productivity-up.com` were both delivered. The Workers remain undeployed.

## 9. [DONE] Prepare the staging smoke-test account

1. Add `STAGING_SMOKE_TEST_EMAIL` and `STAGING_SMOKE_TEST_PASSWORD` to `.env.deploy.local`.
2. Create an idempotent, non-destructive setup path for this account. Do not use the current destructive reset behavior in `scripts/seed.ts`.
3. Ensure the account has a verified email and a readable board.
4. Keep the smoke test read-only. It signs in and loads `/board` without creating, editing, or deleting application data.

Completion criterion: rerunning account setup preserves existing staging data, and the credentials can authenticate without manual email verification.

The ignored `.env.deploy.local` file contains `smoke-test@productivity-up.com` and a generated password. `pnpm db:setup-staging-smoke-account` creates or refreshes the verified credential user and ensures its five active Buckets exist without deleting staging data. Two consecutive runs left one credential account and five Buckets for the user. The stored password verifies against Better Auth's hash, and the account uses Better Auth's required `credential` provider and user ID mapping. The first staging release in step 12 will exercise the full HTTP sign-in and `/board` request.

## 10. [DONE] Correct documentation and deployment sanitization

1. Update `docs/deployment.md` to describe Hyperdrive rather than a pooled `DATABASE_URL` secret.
2. Remove pooled Neon URL setup instructions and references.
3. Update the deployment script's sanitized-variable list so it reflects the final direct migration inputs and runtime configuration.
4. Document that Hyperdrive resource IDs are committed, while origin credentials remain in Cloudflare and local ignored files.
5. Preserve the staging-only smoke-test behavior and direct-production override documentation.

Completion criterion: the documentation, Wrangler configuration, generated types, scripts, and application code describe one consistent environment model.

The deployment guide now documents the final connection model: local development uses its direct Neon URL, migrations receive only the selected environment's direct URL, and deployed Workers use their committed Hyperdrive binding IDs. Cloudflare retains the Hyperdrive origin credentials. The deployment runner removes direct database URLs, smoke-test credentials, Cloudflare setup credentials, local application values, and `STAGING_PUBLIC_URL` from child environments, then adds back only the selected migration URL and public build values where required. Staging remains the only environment with an automated smoke test, and production retains the explicit `--allow-unstaged` override.

## 11. [DONE] Validate locally without a real deployment

Run all checks from the current deployment change:

1. Focused deployment metadata and argument tests.
2. Tests for any new request-scoped database or auth factory seams that can be tested without a live database.
3. Full test suite.
4. TypeScript build for staging and production.
5. ESLint and formatting checks.
6. `wrangler deploy --dry-run` for staging and production using their built environments.
7. Confirm generated bundles contain the `HYPERDRIVE` binding and do not require `DATABASE_URL`.
8. Inspect `jj status` and `jj diff` to verify that ignored credentials and unrelated changes are absent.

Completion criterion: every check passes, both Wrangler dry runs resolve the intended Hyperdrive binding, and no real Worker deployment or database migration has occurred.

Validation found that the generated Worker configuration lacked the `nodejs_compat` compatibility flag required by the `pg` runtime driver. The flag has been added to `wrangler.jsonc`. The release command now also relies only on the Vite plugin's generated, environment-specific configuration instead of passing a redundant `--env` option to Wrangler.

The focused suite passed 23 tests, and the full suite passed 191 tests across 17 files. Both staging and production builds passed with TypeScript checking. Both Wrangler dry runs used `dist/server/wrangler.json`, resolved the correct environment-specific Hyperdrive ID, included `nodejs_compat`, and had no `DATABASE_URL` binding or requirement. The full formatting and ESLint gate passed after formatting an existing Markdown table in `docs/research/backend-telemetry-options.md`. No migration, upload, or Worker deployment ran.

## 12. Perform the first staging release

This step requires explicit authorization because it migrates the staging database and deploys a live Worker.

1. Run `pnpm deploy:staging`.
2. Confirm the migration succeeds before deployment starts.
3. Confirm Wrangler sends all staging traffic to the new version.
4. Confirm the report includes the pinned source SHA, Cloudflare version ID, version tag, staging URL, migration result, and smoke-test result.
5. If the smoke test fails, keep the deployment live, report the failure clearly, and diagnose it before promotion.

Completion criterion: the expected `main@origin` SHA is live at the staging URL and the authenticated board smoke test passes.

## 13. Verify production routing and release

1. Confirm the apex and `www` custom domains are active in the Cloudflare zone and attached to the production Worker configuration.
2. Run `pnpm deploy:production`.
3. Confirm the script identifies the version receiving 100 percent of staging traffic and matches its full source SHA against the pinned `main@origin` SHA.
4. If the SHAs differ, cancel by default. Use the interactive confirmation or `--allow-unstaged` only for an intentional direct production release.
5. Confirm production migrations finish before the Worker deploys.
6. Verify both production hostnames return the application and that authentication uses the apex canonical URL. Production does not run the automated smoke test.

Completion criterion: the intended SHA is live on both production hostnames, deployment metadata identifies that SHA, and no staging-only credentials or resources are bound to production.

## 14. Finish the repository change

1. Review the complete change against issue #83, using issue #82 only where #83 depends on its deployment context.
2. Confirm no unrelated feature work entered the change.
3. Describe the jj change accurately.
4. Move or publish the `main` bookmark only with explicit authorization. Deployment commands continue to deploy `main@origin`, regardless of the caller's checkout.

Completion criterion: the ticket's deployment slice is implemented, verified, documented, and ready for the requested jj publication workflow.

## References

- [Cloudflare Hyperdrive getting started](https://developers.cloudflare.com/hyperdrive/get-started/)
- [Cloudflare Hyperdrive with Drizzle ORM](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/)
- [Cloudflare Hyperdrive Wrangler commands](https://developers.cloudflare.com/hyperdrive/reference/wrangler-commands/)
- [Cloudflare Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)
- [Cloudflare Workers local environment variables](https://developers.cloudflare.com/workers/local-development/environment-variables/)
