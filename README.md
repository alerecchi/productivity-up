# Productivity Up

An opinionated ToDo app that uses time buckets to organize and schedule todos.

## Local validation

Use Node.js 24 or newer and the pnpm version pinned in `package.json`. After checking out the repository, install the locked dependencies and run the canonical validation gate:

```sh
pnpm install --frozen-lockfile
pnpm validate
```

Validation checks formatting and lint rules, runs the test suite, typechecks the project, and builds the production Cloudflare Worker bundle. The command stops on the first failed check. Vitest also fails when it discovers no tests.

The Worker build selects the tracked production Wrangler environment, but validation does not deploy, run migrations, or connect to staging. It does not require Cloudflare credentials, runtime secret values, deployment database URLs, or `.env.deploy.local`. Wrangler may warn that the runtime secrets declared in `wrangler.jsonc` are absent because a local build does not upload them.

See [Cloudflare deployments](docs/deployment.md) for the separate migration, staging, and production prerequisites.
