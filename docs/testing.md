# Testing

The test suite has two database boundaries:

- `pnpm test` runs unit and component tests without PostgreSQL.
- `pnpm test:integration` runs the production Drizzle repository against a new PostgreSQL database.

`pnpm validate` runs both suites before the production Worker build.

## PostgreSQL prerequisite

The integration runner needs a local PostgreSQL server and a role allowed to create and drop databases. It accepts only loopback hosts and the `postgres` maintenance database. It never reads `DATABASE_URL` or deployment database variables.

You can use an existing local PostgreSQL installation. Docker is another option:

```sh
docker run --rm --name productivity-up-integration-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:5433:5432 \
  postgres:17
```

Keep that process running while the integration tests execute.

Create an ignored `.env.test.local` file:

```dotenv
INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
```

The path must name the `postgres` maintenance database. Do not put a development, staging, or production application URL in this file.

## Run the tests

Run only the PostgreSQL suite with:

```sh
pnpm test:integration
```

For each invocation, the runner:

1. Creates a database named `productivity_up_test_<random-id>`.
2. Applies every checked-in Drizzle migration.
3. Runs only `*.integration.test.ts` files with the generated URL.
4. Closes test connections and drops that exact database, including after a test failure or interrupt.

The runner validates the generated database name before every create or drop operation. It removes development and deployment database variables from the Vitest process. A missing or unsafe configuration fails the command instead of skipping the suite.

The integration tests call the production repository directly. They do not start an HTTP server and do not contact Cloudflare, Neon, staging, or production.
