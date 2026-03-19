import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { MonthlyBatchResult } from '../monthly-batch'
import type { ReviewScreenData } from '../review'
import { buildExportArtifactsFiles as buildSharedExportArtifactsFiles, type ExportFileArtifact } from './shared'

export interface ExportArtifactsInput {
  batch: MonthlyBatchResult
  review: ReviewScreenData
  outputDir?: string
}

export interface ExportArtifactsResult {
  files: ExportFileArtifact[]
}

export function buildExportArtifacts(input: ExportArtifactsInput): ExportArtifactsResult {
  const files = buildExportArtifactsFiles(input)

  if (input.outputDir) {
    const outputDir = resolve(input.outputDir)
    mkdirSync(outputDir, { recursive: true })

    for (const file of files) {
      const outputPath = resolve(outputDir, file.fileName)
      mkdirSync(dirname(outputPath), { recursive: true })

      if (typeof file.content === 'string') {
        writeFileSync(outputPath, file.content, 'utf8')
      } else {
        writeFileSync(outputPath, Buffer.from(file.content))
      }

      file.outputPath = outputPath
    }
  }

  return { files }
}

export function buildExportArtifactsFiles(input: Omit<ExportArtifactsInput, 'outputDir'>): ExportFileArtifact[] {
  return buildSharedExportArtifactsFiles(input)
}

export function placeholder() {
  return {
    name: 'export',
    formats: ['csv', 'xlsx'],
    buildExportArtifacts
  }
}
