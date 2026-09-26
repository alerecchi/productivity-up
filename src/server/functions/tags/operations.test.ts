import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import type { TagDisplay } from '@/lib/types/Tag'
import { TodoSchema } from '@/lib/types/Todo'
import { todoTags } from '@/server/db/schema/schema'

import {
  TagNameConflictError,
  createTagForUser,
  deleteTagForUser,
  listTagsForUser,
  updateTagForUser,
} from './operations'
import type { TagRepository } from './operations'
import { CreateTagInput, TagResponse, UpdateTagInput } from './schemas'

type StoredTag = TagDisplay & { userId: string }

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const urgent: StoredTag = { colorKey: 'blue', id: 4, name: 'urgent_now', userId: USER_ID }
const foreignWork: StoredTag = { colorKey: 'teal', id: 9, name: 'work', userId: OTHER_USER_ID }
const conflict = { code: 'CONFLICT', message: 'Tag name already exists', status: 409 }
const notFound = { code: 'RESOURCE_NOT_FOUND', status: 404 }

/** Runs a fake repository write so that thrown errors reject, like the production repository's statements. */
function settle<T>(write: () => T) {
  return new Promise<T>((resolve) => resolve(write()))
}

/** Models the owner-scoped SQL predicates and the (user_id, name) unique index of the production repository. */
function createTagStore(initialTags: Array<StoredTag> = [], { pendingMigration = false } = {}) {
  const tags = initialTags.map((tag) => ({ ...tag }))
  let nextId = Math.max(0, ...tags.map((tag) => tag.id)) + 1

  const assertUniqueName = (userId: string, name: string, exceptId?: number) => {
    if (tags.some((tag) => tag.userId === userId && tag.name === name && tag.id !== exceptId)) {
      throw new TagNameConflictError()
    }
  }
  const toDisplay = ({ colorKey, id, name }: StoredTag): TagDisplay => ({ colorKey, id, name })

  const repository: TagRepository = {
    createTag: (tag) =>
      settle(() => {
        assertUniqueName(tag.userId, tag.name)
        const created = { ...tag, id: nextId++ }
        tags.push(created)
        return toDisplay(created)
      }),
    deleteTag: (tagId, userId) =>
      settle(() => {
        const index = tags.findIndex((tag) => tag.id === tagId && tag.userId === userId)
        if (index === -1) {
          return undefined
        }
        tags.splice(index, 1)
        return { tagId }
      }),
    hasPendingMigrationBuckets: () => Promise.resolve(pendingMigration),
    listTagsForUser: (userId) =>
      Promise.resolve(
        tags
          .filter((tag) => tag.userId === userId)
          .toSorted((left, right) => left.name.localeCompare(right.name))
          .map(toDisplay),
      ),
    updateTag: (tagId, userId, updates) =>
      settle(() => {
        const tag = tags.find((stored) => stored.id === tagId && stored.userId === userId)
        if (!tag) {
          return undefined
        }
        assertUniqueName(userId, updates.name, tagId)
        Object.assign(tag, updates)
        return toDisplay(tag)
      }),
  }

  return { repository, tags }
}

describe('Tag commands', () => {
  it('creates a Tag with a normalized handle and returns only its display data', async () => {
    const { repository } = createTagStore([foreignWork])

    const tag = await createTagForUser({
      data: CreateTagInput.parse({ colorKey: 'green', name: '  Next_Up  ' }),
      repository,
      userId: USER_ID,
    })

    expect(tag).toEqual({ colorKey: 'green', id: 10, name: 'next_up' })
  })

  it('allows a Tag handle that another User already uses', async () => {
    const { repository } = createTagStore([foreignWork])

    await expect(
      createTagForUser({ data: CreateTagInput.parse({ colorKey: 'rose', name: 'Work' }), repository, userId: USER_ID }),
    ).resolves.toMatchObject({ name: 'work' })
  })

  it('rejects a duplicate Tag handle with the uniqueness conflict contract', async () => {
    const { repository } = createTagStore([urgent])

    await expect(
      createTagForUser({
        data: CreateTagInput.parse({ colorKey: 'rose', name: 'URGENT_NOW' }),
        repository,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject(conflict)
  })

  it('updates an owned Tag and returns only its display data', async () => {
    const { repository } = createTagStore([urgent])

    const tag = await updateTagForUser({
      data: UpdateTagInput.parse({ colorKey: 'green', id: urgent.id, name: '  Next_Up  ' }),
      repository,
      userId: USER_ID,
    })

    expect(tag).toEqual({ colorKey: 'green', id: urgent.id, name: 'next_up' })
  })

  it.each([
    ['casing-only', { colorKey: 'blue', name: 'URGENT_NOW' }],
    ['color-only', { colorKey: 'violet', name: 'urgent_now' }],
  ] as const)('keeps %s Tag edits free of conflicts', async (_edit, changes) => {
    const { repository } = createTagStore([urgent])

    const tag = await updateTagForUser({
      data: UpdateTagInput.parse({ ...changes, id: urgent.id }),
      repository,
      userId: USER_ID,
    })

    expect(tag).toEqual({ colorKey: changes.colorKey, id: urgent.id, name: 'urgent_now' })
  })

  it('rejects renaming a Tag to another owned Tag handle with the uniqueness conflict contract', async () => {
    const { repository, tags } = createTagStore([urgent, { colorKey: 'rose', id: 5, name: 'next_up', userId: USER_ID }])

    await expect(
      updateTagForUser({
        data: UpdateTagInput.parse({ colorKey: 'green', id: urgent.id, name: 'Next_Up' }),
        repository,
        userId: USER_ID,
      }),
    ).rejects.toMatchObject(conflict)
    expect(tags.find((tag) => tag.id === urgent.id)).toEqual(urgent)
  })

  it.each([
    ['missing', 99],
    ['foreign', foreignWork.id],
  ])('rejects updating a %s Tag as not found', async (_case, id) => {
    const { repository, tags } = createTagStore([urgent, foreignWork])

    await expect(
      updateTagForUser({ data: { colorKey: 'green', id, name: 'renamed' }, repository, userId: USER_ID }),
    ).rejects.toMatchObject(notFound)
    expect(tags).toEqual([urgent, foreignWork])
  })

  it('deletes an owned Tag and returns only its ID', async () => {
    const { repository, tags } = createTagStore([urgent, foreignWork])

    const deleted = await deleteTagForUser({ data: { id: urgent.id }, repository, userId: USER_ID })

    expect(deleted).toEqual({ tagId: urgent.id })
    expect(tags).toEqual([foreignWork])
  })

  it.each([
    ['missing', 99],
    ['foreign', foreignWork.id],
  ])('rejects deleting a %s Tag as not found', async (_case, id) => {
    const { repository, tags } = createTagStore([urgent, foreignWork])

    await expect(deleteTagForUser({ data: { id }, repository, userId: USER_ID })).rejects.toMatchObject(notFound)
    expect(tags).toEqual([urgent, foreignWork])
  })

  it("lists only the User's Tags as display data", async () => {
    const { repository } = createTagStore([urgent, foreignWork])

    await expect(listTagsForUser({ repository, userId: USER_ID })).resolves.toEqual([
      { colorKey: 'blue', id: urgent.id, name: 'urgent_now' },
    ])
  })

  it('rejects Tag changes while a Pending Migration Bucket gates the board', async () => {
    const { repository, tags } = createTagStore([urgent], { pendingMigration: true })
    const gated = { status: 409 }

    await expect(
      createTagForUser({ data: { colorKey: 'green', name: 'work' }, repository, userId: USER_ID }),
    ).rejects.toMatchObject(gated)
    await expect(
      updateTagForUser({ data: { colorKey: 'green', id: urgent.id, name: 'work' }, repository, userId: USER_ID }),
    ).rejects.toMatchObject(gated)
    await expect(deleteTagForUser({ data: { id: urgent.id }, repository, userId: USER_ID })).rejects.toMatchObject(
      gated,
    )
    expect(tags).toEqual([urgent])
  })

  it('returns the same Tag display shape that Todos embed', () => {
    expect(TagResponse).toBe(TodoSchema.shape.tags.element)
  })

  it('removes Todo Tag associations when a Tag is deleted', () => {
    const tagForeignKey = getTableConfig(todoTags).foreignKeys.find(
      (foreignKey) => foreignKey.getName() === 'todo_tags_tag_id_tags_id_fk',
    )

    expect(tagForeignKey?.onDelete).toBe('cascade')
  })

  it('rejects spaces, invalid characters, invalid length, and invalid colors at the validation boundary', () => {
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'urgent now' }).success).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'urgent.now' }).success).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: '' }).success).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'a'.repeat(33) }).success).toBe(false)
    expect(UpdateTagInput.safeParse({ colorKey: 'legacy-color', id: urgent.id, name: 'urgent' }).success).toBe(false)
  })
})
