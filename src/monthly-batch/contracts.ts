import type { ExtractedRecord, SourceDocument } from '../domain'
import type { ReconciliationContext, ReconciliationResult } from '../reconciliation'
import type { ReconciliationReport } from '../reporting'

export type UploadedMonthlyFileClassificationBasis =
  | 'content'
  | 'file-name'
  | 'binary-workbook'
  | 'unknown'

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
  routing?: {
    classificationBasis: UploadedMonthlyFileClassificationBasis
    parserId: string
    warnings: string[]
  }
}

export interface UploadedMonthlyFileRoute {
  fileName: string
  uploadedAt: string
  status: 'supported' | 'unsupported'
  sourceSystem: SourceDocument['sourceSystem']
  documentType: SourceDocument['documentType']
  classificationBasis: UploadedMonthlyFileClassificationBasis
  parserId?: string
  sourceDocumentId?: SourceDocument['id']
  warnings: string[]
  reason?: string
}

export interface PreparedUploadedMonthlyFilesResult {
  importedFiles: ImportedMonthlySourceFile[]
  fileRoutes: UploadedMonthlyFileRoute[]
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
