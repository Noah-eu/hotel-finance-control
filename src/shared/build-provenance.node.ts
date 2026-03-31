import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import type { RuntimeBuildInfo } from './build-provenance'

export function resolveNodeRuntimeBuildInfo(input: {
  generatedAt: string
  runtimeModuleVersion: string
  rendererVersion?: string
  payoutProjectionVersion?: string
}): RuntimeBuildInfo {
  const gitMetadata = resolveGitMetadata()
  const gitCommitHash = firstDefinedString(
    process.env.HOTEL_FINANCE_BUILD_GIT_SHA,
    process.env.COMMIT_REF,
    gitMetadata.commitHash,
    'unknown'
  )

  return {
    gitCommitHash,
    gitCommitShortSha: gitCommitHash === 'unknown' ? 'unknown' : gitCommitHash.slice(0, 7),
    buildTimestamp: input.generatedAt,
    buildBranch: firstDefinedString(
      process.env.HOTEL_FINANCE_BUILD_BRANCH,
      process.env.BRANCH,
      process.env.HEAD,
      gitMetadata.branch,
      'unknown'
    ),
    buildSource: firstDefinedString(
      process.env.HOTEL_FINANCE_BUILD_SOURCE,
      resolveBuildSource(),
      'local'
    ),
    runtimeModuleVersion: input.runtimeModuleVersion,
    rendererVersion: input.rendererVersion,
    payoutProjectionVersion: input.payoutProjectionVersion
  }
}

export function applyNodeRuntimeBuildInfoEnv(buildInfo: RuntimeBuildInfo): void {
  process.env.HOTEL_FINANCE_BUILD_GIT_SHA = buildInfo.gitCommitHash
  process.env.HOTEL_FINANCE_BUILD_SHORT_SHA = buildInfo.gitCommitShortSha
  process.env.HOTEL_FINANCE_BUILD_TIMESTAMP = buildInfo.buildTimestamp
  process.env.HOTEL_FINANCE_BUILD_BRANCH = buildInfo.buildBranch
  process.env.HOTEL_FINANCE_BUILD_SOURCE = buildInfo.buildSource
  process.env.HOTEL_FINANCE_RUNTIME_MODULE_VERSION = buildInfo.runtimeModuleVersion

  if (buildInfo.rendererVersion) {
    process.env.HOTEL_FINANCE_RENDERER_VERSION = buildInfo.rendererVersion
  }

  if (buildInfo.payoutProjectionVersion) {
    process.env.HOTEL_FINANCE_PAYOUT_PROJECTION_VERSION = buildInfo.payoutProjectionVersion
  }
}

export function buildRuntimeBuildInfoBanner(buildInfo: RuntimeBuildInfo): string {
  return `globalThis.__HOTEL_FINANCE_BUILD_PROVENANCE__ = ${JSON.stringify(buildInfo)};`
}

function resolveBuildSource(): string {
  if (process.env.NETLIFY === 'true') {
    return `netlify:${firstDefinedString(process.env.CONTEXT, 'unknown')}`
  }

  return 'local'
}

function resolveGitMetadata(): { commitHash?: string, branch?: string } {
  try {
    const gitMetadataPath = resolve('.git')
    const gitDirectory = resolveGitDirectory(gitMetadataPath)
    const headPath = resolve(gitDirectory, 'HEAD')

    if (!existsSync(headPath)) {
      return {}
    }

    const headContent = readFileSync(headPath, 'utf8').trim()
    if (!headContent) {
      return {}
    }

    if (!headContent.startsWith('ref:')) {
      return {
        commitHash: headContent,
        branch: 'detached-head'
      }
    }

    const refName = headContent.replace(/^ref:\s*/, '').trim()
    const refPath = resolve(gitDirectory, refName)
    const branch = basename(refName)

    if (existsSync(refPath)) {
      return {
        commitHash: readFileSync(refPath, 'utf8').trim(),
        branch
      }
    }

    const packedRefsPath = resolve(gitDirectory, 'packed-refs')
    if (!existsSync(packedRefsPath)) {
      return { branch }
    }

    const packedRefLine = readFileSync(packedRefsPath, 'utf8')
      .split(/\r?\n/)
      .find((line) => !line.startsWith('#') && !line.startsWith('^') && line.endsWith(` ${refName}`))

    return {
      commitHash: packedRefLine?.split(' ')[0]?.trim(),
      branch
    }
  } catch {
    return {}
  }
}

function resolveGitDirectory(gitMetadataPath: string): string {
  try {
    const metadataContent = readFileSync(gitMetadataPath, 'utf8').trim()

    if (metadataContent.startsWith('gitdir:')) {
      return resolve(dirname(gitMetadataPath), metadataContent.replace(/^gitdir:\s*/, ''))
    }
  } catch {
    return gitMetadataPath
  }

  return gitMetadataPath
}

function firstDefinedString(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return 'unknown'
}