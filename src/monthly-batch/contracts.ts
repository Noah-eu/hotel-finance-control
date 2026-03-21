import type { ExtractedRecord, SourceDocument } from '../domain'
import type { ReconciliationContext, ReconciliationResult } from '../reconciliation'
import type { ReconciliationReport } from '../reporting'

export interface UploadedMonthlyFile {
  name: string
  content: string
  uploadedAt: string
  binaryContentBase64?: string
}

export interface ImportedMonthlySourceFile {
  sourceDocument: SourceDocument
  content: string
  binaryContentBase64?: string
}

export interface MonthlyBatchInput {
  files: ImportedMonthlySourceFile[]
  reconciliationContext: ReconciliationContext
  reportGeneratedAt: string
}

export interface MonthlyBatchFileResult {
  sourceDocumentId: SourceDocument['id']
  extractedRecordIds: ExtractedRecord['id'][]
  extractedCount: number
}

export interface MonthlyBatchResult {
  extractedRecords: ExtractedRecord[]
  reconciliation: ReconciliationResult
  report: ReconciliationReport
  files: MonthlyBatchFileResult[]
}

export interface MonthlyBatchService {
  run(input: MonthlyBatchInput): MonthlyBatchResult
}