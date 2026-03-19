import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const browserRuntimeEntryPath = fileURLToPath(new URL('./browser-runtime-entry.ts', import.meta.url))

export interface BrowserRuntimeBundleOutput {
  runtimeAssetPath: string
}

export async function emitBrowserRuntimeBundle(outputPath: string): Promise<BrowserRuntimeBundleOutput> {
  const outputDir = dirname(resolve(outputPath))
  const runtimeAssetPath = resolve(outputDir, 'browser-runtime.js')

  mkdirSync(outputDir, { recursive: true })

  await build({
    entryPoints: [browserRuntimeEntryPath],
    outfile: runtimeAssetPath,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    write: true,
    logLevel: 'silent'
  })

  return { runtimeAssetPath }
}