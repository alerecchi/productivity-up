import { parseDeploymentArguments } from './deployment/deployment-metadata.mjs'
import { deployProduction } from './deployment/deployment-workflow.mjs'

try {
  const { allowUnstaged } = parseDeploymentArguments(process.argv.slice(2))
  await deployProduction({ allowUnstaged })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
