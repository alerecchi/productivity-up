import type { CategoryDisplay } from '@/lib/types/Category'
import type { TagDisplay } from '@/lib/types/Tag'
import type { Todo } from '@/lib/types/Todo'
import type { BucketDb, TodoDbSelect } from '@/server/db/types'
import { TODO_POSITION_GAP } from '@/server/functions/todos/operations'
import type { TodoPositionPatch, TodoRepository } from '@/server/functions/todos/operations'

type Owned<T> = T & { userId: string }

export type InMemoryTodoState = {
  buckets: Array<Pick<BucketDb, 'id' | 'status' | 'userId'>>
  categories: Array<Owned<CategoryDisplay>>
  tags: Array<Owned<TagDisplay>>
  todoTags: Array<{ tagId: number; todoId: number }>
  todos: Array<TodoDbSelect>
}

/**
 * In-memory stand-in for the production Todo repository. Each write models the guards of its SQL statement or
 * transaction: it re-checks ownership, Bucket status, and expected positions, then writes everything or nothing.
 */
export function createInMemoryTodoRepository(initialState: Partial<InMemoryTodoState> = {}) {
  const state: InMemoryTodoState = {
    buckets: [],
    categories: [],
    tags: [],
    todoTags: [],
    todos: [],
    ...structuredClone(initialState),
  }
  let nextTodoId = Math.max(0, ...state.todos.map((todo) => todo.id)) + 1

  const isActiveBucket = (userId: string, bucketId: number) =>
    state.buckets.some((bucket) => bucket.id === bucketId && bucket.userId === userId && bucket.status === 'active')
  const findOwnedTodo = (userId: string, todoId: number) =>
    state.todos.find((todo) => todo.id === todoId && todo.userId === userId)
  const ownsCategory = (userId: string, categoryId: number | null | undefined) =>
    categoryId === null ||
    categoryId === undefined ||
    state.categories.some((category) => category.id === categoryId && category.userId === userId)
  const ownsTags = (userId: string, tagIds: Array<number>) =>
    tagIds.every((tagId) => state.tags.some((tag) => tag.id === tagId && tag.userId === userId))
  const nextPosition = (userId: string, bucketId: number) =>
    Math.max(
      0,
      ...state.todos
        .filter((todo) => todo.userId === userId && todo.bucketId === bucketId)
        .map((todo) => todo.position),
    ) + TODO_POSITION_GAP
  const listPositions = (userId: string, bucketId: number): Array<TodoPositionPatch> =>
    state.todos
      .filter((todo) => todo.userId === userId && todo.bucketId === bucketId)
      .toSorted((left, right) => left.position - right.position || left.id - right.id)
      .map(({ bucketId: todoBucketId, id, position }) => ({ bucketId: todoBucketId, id, position }))
  const tagsOf = (todoId: number) =>
    state.todoTags
      .filter((todoTag) => todoTag.todoId === todoId)
      .map((todoTag) => toTagDisplay(state.tags.find((tag) => tag.id === todoTag.tagId)!))
      .toSorted((left, right) => left.name.localeCompare(right.name) || left.id - right.id)
  const categoryOf = (categoryId: number | null) => {
    const category = state.categories.find((storedCategory) => storedCategory.id === categoryId)
    return category ? toCategoryDisplay(category) : null
  }
  const replaceTags = (todoId: number, tagIds: Array<number>) => {
    state.todoTags = [
      ...state.todoTags.filter((todoTag) => todoTag.todoId !== todoId),
      ...tagIds.map((tagId) => ({ tagId, todoId })),
    ]
  }

  const repository: TodoRepository = {
    createTodo(command) {
      if (
        !isActiveBucket(command.userId, command.bucketId) ||
        !ownsCategory(command.userId, command.categoryId) ||
        !ownsTags(command.userId, command.tagIds)
      ) {
        return Promise.resolve(undefined)
      }

      const todo: TodoDbSelect = {
        bucketId: command.bucketId,
        categoryId: command.categoryId,
        completed: false,
        createdAt: command.createdAt,
        description: command.description,
        id: nextTodoId,
        position: nextPosition(command.userId, command.bucketId),
        title: command.title,
        userId: command.userId,
      }
      nextTodoId += 1
      state.todos.push(todo)
      replaceTags(todo.id, command.tagIds)

      return Promise.resolve({ ...todo })
    },
    deleteTodo(userId, todoId) {
      const todo = findOwnedTodo(userId, todoId)

      if (!todo || !isActiveBucket(userId, todo.bucketId)) {
        return Promise.resolve(undefined)
      }

      state.todos = state.todos.filter((storedTodo) => storedTodo.id !== todoId)
      state.todoTags = state.todoTags.filter((todoTag) => todoTag.todoId !== todoId)

      return Promise.resolve({ previousBucketId: todo.bucketId, todoId })
    },
    findActiveBucket(userId, bucketId) {
      return Promise.resolve(isActiveBucket(userId, bucketId) ? { id: bucketId } : undefined)
    },
    findCategory(userId, categoryId) {
      const category = state.categories.find(
        (storedCategory) => storedCategory.id === categoryId && storedCategory.userId === userId,
      )
      return Promise.resolve(category ? toCategoryDisplay(category) : undefined)
    },
    findTags(userId, tagIds) {
      return Promise.resolve(
        state.tags.filter((tag) => tag.userId === userId && tagIds.includes(tag.id)).map(toTagDisplay),
      )
    },
    findTodo(userId, todoId) {
      const todo = findOwnedTodo(userId, todoId)

      if (!todo) {
        return Promise.resolve(undefined)
      }

      const bucket = state.buckets.find((storedBucket) => storedBucket.id === todo.bucketId)!

      return Promise.resolve({
        ...todo,
        bucketStatus: bucket.status,
        category: categoryOf(todo.categoryId),
        tags: tagsOf(todo.id),
      })
    },
    hasPendingMigrationBuckets(userId) {
      return Promise.resolve(
        state.buckets.some((bucket) => bucket.userId === userId && bucket.status === 'pending_migration'),
      )
    },
    listPositions(userId, bucketId) {
      return Promise.resolve(listPositions(userId, bucketId))
    },
    listTodos(userId, bucketId) {
      return Promise.resolve(
        listPositions(userId, bucketId).map(({ id }) => {
          const todo = findOwnedTodo(userId, id)!
          return toTodo(todo, categoryOf(todo.categoryId), tagsOf(todo.id))
        }),
      )
    },
    moveTodo(move) {
      const todo = findOwnedTodo(move.userId, move.todoId)

      if (
        !todo ||
        todo.bucketId !== move.source.bucketId ||
        todo.position !== move.source.position ||
        !isActiveBucket(move.userId, move.source.bucketId) ||
        !isActiveBucket(move.userId, move.targetBucketId)
      ) {
        return Promise.resolve('stale')
      }

      const currentTargetTodos = listPositions(move.userId, move.targetBucketId).filter(({ id }) => id !== todo.id)
      const isCurrent = (expected: TodoPositionPatch) =>
        currentTargetTodos.some(
          (current) =>
            current.id === expected.id &&
            current.bucketId === expected.bucketId &&
            current.position === expected.position,
        )
      const isGuardSatisfied =
        move.expectedTargetTodos.length === currentTargetTodos.length && move.expectedTargetTodos.every(isCurrent)

      if (!isGuardSatisfied) {
        return Promise.resolve('stale')
      }

      for (const rebalanced of move.kind === 'rebalance' ? move.rebalanced : []) {
        findOwnedTodo(move.userId, rebalanced.id)!.position = rebalanced.position
      }

      todo.bucketId = move.targetBucketId
      todo.position = move.position

      return Promise.resolve({ ...todo })
    },
    updateTodo(command) {
      const todo = findOwnedTodo(command.userId, command.todoId)

      if (
        !todo ||
        !isActiveBucket(command.userId, todo.bucketId) ||
        !ownsCategory(command.userId, command.changes.categoryId) ||
        (command.tagIds !== undefined && !ownsTags(command.userId, command.tagIds)) ||
        (command.destination !== undefined &&
          (todo.bucketId !== command.destination.expectedBucketId ||
            !isActiveBucket(command.userId, command.destination.bucketId)))
      ) {
        return Promise.resolve(undefined)
      }

      const previousBucketId = todo.bucketId

      if (command.destination) {
        todo.position = nextPosition(command.userId, command.destination.bucketId)
        todo.bucketId = command.destination.bucketId
      }

      Object.assign(todo, command.changes)

      if (command.tagIds !== undefined) {
        replaceTags(todo.id, command.tagIds)
      }

      return Promise.resolve({ previousBucketId, todo: { ...todo } })
    },
  }

  return { repository, state }
}

function toTodo(todo: TodoDbSelect, category: CategoryDisplay | null, tags: Array<TagDisplay>): Todo {
  const { userId: _userId, ...canonicalTodo } = todo
  return { ...canonicalTodo, category, tags }
}

function toCategoryDisplay({ colorKey, id, name }: CategoryDisplay): CategoryDisplay {
  return { colorKey, id, name }
}

function toTagDisplay({ colorKey, id, name }: TagDisplay): TagDisplay {
  return { colorKey, id, name }
}
