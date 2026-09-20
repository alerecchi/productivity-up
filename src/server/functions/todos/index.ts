import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { createPrivateOperation, validateInput } from '@/server/core'
import { createTodoRepository } from '@/server/db/todo-repository'
import {
  createTodoForUser,
  deleteTodoForUser,
  getTodosForUser,
  moveTodoForUser,
  updateTodoForUser,
} from '@/server/functions/todos/operations'
import {
  CreateTodoInput,
  DeleteTodoInput,
  DeleteTodoResponse,
  GetTodosInput,
  MoveTodoInput,
  MoveTodoResponse,
  TodoResponse,
  TodosResponse,
  UpdateTodoInput,
} from '@/server/functions/todos/schemas'

export const createTodo = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'todos.create', response: TodoResponse })])
  .validator(validateInput(CreateTodoInput))
  .handler(async ({ data, context }): Promise<z.output<typeof TodoResponse>> => {
    return createTodoForUser({ data, repository: createTodoRepository(context.db), userId: context.user.id })
  })

export const getTodos = createServerFn({ method: 'GET' })
  .middleware([createPrivateOperation({ operation: 'todos.list', response: TodosResponse })])
  .validator(validateInput(GetTodosInput))
  .handler(async ({ data, context }): Promise<z.output<typeof TodosResponse>> => {
    return getTodosForUser({ data, repository: createTodoRepository(context.db), userId: context.user.id })
  })

export const updateTodo = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'todos.update', response: TodoResponse })])
  .validator(validateInput(UpdateTodoInput))
  .handler(async ({ data, context }): Promise<z.output<typeof TodoResponse>> => {
    return updateTodoForUser({ data, repository: createTodoRepository(context.db), userId: context.user.id })
  })

export const moveTodo = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'todos.move', response: MoveTodoResponse })])
  .validator(validateInput(MoveTodoInput))
  .handler(async ({ data, context }): Promise<z.output<typeof MoveTodoResponse>> => {
    return moveTodoForUser({ data, repository: createTodoRepository(context.db), userId: context.user.id })
  })

export const deleteTodo = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'todos.delete', response: DeleteTodoResponse })])
  .validator(validateInput(DeleteTodoInput))
  .handler(async ({ data, context }): Promise<z.output<typeof DeleteTodoResponse>> => {
    return deleteTodoForUser({ data, repository: createTodoRepository(context.db), userId: context.user.id })
  })
