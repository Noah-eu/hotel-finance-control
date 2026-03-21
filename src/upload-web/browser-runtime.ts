import type { BrowserRuntimeInputFile, BrowserRuntimeUploadState } from './index.js'
import { buildBrowserRuntimeUploadStateFromFiles } from './browser-runtime-state.js'

export interface BrowserRuntimeBridge {
  buildRuntimeState(input: {
    files: BrowserRuntimeInputFile[]
    month?: string
    generatedAt: string
  }): Promise<BrowserRuntimeUploadState>
}

export async function buildBrowserRuntimeStateFromSelectedFiles(input: {
  files: BrowserRuntimeInputFile[]
  month?: string
  generatedAt: string
}): Promise<BrowserRuntimeUploadState> {
  const uploadedFiles = await Promise.all(
    input.files.map(async (file) => ({
      name: file.name,
      content: typeof file.text === 'function' ? await file.text() : '',
      uploadedAt: input.generatedAt,
      binaryContentBase64: typeof file.arrayBuffer === 'function'
        ? Buffer.from(await file.arrayBuffer()).toString('base64')
        : undefined
    }))
  )

  return buildBrowserRuntimeUploadStateFromFiles({
    files: uploadedFiles,
    runId: buildBrowserRuntimeRunId(input.month),
    generatedAt: input.generatedAt
  })
}

export function createBrowserRuntime(): BrowserRuntimeBridge {
  return {
    buildRuntimeState(input) {
      return buildBrowserRuntimeStateFromSelectedFiles(input)
    }
  }
}

function buildBrowserRuntimeRunId(month?: string): string {
  const suffix = month && month.trim() ? month.trim() : 'local'
  return `browser-runtime-upload-${suffix}`
}