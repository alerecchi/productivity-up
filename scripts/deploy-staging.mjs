import { deployStaging } from './deployment/deployment-workflow.mjs'

try {
  await deployStaging()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
