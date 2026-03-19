import { buildExportArtifactsFiles } from '../export/shared'
import {
  prepareUploadedMonthlyFiles,
  runMonthlyReconciliationBatch,
  type UploadedMonthlyFile
} from '../monthly-batch'
import { buildReviewScreen } from '../review'
import type { BrowserRuntimeUploadState } from './index.js'

export interface BuildBrowserRuntimeStateInput {
  files: UploadedMonthlyFile[]
  runId: string
  generatedAt: string
}

export function buildBrowserRuntimeUploadStateFromFiles(
  input: BuildBrowserRuntimeStateInput
): BrowserRuntimeUploadState {
  const importedFiles = prepareUploadedMonthlyFiles(input.files)
  const batch = runMonthlyReconciliationBatch({
    files: importedFiles,
    reconciliationContext: {
      runId: input.runId,
      requestedAt: input.generatedAt
    },
    reportGeneratedAt: input.generatedAt
  })
  const review = buildReviewScreen({
    batch,
    generatedAt: input.generatedAt
  })
  const exportFiles = buildExportArtifactsFiles({
    batch,
    review
  })

  return {
    generatedAt: input.generatedAt,
    runId: input.runId,
    monthLabel: deriveMonthLabel(input.runId),
    preparedFiles: importedFiles.map((file) => ({
      fileName: file.sourceDocument.fileName,
      sourceDocumentId: file.sourceDocument.id,
      sourceSystem: file.sourceDocument.sourceSystem,
      documentType: file.sourceDocument.documentType
    })),
    extractedRecords: importedFiles.map((file) => ({
      fileName: file.sourceDocument.fileName,
      extractedCount: findBatchFileExtractedCount(batch, file.sourceDocument.id),
      extractedRecordIds: findBatchFileExtractedIds(batch, file.sourceDocument.id)
    })),
    supportedExpenseLinks: batch.report.supportedExpenseLinks.map((link) => ({
      expenseTransactionId: link.expenseTransactionId,
      supportTransactionId: link.supportTransactionId,
      supportSourceDocumentIds: link.supportSourceDocumentIds,
      matchScore: link.matchScore,
      reasons: link.reasons
    })),
    reportSummary: batch.report.summary,
    reviewSummary: review.summary,
    reviewSections: {
      matched: review.matched,
      unmatched: review.unmatched,
      suspicious: review.suspicious,
      missingDocuments: review.missingDocuments
    },
    exportFiles: exportFiles.map((file) => ({
      labelCs: file.labelCs,
      fileName: file.fileName
    }))
  }
}

function findBatchFileExtractedCount(
  batch: ReturnType<typeof runMonthlyReconciliationBatch>,
  sourceDocumentId: string
): number {
  return batch.files.find((file) => file.sourceDocumentId === sourceDocumentId)?.extractedCount ?? 0
}

function findBatchFileExtractedIds(
  batch: ReturnType<typeof runMonthlyReconciliationBatch>,
  sourceDocumentId: string
): string[] {
  return batch.files.find((file) => file.sourceDocumentId === sourceDocumentId)?.extractedRecordIds ?? []
}

function deriveMonthLabel(runId: string): string {
  const prefix = 'browser-runtime-upload-'

  if (!runId.startsWith(prefix)) {
    return 'neuvedeno'
  }

  const suffix = runId.slice(prefix.length)
  return suffix === 'local' ? 'neuvedeno' : suffix
}