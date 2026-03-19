import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const browserRuntimeEntryPath = fileURLToPath(new URL('./browser-runtime-entry.ts', import.meta.url))

export interface EmitBrowserRuntimeBundleOptions {
  banner?: string
}

export interface BrowserRuntimeBundleOutput {
  runtimeAssetPath: string
}

export async function emitBrowserRuntimeBundle(
  outputPath: string,
  options: EmitBrowserRuntimeBundleOptions = {}
): Promise<BrowserRuntimeBundleOutput> {
  const outputDir = dirname(resolve(outputPath))
  const temporaryRuntimeAssetPath = resolve(outputDir, 'browser-runtime.tmp.js')

  mkdirSync(outputDir, { recursive: true })
  for (const existingEntry of readdirSync(outputDir)) {
    if (/^browser-runtime\.[a-f0-9]{12}\.js$/.test(existingEntry)) {
      rmSync(resolve(outputDir, existingEntry), { force: true })
    }
  }

  await build({
    entryPoints: [browserRuntimeEntryPath],
    outfile: temporaryRuntimeAssetPath,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    banner: options.banner ? { js: options.banner } : undefined,
    write: true,
    logLevel: 'silent'
  })

  const runtimeContent = readFileSync(temporaryRuntimeAssetPath, 'utf8')
  const contentHash = createHash('sha256').update(runtimeContent).digest('hex').slice(0, 12)
  const finalRuntimeAssetPath = resolve(outputDir, `browser-runtime.${contentHash}.js`)

  rmSync(resolve(outputDir, 'browser-runtime.tmp.js'), { force: true })

  mkdirSync(dirname(finalRuntimeAssetPath), { recursive: true })
  await build({
    entryPoints: [browserRuntimeEntryPath],
    outfile: finalRuntimeAssetPath,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    banner: options.banner ? { js: options.banner } : undefined,
    write: true,
    logLevel: 'silent'
  })

  rmSync(temporaryRuntimeAssetPath, { force: true })

  return { runtimeAssetPath: `./${relative(outputDir, finalRuntimeAssetPath).replace(/\\/g, '/')}` }
}