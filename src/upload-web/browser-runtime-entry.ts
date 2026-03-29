import {
  buildBrowserRuntimeStateFromSelectedFiles,
  buildBrowserRuntimeWorkspaceExcelExport,
  createBrowserRuntime,
  type BrowserRuntimeBridge
} from './browser-runtime.js'
import type { BrowserRuntimeUploadState } from './index.js'
import type { BrowserWorkspaceExcelExportArtifact, MonthlyWorkspaceExportPreset } from '../export/browser.js'

declare global {
  interface Window {
    __hotelFinanceCreateBrowserRuntime?: () => BrowserRuntimeBridge
    __hotelFinanceBuildBrowserRuntimeState?: (input: {
      files?: Array<{
        name: string
        content: string
      }>
      runId: string
      generatedAt: string
    }) => Promise<unknown>
    __hotelFinanceBuildWorkspaceExcelExport?: (input: {
      state: BrowserRuntimeUploadState
      preset: MonthlyWorkspaceExportPreset
    }) => BrowserWorkspaceExcelExportArtifact
  }
}

window.__hotelFinanceCreateBrowserRuntime = createBrowserRuntime

window.__hotelFinanceBuildBrowserRuntimeState = async function buildBrowserRuntimeState(input) {
  return buildBrowserRuntimeStateFromSelectedFiles({
    files: (input.files ?? []).map((file) => ({
      name: file.name,
      text: async () => file.content
    })),
    month: input.runId.replace('browser-runtime-upload-', ''),
    generatedAt: input.generatedAt
  })
}

window.__hotelFinanceBuildWorkspaceExcelExport = function buildWorkspaceExcelExport(input) {
  return buildBrowserRuntimeWorkspaceExcelExport(input)
}

export { createBrowserRuntime, buildBrowserRuntimeWorkspaceExcelExport }
