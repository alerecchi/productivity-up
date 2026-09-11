const fullShaPattern = /^[0-9a-f]{40}$/i
const versionTagPattern = /^main-([0-9a-f]{12})$/i
const versionMessagePattern = /^main ([0-9a-f]{40})$/i

export function parseLiveDeploymentMetadata(deploymentOutput, versionsOutput) {
  const deployment = parseJson(deploymentOutput, 'deployment status')
  const versions = parseJson(versionsOutput, 'version list')

  if (!deployment || !Array.isArray(deployment.versions)) {
    throw new Error('Cloudflare deployment status has no live version list.')
  }

  const liveVersions = deployment.versions.filter(
    (version) => typeof version?.percentage === 'number' && version.percentage > 0,
  )
  if (liveVersions.length !== 1 || liveVersions[0].percentage !== 100) {
    throw new Error('Cloudflare deployment status does not identify one live version at 100% traffic.')
  }

  const versionId = liveVersions[0].version_id
  if (typeof versionId !== 'string' || versionId.length === 0) {
    throw new Error('Cloudflare deployment status has a malformed live version ID.')
  }
  if (!Array.isArray(versions)) {
    throw new Error('Cloudflare version list is not an array.')
  }

  const matchingVersions = versions.filter((version) => version?.id === versionId)
  if (matchingVersions.length !== 1) {
    throw new Error('Cloudflare version list does not contain exactly one matching live version.')
  }

  const annotations = matchingVersions[0].annotations
  const tag = annotations?.['workers/tag']
  const message = annotations?.['workers/message']
  const tagMatch = typeof tag === 'string' ? tag.match(versionTagPattern) : null
  const messageMatch = typeof message === 'string' ? message.match(versionMessagePattern) : null

  if (!tagMatch || !messageMatch || !fullShaPattern.test(messageMatch[1])) {
    throw new Error('The live Cloudflare version has missing or malformed source metadata.')
  }

  const sourceSha = messageMatch[1].toLowerCase()
  if (sourceSha.slice(0, 12) !== tagMatch[1].toLowerCase()) {
    throw new Error('The live Cloudflare version tag and message identify different source revisions.')
  }

  return { sourceSha, tag, versionId }
}

export function parseDeploymentArguments(arguments_) {
  const supported = new Set(['--allow-unstaged'])
  const unknown = arguments_.filter((argument) => !supported.has(argument))
  if (unknown.length > 0) {
    throw new Error(`Unknown deployment option: ${unknown.join(', ')}`)
  }

  return { allowUnstaged: arguments_.includes('--allow-unstaged') }
}

export async function decideProductionDeployment({ allowUnstaged, confirm, interactive, stagingSha, targetSha }) {
  if (stagingSha === targetSha) return true
  if (allowUnstaged) return true
  if (!interactive || !confirm) return false

  return (await confirm()) === true
}

export function isExplicitConfirmation(answer) {
  return ['y', 'yes'].includes(answer.trim().toLowerCase())
}

function parseJson(value, label) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`Wrangler returned malformed JSON for the ${label}.`)
  }
}
