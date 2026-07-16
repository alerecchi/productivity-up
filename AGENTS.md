# AGENTS.md

## Project Snapshot

Todo Buckets is an opinionated Todo App that uses time-based buckets (e.g. This Year, This Month, This Week, Today) to manage your todos (Kanban style, todos should flow from bigger sized buckets to smaller ones).
This repository is a VERY EARLY WIP. Larger maintainability proposals are welcome when justified.

## Core Priorities

1. Performance
2. Reliability
3. Maintainability

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
- Tailwind v4 and shadcn/ui for CSS and UI components. Prefer using shadcn's components when available over creating your own. Never use BaseUI components directly, better propose to install the shadcn component.
- Sonner (via shadcn) for global toast notifications.

For the TanStack libraries, you have access to the TanStack CLI and you can query docs using that:
`tanstack search-docs <query> [options]`

```txt
Options:
  --library <id>       Filter by library ID
  --framework <name>   Filter by framework
  --limit <n>          Max results (default 10, max 50)
  --json               Output machine-readable JSON
```

For the rest you can search online when needed.
If you think to add a library to the project ALWAYS ASK FOR APPROVAL first and add it to this list with a few words explaining what it does.
If some library gets a major update or is removed from the project update the tech stack list above.

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
- `server/middleware`;

As this is a WIP project this project structure is subject to changes.
When folders contain many elements that are exported for other modules/components an `index.ts` file should be added to improve dev experience.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain docs layout. See `docs/agents/domain.md`.
