export interface RuntimeBuildInfo {
  gitCommitHash: string
  gitCommitShortSha: string
  buildTimestamp: string
  buildBranch: string
  buildSource: string
  runtimeModuleVersion: string
  rendererVersion?: string
  payoutProjectionVersion?: string
}

declare global {
  var __HOTEL_FINANCE_BUILD_PROVENANCE__: RuntimeBuildInfo | undefined
}

export function resolveRuntimeBuildInfo(input: {
  generatedAt: string
  runtimeModuleVersion?: string
  rendererVersion?: string
  payoutProjectionVersion?: string
  fallbackBuildSource?: string
}): RuntimeBuildInfo {
  const embedded = readEmbeddedBuildInfo()
  const gitCommitHash = firstDefinedString(
    embedded?.gitCommitHash,
    readProcessEnv('HOTEL_FINANCE_BUILD_GIT_SHA'),
    'unknown'
  )
  const gitCommitShortSha = firstDefinedString(
    embedded?.gitCommitShortSha,
    readProcessEnv('HOTEL_FINANCE_BUILD_SHORT_SHA'),
    gitCommitHash === 'unknown' ? 'unknown' : gitCommitHash.slice(0, 7)
  )

  return {
    gitCommitHash,
    gitCommitShortSha,
    buildTimestamp: firstDefinedString(
      embedded?.buildTimestamp,
      readProcessEnv('HOTEL_FINANCE_BUILD_TIMESTAMP'),
      input.generatedAt
    ),
    buildBranch: firstDefinedString(
      embedded?.buildBranch,
      readProcessEnv('HOTEL_FINANCE_BUILD_BRANCH'),
      'unknown'
    ),
    buildSource: firstDefinedString(
      embedded?.buildSource,
      readProcessEnv('HOTEL_FINANCE_BUILD_SOURCE'),
      input.fallbackBuildSource,
      'runtime'
    ),
    runtimeModuleVersion: firstDefinedString(
      input.runtimeModuleVersion,
      embedded?.runtimeModuleVersion,
      readProcessEnv('HOTEL_FINANCE_RUNTIME_MODULE_VERSION'),
      'browser-runtime'
    ),
    rendererVersion: firstOptionalString(
      embedded?.rendererVersion,
      readProcessEnv('HOTEL_FINANCE_RENDERER_VERSION'),
      input.rendererVersion
    ),
    payoutProjectionVersion: firstOptionalString(
      embedded?.payoutProjectionVersion,
      readProcessEnv('HOTEL_FINANCE_PAYOUT_PROJECTION_VERSION'),
      input.payoutProjectionVersion
    )
  }
}

function readEmbeddedBuildInfo(): RuntimeBuildInfo | undefined {
  try {
    if (typeof globalThis === 'undefined') {
      return undefined
    }

    return globalThis.__HOTEL_FINANCE_BUILD_PROVENANCE__
  } catch {
    return undefined
  }
}

function readProcessEnv(key: string): string | undefined {
  try {
    if (typeof process === 'undefined' || !process.env) {
      return undefined
    }

    const value = process.env[key]
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  } catch {
    return undefined
  }
}

function firstDefinedString(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return 'unknown'
}

function firstOptionalString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}