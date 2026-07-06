import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { todoTags } from '@/server/db/schema/schema'

import {
  CreateTagInput,
  DeleteTagInput,
  TagNameConflictError,
  UpdateTagInput,
  createTagForUser,
  deleteTagForUser,
  listTagsForUser,
  updateTagForUser,
} from './tags.core'
import type { TagRepository } from './tags.core'

const existingTag = {
  colorKey: 'blue',
  id: 4,
  name: 'urgent_now',
  userId: 'user-1',
} as const

const createRepository = (overrides: Partial<TagRepository> = {}): TagRepository => ({
  createTag: vi.fn((tagToCreate) => Promise.resolve({ id: 8, ...tagToCreate })),
  deleteTag: vi.fn((tagId, userId) => Promise.resolve({ tagId, userId })),
  findTagByName: vi.fn(() => Promise.resolve(undefined)),
  hasPendingMigrationBuckets: vi.fn(() => Promise.resolve(false)),
  listTagsForUser: vi.fn(() => Promise.resolve([])),
  updateTag: vi.fn((tagId, userId, updates) =>
    Promise.resolve({
      ...existingTag,
      ...updates,
      id: tagId,
      userId,
    }),
  ),
  ...overrides,
})

describe('tag server behavior', () => {
  it('creates a user-owned Tag with a normalized compact handle', async () => {
    const repository = createRepository()

    const tag = await createTagForUser({
      data: CreateTagInput.parse({
        colorKey: 'green',
        name: '  URGENT_Now  ',
      }),
      repository,
      userId: existingTag.userId,
    })

    expect(repository.createTag).toHaveBeenCalledWith({
      colorKey: 'green',
      name: 'urgent_now',
      userId: existingTag.userId,
    })
    expect(tag).toMatchObject({
      colorKey: 'green',
      name: 'urgent_now',
    })
  })

  it('rejects Tag management while a Pending Migration Bucket gates the board', async () => {
    const repository = createRepository({
      hasPendingMigrationBuckets: vi.fn(() => Promise.resolve(true)),
    })

    await expect(
      createTagForUser({
        data: { colorKey: 'green', name: 'urgent' },
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 409)
    await expect(
      updateTagForUser({
        data: { colorKey: 'green', id: existingTag.id, name: 'next_up' },
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 409)
    await expect(
      deleteTagForUser({
        data: { id: existingTag.id },
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.createTag).not.toHaveBeenCalled()
    expect(repository.updateTag).not.toHaveBeenCalled()
    expect(repository.deleteTag).not.toHaveBeenCalled()
  })

  it('rejects duplicate Tag creation without selecting the existing Tag', async () => {
    const repository = createRepository({
      findTagByName: vi.fn(() => Promise.resolve(existingTag)),
    })

    await expect(
      createTagForUser({
        data: CreateTagInput.parse({
          colorKey: 'rose',
          name: 'URGENT_NOW',
        }),
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.findTagByName).toHaveBeenCalledWith(existingTag.userId, existingTag.name)
    expect(repository.createTag).not.toHaveBeenCalled()
  })

  it('rejects a raced Tag create conflict that reaches the repository insert', async () => {
    const repository = createRepository({
      createTag: vi.fn(() => Promise.reject(new TagNameConflictError())),
    })

    await expect(
      createTagForUser({
        data: CreateTagInput.parse({
          colorKey: 'rose',
          name: 'URGENT_NOW',
        }),
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.findTagByName).toHaveBeenCalledWith(existingTag.userId, existingTag.name)
    expect(repository.createTag).toHaveBeenCalledWith({
      colorKey: 'rose',
      name: existingTag.name,
      userId: existingTag.userId,
    })
  })

  it('rejects spaces, invalid characters, invalid length, and invalid Tag colors at the validation boundary', () => {
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'urgent now' }).success).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'urgent.now' }).success).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: '' }).success).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'blue', name: 'a'.repeat(33) }).success).toBe(false)
    expect(CreateTagInput.safeParse({ colorKey: 'legacy-color', name: 'urgent' }).success).toBe(false)
  })

  it('rejects invalid Tag update input at the validation boundary', () => {
    expect(UpdateTagInput.safeParse({ colorKey: 'blue', id: existingTag.id, name: 'urgent now' }).success).toBe(false)
    expect(UpdateTagInput.safeParse({ colorKey: 'blue', id: existingTag.id, name: 'urgent.now' }).success).toBe(false)
    expect(UpdateTagInput.safeParse({ colorKey: 'blue', id: existingTag.id, name: '' }).success).toBe(false)
    expect(UpdateTagInput.safeParse({ colorKey: 'blue', id: existingTag.id, name: 'a'.repeat(33) }).success).toBe(false)
    expect(UpdateTagInput.safeParse({ colorKey: 'legacy-color', id: existingTag.id, name: 'urgent' }).success).toBe(
      false,
    )
  })

  it('lists Tags for the current user only', async () => {
    const repository = createRepository({
      listTagsForUser: vi.fn(() => Promise.resolve([existingTag])),
    })

    const tags = await listTagsForUser({
      repository,
      userId: existingTag.userId,
    })

    expect(repository.listTagsForUser).toHaveBeenCalledWith(existingTag.userId)
    expect(tags).toEqual([
      {
        colorKey: existingTag.colorKey,
        id: existingTag.id,
        name: existingTag.name,
      },
    ])
  })

  it('updates an owned Tag with a normalized compact handle and curated color', async () => {
    const repository = createRepository()

    const tag = await updateTagForUser({
      data: UpdateTagInput.parse({
        colorKey: 'green',
        id: existingTag.id,
        name: '  Next_Up  ',
      }),
      repository,
      userId: existingTag.userId,
    })

    expect(repository.updateTag).toHaveBeenCalledWith(existingTag.id, existingTag.userId, {
      colorKey: 'green',
      name: 'next_up',
    })
    expect(tag).toMatchObject({
      colorKey: 'green',
      id: existingTag.id,
      name: 'next_up',
    })
  })

  it("rejects updating another user's Tag", async () => {
    const repository = createRepository({
      updateTag: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      updateTagForUser({
        data: {
          colorKey: 'green',
          id: existingTag.id,
          name: 'life',
        },
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.updateTag).toHaveBeenCalledWith(existingTag.id, existingTag.userId, {
      colorKey: 'green',
      name: 'life',
    })
  })

  it('rejects renaming a Tag to another existing Tag handle for the same user', async () => {
    const repository = createRepository({
      findTagByName: vi.fn(() =>
        Promise.resolve({
          colorKey: 'rose',
          id: 9,
          name: 'next_up',
          userId: existingTag.userId,
        } as const),
      ),
    })

    await expect(
      updateTagForUser({
        data: UpdateTagInput.parse({
          colorKey: 'green',
          id: existingTag.id,
          name: '  Next_Up  ',
        }),
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.findTagByName).toHaveBeenCalledWith(existingTag.userId, 'next_up')
    expect(repository.updateTag).not.toHaveBeenCalled()
  })

  it('rejects a raced Tag rename conflict that reaches the repository update', async () => {
    const repository = createRepository({
      updateTag: vi.fn(() => Promise.reject(new TagNameConflictError())),
    })

    await expect(
      updateTagForUser({
        data: UpdateTagInput.parse({
          colorKey: 'green',
          id: existingTag.id,
          name: '  Next_Up  ',
        }),
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 409)

    expect(repository.findTagByName).toHaveBeenCalledWith(existingTag.userId, 'next_up')
    expect(repository.updateTag).toHaveBeenCalledWith(existingTag.id, existingTag.userId, {
      colorKey: 'green',
      name: 'next_up',
    })
  })

  it('allows casing-only Tag edits to keep the normalized lowercase handle', async () => {
    const repository = createRepository({
      findTagByName: vi.fn(() => Promise.resolve(existingTag)),
    })

    const tag = await updateTagForUser({
      data: UpdateTagInput.parse({
        colorKey: 'blue',
        id: existingTag.id,
        name: 'URGENT_NOW',
      }),
      repository,
      userId: existingTag.userId,
    })

    expect(repository.updateTag).toHaveBeenCalledWith(existingTag.id, existingTag.userId, {
      colorKey: 'blue',
      name: 'urgent_now',
    })
    expect(tag.name).toBe('urgent_now')
  })

  it('deletes an owned Tag', async () => {
    const repository = createRepository()

    const deletedTag = await deleteTagForUser({
      data: DeleteTagInput.parse({
        id: existingTag.id,
      }),
      repository,
      userId: existingTag.userId,
    })

    expect(repository.deleteTag).toHaveBeenCalledWith(existingTag.id, existingTag.userId)
    expect(deletedTag).toEqual({
      tagId: existingTag.id,
      userId: existingTag.userId,
    })
  })

  it("rejects deleting another user's Tag", async () => {
    const repository = createRepository({
      deleteTag: vi.fn(() => Promise.resolve(undefined)),
    })

    await expect(
      deleteTagForUser({
        data: {
          id: existingTag.id,
        },
        repository,
        userId: existingTag.userId,
      }),
    ).rejects.toHaveProperty('status', 404)

    expect(repository.deleteTag).toHaveBeenCalledWith(existingTag.id, existingTag.userId)
  })

  it('removes Todo Tag associations when a Tag is deleted', () => {
    const tagForeignKey = getTableConfig(todoTags).foreignKeys.find(
      (foreignKey) => foreignKey.getName() === 'todo_tags_tag_id_tags_id_fk',
    )

    expect(tagForeignKey?.onDelete).toBe('cascade')
  })
})
