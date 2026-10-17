//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import unusedImports from 'eslint-plugin-unused-imports'

export default [
  {
    ignores: ['.verify/**', 'eslint.config.js', 'src/config/env.d.ts', 'src/features/shared/components/ui/*'],
  },
  ...tanstackConfig,
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'import/order': 'off',
      'unused-imports/no-unused-imports': 'error',
    },
  },
]
