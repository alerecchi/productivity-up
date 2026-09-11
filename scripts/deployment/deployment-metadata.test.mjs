import { describe, expect, it } from 'vitest'

import {
  decideProductionDeployment,
  isExplicitConfirmation,
  parseDeploymentArguments,
  parseLiveDeploymentMetadata,
} from './deployment-metadata.mjs'

const targetSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const otherSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const versionId = '11111111-2222-3333-4444-555555555555'

function deploymentJson(versions = [{ percentage: 100, version_id: versionId }]) {
  return JSON.stringify({
    created_on: '2026-09-11T12:00:00.000Z',
    versions,
  })
}

function versionsJson(sourceSha = targetSha, overrides = {}) {
  return JSON.stringify([
    {
      annotations: {
        'workers/message': `main ${sourceSha}`,
        'workers/tag': `main-${sourceSha.slice(0, 12)}`,
        ...overrides,
      },
      id: versionId,
    },
  ])
}

describe('parseLiveDeploymentMetadata', () => {
  it('returns the source revision receiving all staging traffic', () => {
    expect(parseLiveDeploymentMetadata(deploymentJson(), versionsJson())).toEqual({
      sourceSha: targetSha,
      tag: `main-${targetSha.slice(0, 12)}`,
      versionId,
    })
  })

  it('returns a different valid source revision for mismatch handling', () => {
    expect(parseLiveDeploymentMetadata(deploymentJson(), versionsJson(otherSha)).sourceSha).toBe(otherSha)
  })

  it('rejects missing live deployment metadata', () => {
    expect(() => parseLiveDeploymentMetadata('{}', '[]')).toThrow('live version')
  })

  it.each([
    ['invalid JSON', '{', '[]'],
    ['split traffic', deploymentJson([{ percentage: 50, version_id: versionId }]), versionsJson()],
    ['missing source message', deploymentJson(), versionsJson(targetSha, { 'workers/message': '' })],
    ['inconsistent tag', deploymentJson(), versionsJson(targetSha, { 'workers/tag': 'main-cccccccccccc' })],
  ])('rejects malformed metadata: %s', (_case, deployments, versions) => {
    expect(() => parseLiveDeploymentMetadata(deployments, versions)).toThrow()
  })
})

describe('production staging gate', () => {
  it('continues when staging and main@origin match', async () => {
    await expect(
      decideProductionDeployment({
        allowUnstaged: false,
        interactive: false,
        stagingSha: targetSha,
        targetSha,
      }),
    ).resolves.toBe(true)
  })

  it('cancels a mismatch by default without prompting in a non-interactive environment', async () => {
    let prompted = false
    await expect(
      decideProductionDeployment({
        allowUnstaged: false,
        confirm: async () => {
          prompted = true
          return true
        },
        interactive: false,
        stagingSha: otherSha,
        targetSha,
      }),
    ).resolves.toBe(false)
    expect(prompted).toBe(false)
  })

  it('requires an explicit yes for an interactive mismatch', async () => {
    await expect(
      decideProductionDeployment({
        allowUnstaged: false,
        confirm: async () => false,
        interactive: true,
        stagingSha: otherSha,
        targetSha,
      }),
    ).resolves.toBe(false)
  })

  it.each([
    ['y', true],
    ['YES', true],
    ['', false],
    ['no', false],
    ['sure', false],
  ])('treats %j as explicit confirmation: %s', (answer, expected) => {
    expect(isExplicitConfirmation(answer)).toBe(expected)
  })

  it('allows an intentional non-interactive override without running a deployment', async () => {
    const { allowUnstaged } = parseDeploymentArguments(['--allow-unstaged'])
    await expect(
      decideProductionDeployment({
        allowUnstaged,
        interactive: false,
        stagingSha: undefined,
        targetSha,
      }),
    ).resolves.toBe(true)
  })
})
