// TEMPLATE JOURNEY: copy this file to start a new one, then change the actions and assertions but keep the proof steps.
// Creates a Todo in the Inbox through the Add todo dialog and proves it on screen, after reload, and in the DB.
// Run: pnpm verify drive .agents/skills/verify-productivity-up/journeys/create-todo.ts
// Needs seed_user_with_data (the default user): it picks the seeded `work` category.
import { expect } from '@playwright/test'

import type { Journey } from '../../../../scripts/verify/journey'

const journey: Journey = async ({ hydrated, page, shot, sql, step }) => {
  const title = `Verify todo ${Date.now()}`
  const inbox = page.getByRole('region', { name: 'Productivity Up board' }).getByRole('region', { name: 'Inbox' })
  const inboxTodos = page.getByRole('list', { name: 'Inbox Todos' })
  const countBefore = await inboxTodos.getByRole('button', { name: /^Drag / }).count()
  await shot('board-before')

  step('open Add todo from the Inbox column')
  await inbox.getByRole('button', { name: 'Add todo' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add New Task' })
  await expect(dialog).toBeVisible()

  step(`fill title "${title}", description, category "work"`)
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Description').fill('Created by the verify harness')
  await dialog.getByRole('button', { name: 'No Category' }).click()
  // The picker is a popover portaled outside the dialog.
  await page.getByRole('button', { name: 'Select work' }).click()
  await expect(dialog.getByRole('button', { name: 'work' })).toBeVisible()
  await shot('dialog-filled')

  step('submit')
  await dialog.getByRole('button', { exact: true, name: 'Add' }).click()
  await expect(dialog).toBeHidden()
  await expect(inboxTodos.getByText(title)).toBeVisible()
  await expect(inboxTodos.getByRole('button', { name: /^Drag / })).toHaveCount(countBefore + 1)
  await shot('board-after-create')

  step('reload: the Todo must persist')
  await page.reload()
  await hydrated()
  await expect(inboxTodos.getByText(title)).toBeVisible()

  step('DB: exactly one row, in the Inbox bucket, with category work')
  const rows = await sql(
    `select t.title, t.description, t.completed, b.type as bucket_type, c.name as category
       from todos t join buckets b on b.id = t.bucket_id left join categories c on c.id = t.category_id
      where t.title = $1`,
    [title],
  )
  expect(rows).toEqual([
    { bucket_type: 'inbox', category: 'work', completed: false, description: 'Created by the verify harness', title },
  ])
}

export default journey
