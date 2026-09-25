import { and, asc, eq, exists, inArray, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { alias } from 'drizzle-orm/pg-core'

import type { TagDisplay } from '@/lib/types/Tag'
import { errorResponse } from '@/server/core/errors'
import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import type { Database } from '@/server/db/client'
import { users } from '@/server/db/schema/auth-schema'
import { buckets, categories, tags, todoTags, todos } from '@/server/db/schema/schema'
import { TODO_POSITION_GAP } from '@/server/functions/todos/operations'
import type { TodoPositionPatch, TodoRepository } from '@/server/functions/todos/operations'

const displayColumns = { colorKey: true, id: true, name: true } as const

/**
 * Production Todo repository. Guarded single writes and transactions re-check ownership and stale state at write
 * time. Transactions lock the rows their plans depend on under `READ COMMITTED`.
 */
export function createTodoRepository(db: Database): TodoRepository {
  // Correlated guard: the Bucket exists, belongs to the User, and is active.
  const isActiveBucket = (userId: string, bucketId: AnyPgColumn | number) =>
    exists(
      db
        .select({ id: buckets.id })
        .from(buckets)
        .where(and(eq(buckets.id, bucketId), eq(buckets.userId, userId), eq(buckets.status, 'active'))),
    )

  // Appends after the Bucket's current last Todo, evaluated inside the write that uses it.
  const endOfBucket = (userId: string, bucketId: number): SQL => {
    const bucketTodos = alias(todos, 'bucket_todos')

    return sql`(${db
      .select({ position: sql`coalesce(max(${bucketTodos.position}), 0) + ${TODO_POSITION_GAP}` })
      .from(bucketTodos)
      .where(and(eq(bucketTodos.userId, userId), eq(bucketTodos.bucketId, bucketId)))})`
  }

  return {
    async createTodo(command) {
      const values = {
        bucketId: command.bucketId,
        categoryId: command.categoryId,
        completed: false,
        createdAt: command.createdAt,
        description: command.description,
        position: endOfBucket(command.userId, command.bucketId),
        title: command.title,
        userId: command.userId,
      }

      return db.transaction(async (tx) => {
        await guardTodoWrite(tx, command.userId)
        // Every append shares the Bucket lock with rebalances, including tagless creation.
        const bucket = firstRow(
          await tx
            .select({ id: buckets.id })
            .from(buckets)
            .where(
              and(eq(buckets.id, command.bucketId), eq(buckets.userId, command.userId), eq(buckets.status, 'active')),
            )
            .for('update'),
        )
        const ownedCategory = await lockOwnedCategory(tx, command.userId, command.categoryId)
        const ownedTags = await lockOwnedTags(tx, command.userId, command.tagIds)

        if (!bucket || !ownedCategory || ownedTags.length !== command.tagIds.length) {
          return undefined
        }

        const [todo] = await tx.insert(todos).values(values).returning()
        if (command.tagIds.length > 0) {
          await tx.insert(todoTags).values(command.tagIds.map((tagId) => ({ tagId, todoId: todo.id })))
        }

        return todo
      })
    },
    async deleteTodo(userId, todoId) {
      return db.transaction(async (tx) => {
        await guardTodoWrite(tx, userId)
        const source = await findTodoBucket(tx, userId, todoId)

        if (!source) {
          return undefined
        }

        if (source.status !== 'active') {
          throw errorResponse(409, 'Cannot delete a Todo from an archived or pending migration Bucket')
        }

        const [deletedTodo] = await tx
          .delete(todos)
          .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
          .returning({ previousBucketId: todos.bucketId, todoId: todos.id })
        return deletedTodo
      })
    },
    async findActiveBucket(userId, bucketId) {
      const bucket = firstRow(
        await db
          .select({ id: buckets.id })
          .from(buckets)
          .where(and(eq(buckets.id, bucketId), eq(buckets.userId, userId), eq(buckets.status, 'active'))),
      )

      return bucket
    },
    async findCategory(userId, categoryId) {
      const category = firstRow(
        await db
          .select({ colorKey: categories.colorKey, id: categories.id, name: categories.name })
          .from(categories)
          .where(and(eq(categories.id, categoryId), eq(categories.userId, userId))),
      )

      return category
    },
    findTags(userId, tagIds) {
      return db
        .select({ colorKey: tags.colorKey, id: tags.id, name: tags.name })
        .from(tags)
        .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)))
    },
    async findTodo(userId, todoId) {
      const todo = await db.query.todos.findFirst({
        where: and(eq(todos.id, todoId), eq(todos.userId, userId)),
        with: {
          bucket: { columns: { status: true } },
          category: { columns: displayColumns },
          todoTags: { with: { tag: { columns: displayColumns } } },
        },
      })

      if (!todo) {
        return undefined
      }

      const { bucket, todoTags: todoTagRows, ...todoRow } = todo

      return { ...todoRow, bucketStatus: bucket.status, tags: sortTags(todoTagRows.map(({ tag }) => tag)) }
    },
    hasPendingMigrationBuckets(userId) {
      return hasPendingMigrationBuckets(db, userId)
    },
    listPositions(userId, bucketId) {
      return db
        .select({ bucketId: todos.bucketId, id: todos.id, position: todos.position })
        .from(todos)
        .where(and(eq(todos.userId, userId), eq(todos.bucketId, bucketId)))
        .orderBy(asc(todos.position), asc(todos.id))
    },
    async listTodos(userId, bucketId) {
      const bucketTodos = await db.query.todos.findMany({
        columns: { userId: false },
        orderBy: [asc(todos.position), asc(todos.id)],
        where: and(eq(todos.bucketId, bucketId), eq(todos.userId, userId)),
        with: {
          category: { columns: displayColumns },
          todoTags: { with: { tag: { columns: displayColumns } } },
        },
      })

      return bucketTodos.map(({ todoTags: todoTagRows, ...todo }) => ({
        ...todo,
        tags: sortTags(todoTagRows.map(({ tag }) => tag)),
      }))
    },
    async moveTodo(move) {
      const movedTodoGuards = and(
        eq(todos.id, move.todoId),
        eq(todos.userId, move.userId),
        eq(todos.bucketId, move.source.bucketId),
        eq(todos.position, move.source.position),
        isActiveBucket(move.userId, move.source.bucketId),
        isActiveBucket(move.userId, move.targetBucketId),
      )

      return db.transaction(async (tx) => {
        await guardTodoWrite(tx, move.userId)
        // All appends and moves lock their Buckets first, then Todo rows in ID order.
        await tx
          .select({ id: buckets.id })
          .from(buckets)
          .where(and(eq(buckets.userId, move.userId), inArray(buckets.id, [move.source.bucketId, move.targetBucketId])))
          .orderBy(asc(buckets.id))
          .for('update')
        const lockedTodos = await tx
          .select({ bucketId: todos.bucketId, id: todos.id, position: todos.position })
          .from(todos)
          .where(
            and(eq(todos.userId, move.userId), or(eq(todos.bucketId, move.targetBucketId), eq(todos.id, move.todoId))),
          )
          .orderBy(asc(todos.id))
          .for('update')
        const guardedTodo = firstRow(await tx.select({ id: todos.id }).from(todos).where(movedTodoGuards))
        const currentTargetTodos = lockedTodos
          .filter((todo) => todo.id !== move.todoId && todo.bucketId === move.targetBucketId)
          .toSorted((left, right) => left.position - right.position || left.id - right.id)

        if (!guardedTodo || !arePositionsEqual(currentTargetTodos, move.expectedTargetTodos)) {
          return 'stale'
        }

        for (const rebalanced of move.kind === 'rebalance' ? move.rebalanced : []) {
          await tx
            .update(todos)
            .set({ position: rebalanced.position })
            .where(and(eq(todos.id, rebalanced.id), eq(todos.userId, move.userId)))
        }

        // The moved Todo is locked and guarded above, so this update always returns its row.
        const [movedTodo] = await tx
          .update(todos)
          .set({ bucketId: move.targetBucketId, position: move.position })
          .where(and(eq(todos.id, move.todoId), eq(todos.userId, move.userId)))
          .returning()

        return movedTodo
      })
    },
    async updateTodo(command) {
      const { destination, tagIds } = command
      const changes = {
        ...command.changes,
        ...(destination && {
          bucketId: destination.bucketId,
          position: endOfBucket(command.userId, destination.bucketId),
        }),
      }
      const guards = and(
        eq(todos.id, command.todoId),
        eq(todos.userId, command.userId),
        isActiveBucket(command.userId, todos.bucketId),
        destination && eq(todos.bucketId, destination.expectedBucketId),
        destination && isActiveBucket(command.userId, destination.bucketId),
      )
      const hasChanges = Object.keys(changes).length > 0

      return db.transaction(async (tx) => {
        await guardTodoWrite(tx, command.userId)
        if (tagIds === undefined && !destination && command.changes.categoryId === undefined) {
          const todo = firstRow(
            hasChanges
              ? await tx.update(todos).set(changes).where(guards).returning()
              : await tx.select().from(todos).where(guards),
          )

          return todo && { previousBucketId: todo.bucketId, todo }
        }

        const currentBucketId =
          command.destination?.expectedBucketId ??
          firstRow(
            await tx
              .select({ bucketId: todos.bucketId })
              .from(todos)
              .where(and(eq(todos.id, command.todoId), eq(todos.userId, command.userId))),
          )?.bucketId
        if (currentBucketId === undefined) {
          return undefined
        }
        await tx
          .select({ id: buckets.id })
          .from(buckets)
          .where(
            and(
              eq(buckets.userId, command.userId),
              inArray(buckets.id, [currentBucketId, destination?.bucketId ?? currentBucketId]),
            ),
          )
          .orderBy(asc(buckets.id))
          .for('update')
        // Locking the Todo makes concurrent Tag replacements apply in order.
        const currentTodo = firstRow(await tx.select().from(todos).where(guards).for('update'))
        const ownedCategory = await lockOwnedCategory(tx, command.userId, command.changes.categoryId)
        const ownedTags = await lockOwnedTags(tx, command.userId, tagIds ?? [])

        if (!currentTodo || !ownedCategory || (tagIds !== undefined && ownedTags.length !== tagIds.length)) {
          return undefined
        }

        const [todo] = hasChanges
          ? await tx
              .update(todos)
              .set(changes)
              .where(and(eq(todos.id, command.todoId), eq(todos.userId, command.userId)))
              .returning()
          : [currentTodo]
        if (tagIds !== undefined) {
          await tx.delete(todoTags).where(eq(todoTags.todoId, command.todoId))
          if (tagIds.length > 0) {
            await tx.insert(todoTags).values(tagIds.map((tagId) => ({ tagId, todoId: command.todoId })))
          }
        }

        return { previousBucketId: currentTodo.bucketId, todo }
      })
    },
  }
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

async function guardTodoWrite(tx: Transaction, userId: string) {
  // Lifecycle locks the User row before it reads and retires Buckets.
  const user = (await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')).at(0)

  if (!user) {
    throw errorResponse(404, 'User not found')
  }

  const pendingBuckets = await tx
    .select({ id: buckets.id })
    .from(buckets)
    .where(and(eq(buckets.userId, userId), eq(buckets.status, 'pending_migration')))
    .limit(1)

  if (pendingBuckets.length > 0) {
    throw errorResponse(409, 'Migration is required before changing Todos')
  }
}

async function findTodoBucket(tx: Transaction, userId: string, todoId: number) {
  return firstRow(
    await tx
      .select({ bucketId: todos.bucketId, status: buckets.status })
      .from(todos)
      .innerJoin(buckets, eq(todos.bucketId, buckets.id))
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId), eq(buckets.userId, userId))),
  )
}

async function lockOwnedCategory(tx: Transaction, userId: string, categoryId: number | null | undefined) {
  if (categoryId == null) {
    return true
  }
  const category = firstRow(
    await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .for('share'),
  )
  return Boolean(category)
}

// Share-locks the owned Tags so none can be deleted before the Todo-Tag rows referencing them commit.
function lockOwnedTags(tx: Transaction, userId: string, tagIds: Array<number>) {
  if (tagIds.length === 0) {
    return Promise.resolve([])
  }

  return tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)))
    .for('share')
}

function firstRow<T>(rows: Array<T>): T | undefined {
  return rows.at(0)
}

function arePositionsEqual(current: Array<TodoPositionPatch>, expected: Array<TodoPositionPatch>) {
  return (
    current.length === expected.length &&
    current.every(
      (todo, index) =>
        todo.id === expected[index].id &&
        todo.bucketId === expected[index].bucketId &&
        todo.position === expected[index].position,
    )
  )
}

function sortTags(tagDisplays: Array<TagDisplay>) {
  return tagDisplays.toSorted((left, right) => left.name.localeCompare(right.name) || left.id - right.id)
}
