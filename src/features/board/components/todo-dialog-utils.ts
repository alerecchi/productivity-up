import z from 'zod'

import type { Bucket } from '@/lib/types/Bucket'
import { DEFAULT_CATEGORY_COLOR_KEY } from '@/lib/types/Category'
import type { CategoryColorKey } from '@/lib/types/Category'
import { DEFAULT_TAG_COLOR_KEY } from '@/lib/types/Tag'
import type { TagColorKey } from '@/lib/types/Tag'
import type { Todo } from '@/lib/types/Todo'

export type BucketOption = Pick<Bucket, 'id' | 'period' | 'type'>

export type TodoFormValues = {
  bucketId: string
  categoryEditColorKey: CategoryColorKey
  categoryEditName: string
  categoryId: string
  description: string
  newCategoryColorKey: CategoryColorKey
  newCategoryName: string
  newTagColorKey: TagColorKey
  newTagName: string
  tagEditColorKeys: Record<string, TagColorKey>
  tagEditNames: Record<string, string>
  tagIds: Array<string>
  title: string
}

export type DialogResourceMode =
  | {
      type: 'list'
    }
  | {
      type: 'create'
    }
  | {
      id: number
      type: 'edit'
    }

export const titleValidator = z.string().trim().min(1, 'Title is required.')
export const bucketValidator = z.string().min(1, 'Bucket is required.')

const bucketTypeLabels = {
  daily: 'Daily',
  inbox: 'Inbox',
  monthly: 'Monthly',
  weekly: 'Weekly',
  yearly: 'Yearly',
} satisfies Record<BucketOption['type'], string>

export function hasDuplicateName<TItem extends { id: number; name: string }>(
  items: ReadonlyArray<TItem>,
  name: string,
  exceptId?: number,
) {
  const normalizedName = name.trim().toLocaleLowerCase()
  return items.some((item) => item.id !== exceptId && item.name.trim().toLocaleLowerCase() === normalizedName)
}

export function filterNamedItems<TItem extends { name: string }>(items: ReadonlyArray<TItem>, search: string) {
  const normalizedSearch = search.trim().toLowerCase()

  if (!normalizedSearch) {
    return items
  }

  return items.filter((item) => item.name.toLowerCase().includes(normalizedSearch))
}

export function formatBucketName(bucket: BucketOption) {
  return `${bucketTypeLabels[bucket.type]} - ${bucket.period}`
}

export function getDefaultFormValues(defaultBucketId: number, editingTodo?: Todo | null): TodoFormValues {
  return {
    bucketId: String(editingTodo?.bucketId ?? defaultBucketId),
    categoryEditColorKey: editingTodo?.category?.colorKey ?? DEFAULT_CATEGORY_COLOR_KEY,
    categoryEditName: editingTodo?.category?.name ?? '',
    categoryId: editingTodo?.categoryId ? String(editingTodo.categoryId) : '',
    description: editingTodo?.description ?? '',
    newCategoryColorKey: DEFAULT_CATEGORY_COLOR_KEY,
    newCategoryName: '',
    newTagColorKey: DEFAULT_TAG_COLOR_KEY,
    newTagName: '',
    tagEditColorKeys: Object.fromEntries(editingTodo?.tags.map((tag) => [String(tag.id), tag.colorKey]) ?? []),
    tagEditNames: Object.fromEntries(editingTodo?.tags.map((tag) => [String(tag.id), tag.name]) ?? []),
    tagIds: editingTodo?.tags.map((tag) => String(tag.id)) ?? [],
    title: editingTodo?.title ?? '',
  }
}

export function removeRecordKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...remaining } = record
  return remaining
}
