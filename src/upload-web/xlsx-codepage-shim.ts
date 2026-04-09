/**
 * Must be loaded before the xlsx library initializes.
 *
 * xlsx checks `typeof cptable !== 'undefined'` at module init time.
 * In an esbuild ESM browser bundle the library's own `require('./dist/cpexcel.js')`
 * branch is dead-code-eliminated, so $cptable stays undefined and old .xls files
 * with non-Latin-1 codepages (e.g. CP 1250 for Czech) get garbled sheet names.
 *
 * This shim is injected via esbuild `inject` so it runs before xlsx evaluates.
 */
// @ts-expect-error – cpexcel.full.mjs has no type declarations
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs'

;(globalThis as Record<string, unknown>).cptable = cpexcel
