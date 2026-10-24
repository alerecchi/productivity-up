# Board prototypes (throwaway)

Five board variants built during [Compare the impeccable and better-\* skill stacks on the board](https://github.com/alerecchi/productivity-up/issues/150), using the better-\* skills. They answer "how should the board work on phone and desktop?" and are input for the real board rework. They are not production code. **Throw all of this away when the actual UX re-implementation lands.**

## Open them

Run the app in development and go to `/board?variant=<key>`. Production builds ignore the parameter and always render the real board. State is in memory and shared across variants. Use the bar at the bottom to switch variants, toggle the theme, or reset.

| Key         | Variant      |
| ----------- | ------------ |
| `telescope` | Telescope    |
| `kanban`    | Kanban       |
| `focus`     | Today + tray |
| `scroll`    | The scroll   |
| `desk`      | Triage desk  |

## Screenshots

`screenshots/` holds desktop, dark and phone captures of every variant. `kanban-*-before-header-change.png` show the kanban variant before its last header change.

## Removal checklist

1. Delete `src/features/board-prototype/`.
2. In `src/routes/_authenticated/board.tsx`, remove the `// PROTOTYPE` lazy import, `validateSearch` and the `variant` branch in `RouteComponent`.
3. Delete this folder, `docs/ux/prototypes/board/`.
4. Remove `@dnd-kit/helpers` from `package.json` unless the final board uses it.
5. Remove `motion` from `package.json` unless the final implementation uses it.
6. Delete these shadcn components unless the final implementation uses them: `dropdown-menu`, `kbd`, `progress`, `tooltip` (in `src/features/shared/components/ui/`).
7. Run `pnpm install`, `pnpm typecheck` and `pnpm lint`.
