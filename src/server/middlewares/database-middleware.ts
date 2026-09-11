import { createMiddleware } from '@tanstack/react-start'

import { connectDatabase } from '@/server/db/client'

export const databaseMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const connection = await connectDatabase()

  try {
    return await next({ context: { db: connection.db } })
  } finally {
    await connection.close()
  }
})
