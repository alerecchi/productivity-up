# Move todos

Users drag a todo by its handle to reorder it inside a bucket or drop it into another bucket; the new position and bucket persist.

Status: derived from source; not yet exercised.

## Sub-features

- `move-reorder` changes a todo's position within its bucket.
- `move-across` moves a todo into another bucket at the dropped position.
- `move-autoscroll` scrolls the board horizontally while dragging near its edge.

## How to get to it (user POV)

- `/board` → grab a card's grip handle (`Drag <title>`) → drop over another card or an empty area of a column.

## Driving it with pnpm verify drive

Preconditions: baseline; signed in as `seed_user_with_data`.

- **Reorder.** Take the handle `getByRole('button', { name: 'Drag Seed Todo 11' })` and the target card in the same list. Drive the pointer with real moves: `mouse.move(handleCenter)`, `mouse.down()`, `mouse.move(target, { steps: 20 })`, `mouse.up()`. The card order in `list Inbox Todos` changes.
- **Across.** Same pointer sequence from a card in `Inbox Todos` to a card in the year column's list. The card leaves Inbox (badge −1) and appears in the target column (badge +1).
- **Proof.** `reload()` + `hydrated()`, re-read the order of `Drag ...` buttons in both lists; `sql("select t.title, b.type, t.position from todos t join buckets b on b.id = t.bucket_id where b.user_id = 'seed_user_with_data' order by b.type, t.position")`.

## Gotchas

- `locator.dragTo()` performs too few pointer moves for @dnd-kit's sensors to start a drag; use explicit `mouse` steps.
- Start the drag on the handle, not the card body: a card-body click opens the edit dialog.
- Drops on columns outside the viewport need `move-autoscroll`; prove reachable targets first.
