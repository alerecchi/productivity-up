# AGENTS.md

## Tech Stack

The current stack is:

- TanStack Start is the base as a full-stack React framework;
- React compiler enabled;
- TanStack Query for data fetching;
- TanStack Form, all form code MUST use TanStack Form to the fullest;
- @dnd-kit/react for drag-and-drop mechanics;
- Better Auth for authentication;
- Zod for validation;
- Drizzle as a DB ORM (using a Neon backend)

## Project Structure

The project has an opinionated structure that is feature-based but does not colocate client code with server code for the same feature. Client code should only import server code from `server/functions`. Some examples of important folders:

- `routes/` TanStack Start / Router routes;
- `lib/` Shared code between client and server;
- `features/` Client-side features;
- `features/shared` Features shared code (custom components, shadcn/ui components, hooks, utils etc.);
- `features/featureX` All the files related to a feature, organized in sub folders if needed, for example `/components`, `/hooks`, `/queries`, `lib` (for pure logic), `types` etc;
- `server/` all server code; client code should only import from `server/functions`;
- `server/db` DB schemas, migration and configuration;
- `server/functions` Server functions, organized in features files or sub folders when the single file gets too big;
- `server/core/middlewares` Middleware shared by every server function; middleware for one feature lives in that feature's server folder;

As this is a WIP project this project structure is subject to changes.
When folders contain many elements that are exported for other modules/components an `index.ts` file should be added to improve dev experience.

## Version control

This repo is a colocated jj repository, and each workspace is a jj workspace. Don't run mutating `git` commands directly.

## Agent skills

### Product

Purpose, users and brand personality guide every UI, UX and copy decision. See `docs/PRODUCT.md`.

### Design system

Theme, component, layout rules that apply to all UI work. See `docs/DESIGN.md`.

### Issue tracker

Issues and PRDs are tracked as GitHub issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context glossary layout. See `docs/agents/domain.md`.
