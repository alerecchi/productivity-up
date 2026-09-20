import { and, asc, eq, inArray, max } from 'drizzle-orm'

import { hasPendingMigrationBuckets } from '@/server/db/buckets'
import type { Database } from '@/server/db/client'
import { buckets, categories, tags, todoTags, todos } from '@/server/db/schema/schema'
import type { TagDbSelect, TodoDbInsert } from '@/server/db/types'
import type { TodoRepository } from '@/server/functions/todos/operations'

export function createTodoRepository(db: Database): TodoRepository {
  return {
    async createTodo(todoToAdd: TodoDbInsert) {
      const [newTodo] = await db.insert(todos).values(todoToAdd).returning()
      return newTodo
    },
    async deleteTodo(todoId: number, userId: string) {
      const [deletedTodo] = await db
        .delete(todos)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
        .returning({ bucketId: todos.bucketId, todoId: todos.id })
      return deletedTodo
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
      const sourceBucket = await db.query.buckets.findFirst({
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
        return { status: 'conflict' }
      }

      const targetBucket = await db.query.buckets.findFirst({
        columns: {
          id: true,
        },
        where: and(eq(buckets.id, move.bucketId), eq(buckets.userId, userId), eq(buckets.status, 'active')),
      })

      if (!targetBucket) {
        return { status: 'conflict' }
      }

      const currentTargetTodoPositions = (
        await db.query.todos.findMany({
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
        return { status: 'conflict' }
      }

      for (const todoPosition of move.rebalancedTodoPositions) {
        const expectedTodoPosition = move.expectedTargetTodoPositions.find((todo) => todo.id === todoPosition.id)

        if (!expectedTodoPosition) {
          return { status: 'conflict' }
        }

        const updatedTodoPositions = await db
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
          return { status: 'conflict' }
        }
      }

      const updatedTodos = await db
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
        return { status: 'conflict' }
      }

      return {
        status: 'moved',
        todo: updatedTodos[0],
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
      const [updatedTodo] = await db
        .update(todos)
        .set(updates)
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
        .returning()
      return updatedTodo
    },
  }
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
