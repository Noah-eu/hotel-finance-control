import {
  buildBrowserRuntimeStateFromSelectedFiles,
  createBrowserRuntime,
  type BrowserRuntimeBridge
} from './browser-runtime.js'

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

export { createBrowserRuntime }