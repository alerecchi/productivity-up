import { and, asc, eq, inArray, max } from 'drizzle-orm'
import { TransactionRollbackError } from 'drizzle-orm/errors'

import { errorResponse } from '@/server/core/errors'
import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import type { Database } from '@/server/db/client'
import { users } from '@/server/db/schema/auth-schema'
import { buckets, categories, tags, todoTags, todos } from '@/server/db/schema/schema'
import type { TagDbSelect, TodoDbInsert } from '@/server/db/types'
import type { TodoRepository } from '@/server/functions/todos/operations'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export function createTodoRepository(db: Database): TodoRepository {
  return {
    async createTodo(todoToAdd: TodoDbInsert) {
      return db.transaction(async (tx) => {
        await guardTodoWrite(tx, todoToAdd.userId)
        await requireActiveBucket(tx, todoToAdd.userId, todoToAdd.bucketId)

        const [newTodo] = await tx.insert(todos).values(todoToAdd).returning()
        return newTodo
      })
    },
    async deleteTodo(todoId: number, userId: string) {
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
          .returning({ bucketId: todos.bucketId, todoId: todos.id })
        return deletedTodo
      })
    },
    findOwnedActiveBucket(userId: string, bucketId: number) {
      return db.query.buckets.findFirst({
        where: and(eq(buckets.id, bucketId), eq(buckets.userId, userId), eq(buckets.status, 'active')),
      })
    },
    findOwnedCategory(userId: string, categoryId: number) {
      return db.query.categories.findFirst({
        where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
      })
    },
    findOwnedTags(userId: string, tagIds: Array<number>) {
      return db.query.tags.findMany({
        where: and(eq(tags.userId, userId), inArray(tags.id, tagIds)),
      })
    },
    async findOwnedTodoWithBucket(userId: string, todoId: number) {
      const todo = await db.query.todos.findFirst({
        where: and(eq(todos.id, todoId), eq(todos.userId, userId)),
        with: {
          bucket: true,
          category: true,
          todoTags: {
            with: {
              tag: true,
            },
          },
        },
      })

      return todo ? withTags(todo) : undefined
    },
    async getMaxTodoPosition(userId: string, bucketId: number) {
      const [row] = await db
        .select({ position: max(todos.position) })
        .from(todos)
        .where(and(eq(todos.userId, userId), eq(todos.bucketId, bucketId)))

      return row.position ?? null
    },
    async getTodosByBucketForUser(userId: string, bucketId: number) {
      const bucketTodos = await db.query.todos.findMany({
        orderBy: [asc(todos.position), asc(todos.id)],
        where: and(eq(todos.bucketId, bucketId), eq(todos.userId, userId)),
        with: {
          category: {
            columns: {
              colorKey: true,
              id: true,
              name: true,
            },
          },
          todoTags: {
            with: {
              tag: {
                columns: {
                  colorKey: true,
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })

      return bucketTodos.map(withTags)
    },
    hasPendingMigrationBuckets(userId) {
      return hasPendingMigrationBuckets(db, userId)
    },
    async moveTodo(todoId, userId, move) {
      try {
        return await db.transaction(async (tx) => {
          await guardTodoWrite(tx, userId)

          const sourceBucket = await tx.query.buckets.findFirst({
            columns: {
              id: true,
            },
            where: and(
              eq(buckets.id, move.expectedSourceBucketId),
              eq(buckets.userId, userId),
              eq(buckets.status, 'active'),
            ),
          })

          if (!sourceBucket) {
            return { status: 'conflict' } as const
          }

          const targetBucket = await tx.query.buckets.findFirst({
            columns: {
              id: true,
            },
            where: and(eq(buckets.id, move.bucketId), eq(buckets.userId, userId), eq(buckets.status, 'active')),
          })

          if (!targetBucket) {
            return { status: 'conflict' } as const
          }

          const currentTargetTodoPositions = (
            await tx.query.todos.findMany({
              columns: {
                bucketId: true,
                id: true,
                position: true,
              },
              orderBy: [asc(todos.position), asc(todos.id)],
              where: and(eq(todos.bucketId, move.bucketId), eq(todos.userId, userId)),
            })
          ).filter((todo) => todo.id !== todoId)

          if (!areTodoPositionsEqual(currentTargetTodoPositions, move.expectedTargetTodoPositions)) {
            return { status: 'conflict' } as const
          }

          for (const todoPosition of move.rebalancedTodoPositions) {
            const expectedTodoPosition = move.expectedTargetTodoPositions.find((todo) => todo.id === todoPosition.id)

            if (!expectedTodoPosition) {
              throw new TransactionRollbackError()
            }

            const updatedTodoPositions = await tx
              .update(todos)
              .set({ position: todoPosition.position })
              .where(
                and(
                  eq(todos.id, todoPosition.id),
                  eq(todos.userId, userId),
                  eq(todos.bucketId, todoPosition.bucketId),
                  eq(todos.position, expectedTodoPosition.position),
                ),
              )
              .returning({ id: todos.id })

            if (updatedTodoPositions.length === 0) {
              throw new TransactionRollbackError()
            }
          }

          const updatedTodos = await tx
            .update(todos)
            .set({
              bucketId: move.bucketId,
              position: move.position,
            })
            .where(
              and(
                eq(todos.id, todoId),
                eq(todos.userId, userId),
                eq(todos.bucketId, move.expectedSourceBucketId),
                eq(todos.position, move.expectedMovedTodoPosition),
              ),
            )
            .returning()

          if (updatedTodos.length === 0) {
            throw new TransactionRollbackError()
          }

          return {
            status: 'moved' as const,
            todo: updatedTodos[0],
          }
        })
      } catch (error) {
        if (error instanceof TransactionRollbackError) {
          return { status: 'conflict' }
        }

        throw error
      }
    },
    async replaceTodoTags(todoId: number, userId: string, tagIds: Array<number>) {
      const ownedTodo = await db.query.todos.findFirst({
        columns: {
          id: true,
        },
        where: and(eq(todos.id, todoId), eq(todos.userId, userId)),
      })

      if (!ownedTodo) {
        return
      }

      await db.delete(todoTags).where(eq(todoTags.todoId, todoId))

      if (tagIds.length === 0) {
        return
      }

      await db.insert(todoTags).values(tagIds.map((tagId) => ({ tagId, todoId })))
    },
    async updateTodo(todoId: number, userId: string, updates: Partial<TodoDbInsert>) {
      return db.transaction(async (tx) => {
        await guardTodoWrite(tx, userId)
        const source = await findTodoBucket(tx, userId, todoId)

        if (!source) {
          return undefined
        }

        if (source.status !== 'active') {
          throw errorResponse(409, 'Cannot update a Todo in an archived or pending migration Bucket')
        }

        if (updates.bucketId !== undefined && updates.bucketId !== source.bucketId) {
          await requireActiveBucket(tx, userId, updates.bucketId)
        }

        const [updatedTodo] = await tx
          .update(todos)
          .set(updates)
          .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
          .returning()
        return updatedTodo
      })
    },
  }
}

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

async function requireActiveBucket(tx: Transaction, userId: string, bucketId: number) {
  const bucket = (
    await tx
      .select({ id: buckets.id })
      .from(buckets)
      .where(and(eq(buckets.id, bucketId), eq(buckets.userId, userId), eq(buckets.status, 'active')))
  ).at(0)

  if (!bucket) {
    throw errorResponse(404, 'Bucket not found, archived, or unauthorized')
  }
}

async function findTodoBucket(tx: Transaction, userId: string, todoId: number) {
  const todo = (
    await tx
      .select({ bucketId: todos.bucketId, status: buckets.status })
      .from(todos)
      .innerJoin(buckets, eq(todos.bucketId, buckets.id))
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId), eq(buckets.userId, userId)))
  ).at(0)

  return todo
}

function areTodoPositionsEqual(
  currentTodos: Array<{ bucketId: number; id: number; position: number }>,
  expectedTodos: Array<{ bucketId: number; id: number; position: number }>,
) {
  return (
    currentTodos.length === expectedTodos.length &&
    currentTodos.every((currentTodo, index) => {
      const expectedTodo = expectedTodos[index]

      return (
        currentTodo.bucketId === expectedTodo.bucketId &&
        currentTodo.id === expectedTodo.id &&
        currentTodo.position === expectedTodo.position
      )
    })
  )
}

function withTags<T extends { todoTags: Array<{ tag: Pick<TagDbSelect, 'colorKey' | 'id' | 'name'> }> }>(todo: T) {
  const { todoTags: todoTagRows, ...todoWithoutJoinRows } = todo

  return {
    ...todoWithoutJoinRows,
    tags: todoTagRows.map((todoTag) => todoTag.tag),
  }
}
