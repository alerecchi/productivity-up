import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PUBLIC_OPERATION_NAMES, VERIFIED_USER_OPERATION_NAMES } from '@/server/functions/operation-inventory'

describe('server function operation inventory', () => {
  it('keeps every declared server function on a shared preset with an explicit method, input, and response', () => {
    const areas = {
      auth: { count: 1, preset: 'createPublicMiddleware' },
      board: { count: 5, preset: 'createVerifiedUserMiddleware' },
      categories: { count: 4, preset: 'createVerifiedUserMiddleware' },
      tags: { count: 4, preset: 'createVerifiedUserMiddleware' },
      todos: { count: 5, preset: 'createVerifiedUserMiddleware' },
    } as const
    const operationNames: Array<string> = []

    for (const [area, { count, preset }] of Object.entries(areas)) {
      const source = readFileSync(join(process.cwd(), 'src/server/functions', area, 'index.ts'), 'utf8')
      expect(source.match(/createServerFn\(\{ method: '(?:GET|POST)' \}\)/g)).toHaveLength(count)
      expect(source.match(new RegExp(`${preset}\\(\\{`, 'g'))).toHaveLength(count)
      expect(source.match(/\.validator\(validateInput\(/g)).toHaveLength(count)
      expect(source.match(/Promise<z\.output<typeof \w+Response>>/g)).toHaveLength(count)
      operationNames.push(...[...source.matchAll(/operation: '([^']+)'/g)].map((match) => match[1]))
    }

    expect(operationNames).toEqual([...PUBLIC_OPERATION_NAMES, ...VERIFIED_USER_OPERATION_NAMES])
  })
})
