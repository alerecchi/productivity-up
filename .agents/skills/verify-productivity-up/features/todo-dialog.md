# Todo dialog

Users create a todo from a bucket column's `+` button, open an existing todo by clicking its card to edit or delete it, and mark it complete with the card's round checkbox.

Status: `todo-create` proven (`journeys/create-todo.ts`, 2026-10-15). The other sub-features are derived from source and not yet exercised.

## Sub-features

- `todo-create` adds a todo to the chosen bucket with title, description, category, and tags.
- `todo-edit` changes an existing todo's fields, including its bucket.
- `todo-complete` toggles completion from the card checkbox.
- `todo-delete` deletes after a second confirming click.

## How to get to it (user POV)

- `/board` → the `+` button (`Add todo`) in any bucket column header → dialog `Add New Task`.
- `/board` → click anywhere on a card except its drag handle or checkbox → dialog `Edit Task`.
- `/board` → hover a card → round checkbox next to the drag handle.

## Driving it with pnpm verify drive

Preconditions: baseline; signed in as `seed_user_with_data`.

- **Create.** `page.getByRole('region', { name: 'Inbox' }).getByRole('button', { name: 'Add todo' }).click()`; in `getByRole('dialog', { name: 'Add New Task' })` fill `getByLabel('Title')`, `getByLabel('Description')`, the `Bucket` select (`getByLabel('Bucket').selectOption(...)`), then `getByRole('button', { name: 'Add', exact: true })`. Dialog closes; the title appears in `getByRole('list', { name: 'Inbox Todos' })` and the column badge count goes up by one.
- **Edit.** Click the card text (`list.getByText(title)`); dialog `Edit Task` opens prefilled; change fields and click `Save changes`. Card shows new values; moving to another bucket moves the card to that column.
- **Complete.** `card.hover()`, then click the checkbox (`getByRole('checkbox')` inside the card). Card gets `data-completed="true"` and muted styling.
- **Delete.** Open `Edit Task`, click `Delete todo` once (text `Click Delete todo again to permanently delete it.` appears), click again. Dialog closes and the card is gone.
- **Proof.** `reload()` + `hydrated()` and re-assert; `sql("select t.title, t.completed, b.type from todos t join buckets b on b.id = t.bucket_id where t.title = $1", [title])` shows the row (or none after delete).

## Gotchas

- The auth page and the dialog both have generic button names; scope every locator to the dialog or column.
- The category/tag pickers are popovers portaled outside the dialog; locate their items on `page`.
- The Daily column is right of the 1440 px viewport; `scrollIntoViewIfNeeded()` before interacting with or shooting it.
- The completion checkbox is `opacity-0` until the card is hovered; hover first so the click is a real user action.
