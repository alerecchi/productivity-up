# Categories and tags

From the todo dialog, users assign at most one category and any number of tags to a todo, and create, rename, recolor, or delete categories and tags in place.

Status: category assignment proven inside `journeys/create-todo.ts` (`Select work`); everything else derived from source and not yet exercised.

## Sub-features

- `category-assign` sets or clears the todo's category.
- `category-manage` creates, edits, and deletes a category.
- `tag-assign` adds and removes tags on a todo.
- `tag-manage` creates, edits, and deletes a tag.

## How to get to it (user POV)

- Todo dialog → `Category` field button (shows `No Category` or the category name) → popover with `Search categories`.
- Todo dialog → `Tags` → `Manage tags` (`+`) → popover with `Search tags`; assigned tags show a `Remove <name>` button.

## Driving it with pnpm verify drive

Preconditions: baseline; signed in as `seed_user_with_data`; a todo dialog open (see `todo-dialog.md`).

- **Assign category.** `dialog.getByRole('button', { name: 'No Category' }).click()`, then `page.getByRole('button', { name: 'Select work' }).click()`. The field button now reads `work`; after saving, the card gets the category's colored left border.
- **Create category/tag.** In the popover, use the create entry, fill `getByLabel('Name')`, pick a color (buttons named by color key, e.g. `blue`), and save. The new item is listed and selectable.
- **Assign tag.** `dialog.getByRole('button', { name: 'Manage tags' }).click()`, choose the tag on `page`. A badge with the tag name appears; after saving, the card shows it uppercased.
- **Proof.** `sql("select c.name as category, array_agg(g.name) as tags from todos t left join categories c on c.id = t.category_id left join todo_tags tt on tt.todo_id = t.id left join tags g on g.id = tt.tag_id where t.title = $1 group by c.name", [title])`.

## Gotchas

- Popovers are portaled outside the dialog; their items must be located on `page`.
- Tag badges render uppercase via CSS; assert with case-insensitive text or the DB.
- Deleting a category or tag that seed todos use changes other cards; `reseed` afterwards.
