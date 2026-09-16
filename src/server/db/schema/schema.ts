import { relations, sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { CATEGORY_COLOR_KEYS } from '../../../lib/types/Category'
import { TAG_COLOR_KEYS } from '../../../lib/types/Tag'
import { users } from './auth-schema'

export const BucketStatus = pgEnum('bucket_status', ['active', 'pending_migration', 'archived'])
export const BucketTypeEnum = pgEnum('bucket_type', ['inbox', 'yearly', 'monthly', 'weekly', 'daily'])
export const CategoryColorKeyEnum = pgEnum('category_color_key', CATEGORY_COLOR_KEYS)
export const TagColorKeyEnum = pgEnum('tag_color_key', TAG_COLOR_KEYS)

export const buckets = pgTable(
  'buckets',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    period: text().notNull(),
    type: BucketTypeEnum().notNull(),
    status: BucketStatus().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    check('buckets_inbox_period_check', sql`${table.type} <> 'inbox' OR ${table.period} = 'inbox'`),
    uniqueIndex('buckets_user_id_type_period_unique').on(table.userId, table.type, table.period),
    uniqueIndex('buckets_user_id_inbox_unique')
      .on(table.userId)
      .where(sql`${table.type} = 'inbox'`),
  ],
)

export const categories = pgTable(
  'categories',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    colorKey: CategoryColorKeyEnum('color_key').notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [uniqueIndex('categories_user_id_name_unique').on(table.userId, table.name)],
)

export const todos = pgTable(
  'todos',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: text().notNull(),
    description: text().notNull(),
    completed: boolean().notNull(),
    position: integer().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    bucketId: integer('bucket_id')
      .references(() => buckets.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [index('todos_user_id_bucket_id_position_idx').on(table.userId, table.bucketId, table.position)],
)

export const tags = pgTable(
  'tags',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    colorKey: TagColorKeyEnum('color_key').notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [uniqueIndex('tags_user_id_name_unique').on(table.userId, table.name)],
)

export const todoTags = pgTable(
  'todo_tags',
  {
    todoId: integer('todo_id')
      .references(() => todos.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: integer('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [uniqueIndex('todo_tags_todo_id_tag_id_unique').on(table.todoId, table.tagId)],
)

export const todosRelations = relations(todos, ({ many, one }) => ({
  bucket: one(buckets, {
    fields: [todos.bucketId],
    references: [buckets.id],
  }),
  category: one(categories, {
    fields: [todos.categoryId],
    references: [categories.id],
  }),
  todoTags: many(todoTags),
}))

export const bucketsRelations = relations(buckets, ({ many }) => ({
  todos: many(todos),
}))

export const categoriesRelations = relations(categories, ({ many }) => ({
  todos: many(todos),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  todoTags: many(todoTags),
}))

export const todoTagsRelations = relations(todoTags, ({ one }) => ({
  tag: one(tags, {
    fields: [todoTags.tagId],
    references: [tags.id],
  }),
  todo: one(todos, {
    fields: [todoTags.todoId],
    references: [todos.id],
  }),
}))
