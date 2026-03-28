import type { ExtractedRecord, SourceDocument } from '../domain'
import type {
  AirbnbPayoutHeaderDiagnostics,
  DeterministicDocumentExtractionSummary
} from '../extraction'
import type { ReconciliationContext, ReconciliationResult } from '../reconciliation'
import type { ReconciliationReport } from '../reporting'

export type UploadedMonthlyFileClassificationBasis =
  | 'content'
  | 'file-name'
  | 'binary-workbook'
  | 'unknown'

export type UploadedMonthlyFileDecisionConfidence =
  | 'none'
  | 'hint'
  | 'strong'

export type UploadedMonthlyFileCapabilityProfile =
  | 'structured_tabular'
  | 'text_document'
  | 'pdf_text_layer'
  | 'pdf_image_only'
  | 'image_receipt_like'
  | 'unsupported_binary'
  | 'unknown'

export type UploadedMonthlyFileCapabilityTransportProfile =
  | 'structured_csv'
  | 'structured_workbook'
  | 'text_pdf'
  | 'image_pdf'
  | 'text_document'
  | 'image_document'
  | 'unsupported_binary'
  | 'unknown_document'

export type UploadedMonthlyFileCapabilityDocumentHint =
  | 'invoice_like'
  | 'receipt_like'
  | 'payout_statement_like'

export type UploadedMonthlyFileIngestionBranch =
  | 'structured-parser'
  | 'text-document-parser'
  | 'text-pdf-parser'
  | 'ocr-required'
  | 'unsupported'

export interface UploadedMonthlyFileCapabilityAssessment {
  profile: UploadedMonthlyFileCapabilityProfile
  transportProfile: UploadedMonthlyFileCapabilityTransportProfile
  documentHints: UploadedMonthlyFileCapabilityDocumentHint[]
  confidence: UploadedMonthlyFileDecisionConfidence
  evidence: string[]
}

export type UploadedMonthlyFileDecisionBucket =
  | 'recognized-supported'
  | 'supplemental-supported'
  | 'unsupported'
  | 'unclassified'
  | 'ingest-error'

export interface UploadedMonthlyFileDecision {
  capability: UploadedMonthlyFileCapabilityAssessment
  ingestionBranch: UploadedMonthlyFileIngestionBranch
  ingestionReason: string
  detectedSignals: string[]
  matchedRules: string[]
  missingSignals: string[]
  parserSupported: boolean
  confidence: UploadedMonthlyFileDecisionConfidence
  resolvedSourceSystem: SourceDocument['sourceSystem']
  resolvedDocumentType: SourceDocument['documentType']
  resolvedRole: 'primary' | 'supplemental'
  resolvedBucket: UploadedMonthlyFileDecisionBucket
}

export interface UploadedMonthlyFileSourceDescriptor {
  mimeType?: string
  capability?: UploadedMonthlyFileCapabilityAssessment
  browserTextExtraction?: {
    mode: 'text' | 'pdf-text' | 'binary-workbook' | 'binary'
    status: 'extracted' | 'failed' | 'not-attempted'
    textPreview?: string
    detectedSignatures: string[]
  }
}

export interface UploadedMonthlyFile {
  name: string
  content: string
  uploadedAt: string
  binaryContentBase64?: string
  contentFormat?: 'text' | 'pdf-text' | 'binary-workbook' | 'binary'
  sourceDescriptor?: UploadedMonthlyFileSourceDescriptor
  ingestError?: string
}

export interface ImportedMonthlySourceFile {
  sourceDocument: SourceDocument
  content: string
  binaryContentBase64?: string
  routing?: {
    classificationBasis: UploadedMonthlyFileClassificationBasis
    parserId: string
    warnings: string[]
    role: 'primary' | 'supplemental'
  }
}

export interface UploadedMonthlyFileRoute {
  fileName: string
  uploadedAt: string
  status: 'supported' | 'unsupported' | 'error'
  intakeStatus: 'parsed' | 'unsupported' | 'unclassified' | 'error'
  sourceSystem: SourceDocument['sourceSystem']
  documentType: SourceDocument['documentType']
  classificationBasis: UploadedMonthlyFileClassificationBasis
  parserId?: string
  sourceDocumentId?: SourceDocument['id']
  role: 'primary' | 'supplemental'
  extractedCount?: number
  extractedRecordIds?: ExtractedRecord['id'][]
  warnings: string[]
  reason?: string
  errorMessage?: string
  parseDiagnostics?: {
    documentExtractionSummary?: DeterministicDocumentExtractionSummary
    airbnbHeaderDiagnostics?: AirbnbPayoutHeaderDiagnostics
    parserExtractedPaymentId?: string
    parserExtractedPayoutDate?: string
    parserExtractedPayoutTotal?: string
    parserExtractedLocalTotal?: string
    parserExtractedIbanHint?: string
    parserExtractedExchangeRate?: string
    validatorInputPaymentId?: string
    validatorInputPayoutDate?: string
    validatorInputPayoutTotal?: string
    parsedPaymentId?: string
    parsedPayoutDate?: string
    parsedPayoutTotal?: string
    parsedLocalTotal?: string
    parsedIbanHint?: string
    parsedExchangeRate?: string
    requiredFieldsCheck?: 'passed' | 'failed'
    missingFields?: string[]
  }
  decision: UploadedMonthlyFileDecision
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

export interface UploadedMonthlyIngestionResult {
  importedFiles: ImportedMonthlySourceFile[]
  fileRoutes: UploadedMonthlyFileRoute[]
  batch: MonthlyBatchResult
}

export interface MonthlyBatchService {
  run(input: MonthlyBatchInput): MonthlyBatchResult
}
