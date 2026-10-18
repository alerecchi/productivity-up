/** Operations behind `createVerifiedUserMiddleware`. */
export const VERIFIED_USER_OPERATION_NAMES = [
  'board.get',
  'board.reconcileLifecycle',
  'board.completeDay',
  'board.getMigrationStep',
  'board.confirmMigrationStep',
  'categories.create',
  'categories.list',
  'categories.update',
  'categories.delete',
  'tags.create',
  'tags.list',
  'tags.update',
  'tags.delete',
  'todos.create',
  'todos.list',
  'todos.update',
  'todos.move',
  'todos.delete',
] as const

/** Operations behind `createPublicMiddleware`, callable signed in or not. */
export const PUBLIC_OPERATION_NAMES = ['auth.getSession'] as const
