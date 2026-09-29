# Cloudflare deployments

The deployment commands always fetch and deploy the pinned `main@origin` revision. They create a temporary jj workspace, install from the frozen lockfile, build, migrate, and deploy from that workspace. Local working-copy changes never enter a release.

The Cloudflare Vite plugin selects and flattens the Wrangler environment during the build through `CLOUDFLARE_ENV`. Wrangler then deploys the generated `dist/server/wrangler.json`; the deployment command does not select an environment again.

The custom Worker entrypoint validates the complete runtime configuration before it handles an HTTP request. Validation errors identify missing or invalid keys without including their values. The authenticated staging smoke test therefore proves that the deployed Worker received every required binding before it signs in and loads the board.

## Local validation and deployment

Run `pnpm validate` before backend work is considered ready. It checks formatting and lint rules, runs tests, typechecks the project, and builds the production Worker bundle. It does not deploy a Worker, run a migration, access a deployment database, or run the staging smoke test.

A clean checkout needs Node.js 24 or newer, the pnpm version pinned in `package.json`, and dependencies installed with `pnpm install --frozen-lockfile`. Local validation does not need Cloudflare credentials, runtime secret values, `.env.deploy.local`, or any of the operator-only variables described below. The production bundle can warn that the secrets declared in `wrangler.jsonc` are missing; Wrangler enforces those secrets when a version is uploaded or deployed.

## Cloudflare setup

Create separate runtime secrets for `productivity-up-staging` and `productivity-up-production`:

- `BETTER_AUTH_SECRET` is unique to the environment.
- `RESEND_API_KEY` is scoped to the environment.

Wrangler tracks the non-secret `BETTER_AUTH_URL`, `EMAIL_FROM`, and `APP_NAME` values separately for each environment. Runtime database access uses the environment's `HYPERDRIVE` binding, not a Worker secret.

Each environment also has an isolated `USER_REALTIME` Durable Object binding for realtime.

### Authentication email

Verification and password-reset email is sent directly through Resend with the environment's `RESEND_API_KEY`. The Worker schedules each send with `waitUntil`, so the send finishes after the response. Delivery is best-effort. A failed send is not stored or retried, and the public response stays the same generic acceptance. Users recover by requesting another email from the verification waiting screen or the password-reset confirmation screen. The server's per-IP limits (three requests per 15 minutes) bound those requests, and the 60-second UI cooldown only gives feedback.

Every send emits one `auth_email.send` record with the email kind, request ID, deployment version, outcome (`sent` or `failed`), duration, the safe provider error code of a failure, and the Resend message ID of a success. Records never contain addresses, names, links, tokens, email bodies, or raw provider errors. Failures are logged at error level. To find them in Workers Logs, filter the Worker's events on `operation = auth_email.send` and `outcome = failed`.

Earlier releases delivered this email through Cloudflare Queues. Once a release without Queues is live in an environment, delete that environment's leftover Queues:

```sh
pnpm exec wrangler queues delete productivity-up-staging-auth-email
pnpm exec wrangler queues delete productivity-up-staging-auth-email-dlq
pnpm exec wrangler queues delete productivity-up-production-auth-email
pnpm exec wrangler queues delete productivity-up-production-auth-email-dlq
```

Wrangler provisions the SQLite-backed `UserRealtimeDurableObject` namespace from the declarative `exports` configuration during deployment. Do not create or migrate that namespace by hand.

The Hyperdrive configuration IDs are non-secret resource identifiers and are committed in `wrangler.jsonc`. Cloudflare stores each Hyperdrive origin URL and its database credentials. Keep the same direct origin URLs in the ignored `.env.deploy.local` file for migrations and operator setup commands. Do not add Neon pooler URLs or database credentials to Wrangler variables, Worker secrets, or tracked files.

Set `VITE_APP_NAME` and `VITE_SERVER_URL` in the build environment. `VITE_SERVER_URL` must match the public URL. Production serves both `https://productivity-up.com` and `https://www.productivity-up.com`; use the apex URL as the canonical Better Auth and Vite server URL.

The deployment commands do not upload secrets. The initial setup created the empty Worker service records through Cloudflare's Create Worker API, then used `wrangler versions upload --secrets-file` to attach secrets to draft versions without creating deployments. Use `wrangler versions secret` for later secret rotation. Keep the generated Better Auth secrets in the ignored `.env.cloudflare-setup.local` file so setup and rotation remain reproducible. Protect that file as secret material and never commit it.

The initial setup versions are secret carriers only. Do not deploy them manually. The normal release commands build and deploy the pinned `main@origin` revision.

## Local development

Local development connects directly to the Neon development branch. Put its direct, non-pooler URL and the local application values in the ignored `.env.local` file:

```dotenv
DATABASE_URL=postgresql://...
APP_NAME=Productivity Up
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=...
EMAIL_FROM=...
RESEND_API_KEY=...
```

Do not create `.dev.vars`. Its presence prevents the Cloudflare Vite plugin from loading `.env.local`. Run the application normally with `pnpm dev`; local development does not select a Wrangler environment or use Hyperdrive. The top-level `USER_REALTIME` binding runs the realtime Durable Object locally, so `pnpm dev` serves the same WebSocket endpoint as deployed environments.

Apply migrations to the development branch with:

```sh
pnpm db:migrate:development
```

The command maps `DATABASE_URL` to the `DATABASE_URL_DIRECT` value expected by Drizzle. It refuses pooled URLs and, when `.env.deploy.local` is present, refuses a local URL that matches either deployment database. It removes application secrets and deployment database URLs before starting Drizzle.

## Local deployment variables

Put operator-only values in the ignored `.env.deploy.local` file or export them in the shell:

```dotenv
STAGING_DATABASE_URL_DIRECT=postgresql://...
PRODUCTION_DATABASE_URL_DIRECT=postgresql://...
STAGING_SMOKE_TEST_EMAIL=...
STAGING_SMOKE_TEST_PASSWORD=...
STAGING_PUBLIC_URL=https://productivity-up-staging.<account-subdomain>.workers.dev
VITE_APP_NAME=Productivity Up
```

Keep the staging-only Cloudflare Access Service Token in the ignored `.env.deploy.local` file alongside the other deployment variables:

```dotenv
STAGING_CF_ACCESS_CLIENT_ID=...
STAGING_CF_ACCESS_CLIENT_SECRET=...
```

The deployment workflow removes both values from child process environments.

The direct URLs must point to separate Neon databases and use non-pooler hosts. Hyperdrive handles runtime connection pooling, so Neon pooler URLs are not part of this deployment model. The scripts expose only the selected direct URL to the Drizzle migration subprocess. Install, build, Wrangler, and metadata subprocesses receive neither direct URL, smoke-test credentials, setup credentials, nor local application secrets. `STAGING_PUBLIC_URL` is an operator input used to derive the staging build URL, but it is also removed before subprocesses start. The production command always builds with `https://productivity-up.com` as its public URL.

The staging Cloudflare Access application should continue to require interactive login for normal visitors. Its staging-only Service Auth policy grants this smoke-test Service Token access to the Worker. The smoke test sends the token's `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers on every request, so Access checks never replace the application's own checks: the realtime upgrade must still refuse a caller without an app session. Do not add this Service Token to Wrangler or expose it to deployment subprocesses.

To check authentication email on the deployed staging Worker, run the command below. It reads `STAGING_RESEND_API_KEY`, the staging Worker's `RESEND_API_KEY` secret, from `.env.cloudflare-setup.local`, so the Resend lookup uses the same account that sent the email. The key needs full access, not sending-only access, to read sent emails.

```sh
pnpm test:staging-email
```

The check signs up a throwaway `delivered+<id>@resend.dev` User. It waits for the Worker's `auth_email.send` record through `wrangler tail`, then confirms through the Resend API that the email went to that recipient. It also fails if the tailed logs contain the recipient, a verification link, the password, or a credential. It deletes the User afterwards. Run it after a staging deployment that changes authentication email; the deployment command does not run it.

The staging smoke-test account must already exist, have a verified email address, and have a readable board. The smoke test signs in, loads `/board`, and opens the realtime WebSocket at `/api/realtime`. The signed-in connection must answer a heartbeat, while signed-out, foreign-origin, and caller-supplied User ID upgrades must be refused. It does not create, edit, or delete data.

Create or refresh that account without resetting staging data:

```sh
pnpm db:setup-staging-smoke-account
```

The command uses the staging direct database URL, marks the configured user as verified, refreshes its credential password, and creates any missing active Buckets. It refuses pooled connections and a staging URL that matches production. Rerunning it preserves existing users, Buckets, Todos, Categories, and Tags.

## Staging

Staging uses disposable data and is not a production release. Before the first production release, this project accepted breaking changes, destructive staging resets, temporary staging downtime, and no compatibility layer. That exception ended with the first production release. Subsequent schema and application changes must preserve compatibility throughout the rollout.

```sh
pnpm deploy:staging
```

Staging runs the initial and pending Drizzle migrations, deploys the Worker, then runs the authenticated read-only smoke test, including the realtime WebSocket checks. Every request crosses the runtime configuration check, so a successful sign-in and board load prove that the Worker received its Hyperdrive, Durable Object, variables, and secrets. If that final test fails, the command prints the full report, marks the smoke test as failed, and exits nonzero. The deployed Worker remains live and the command does not roll it back.

### Manual realtime convergence check

The read-only smoke test cannot prove that committed Todo changes reach a User's other clients. Until the E2E suite in [issue #111](https://github.com/alerecchi/productivity-up/issues/111) automates it, run this check by hand after a staging deployment that changes realtime or Todo commands. It needs two verified staging accounts, User A and User B, each with at least two active Buckets.

1. Open `/board` as User A in two separate browser windows (A1 and A2), and as User B in a private window (B1).
2. In A1, perform each action below. After each one, confirm that A2 shows the same Buckets and Todo order within a few seconds without reloading:
   - create a Todo;
   - edit its title, then change its Bucket from the edit dialog;
   - toggle its completion;
   - drag it to another position in the same Bucket, then into another Bucket;
   - drag Todos repeatedly into the same gap until the Bucket rebalances, then compare the full order in both windows;
   - delete it.
3. In the developer tools of A1, confirm that its `/api/realtime` WebSocket receives no hint messages for its own changes.
4. Repeat one create and one move from A2 and confirm that A1 converges.
5. Throughout, confirm in B1's developer tools that its `/api/realtime` WebSocket receives only heartbeat `pong` frames and that B1 issues no Todo requests.
6. Take A2 offline, make a change in A1, then bring A2 back online. A2 must reconnect and converge through its full resynchronization.

## Production

```sh
pnpm deploy:production
```

Production reads the Worker version currently receiving all staging traffic. It deploys without a prompt when that version's full source SHA matches the pinned `main@origin` SHA. Missing, malformed, ambiguous, or mismatched staging metadata cancels by default.

For an intentional direct production release, confirm the interactive prompt or use:

```sh
pnpm deploy:production -- --allow-unstaged
```

The override skips only the staging revision check. Installation, build, migration, and deployment failures still stop the release. Production does not run a smoke test.

## Rollback and schema changes

Do not use a Worker rollback as the default recovery path. Cloudflare changes only the Worker version; Neon remains on its current schema. If the previous Worker is not compatible with that schema, rolling back the Worker can make the incident worse. Deploy a forward fix instead.

A Worker rollback also does not remove Durable Object namespaces or their stored data. Worker versions from before direct authentication email require the deleted email Queues, so do not roll back to them. Confirm compatibility with those resources before selecting an older Worker version.

Only roll back after confirming that the selected Worker version supports the current Neon schema. When that condition holds, use the version ID shown by the Worker deployment history:

```sh
pnpm exec wrangler rollback <VERSION_ID> --name productivity-up-staging --message "Rollback staging"
pnpm exec wrangler rollback <VERSION_ID> --name productivity-up-production --message "Rollback production"
```

Keep migrations compatible with the previously deployed Worker. Breaking schema changes need a multi-release migration that expands the schema first, changes the application second, and removes obsolete schema only after old Worker versions are no longer needed.
