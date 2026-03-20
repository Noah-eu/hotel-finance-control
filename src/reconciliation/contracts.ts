import type { ExceptionDetectionResult } from '../exceptions'
import type { MatchingResult } from '../matching'
import type { NormalizationResult } from '../normalization'
import type {
  ExceptionCase,
  ExtractedRecord,
  MatchGroup,
  NormalizedTransaction,
  ReconciliationWorkflowPlan
} from '../domain/types'

export interface SupportedExpenseLink {
  expenseTransactionId: NormalizedTransaction['id']
  supportTransactionId: NormalizedTransaction['id']
  matchScore: number
  reasons: string[]
  supportSourceDocumentIds: NormalizedTransaction['sourceDocumentIds']
  supportExtractedRecordIds: NormalizedTransaction['extractedRecordIds']
}

export interface ReconciliationInput {
  extractedRecords: ExtractedRecord[]
}

export interface ReconciliationContext {
  runId: string
  requestedAt: string
  lowConfidenceThreshold?: number
}

export interface ReconciliationSummary {
  normalizedTransactionCount: number
  matchedGroupCount: number
  exceptionCount: number
  unmatchedExpectedCount: number
  unmatchedActualCount: number
}

export interface ReconciliationResult {
  normalizedTransactions: NormalizedTransaction[]
  matching: MatchingResult
  matchGroups: MatchGroup[]
  exceptionCases: ExceptionCase[]
  supportedExpenseLinks: SupportedExpenseLink[]
  workflowPlan?: ReconciliationWorkflowPlan
  normalization: Pick<NormalizationResult, 'warnings' | 'trace'>
  exceptions: ExceptionDetectionResult
  summary: ReconciliationSummary
}

export interface ReconciliationService {
  reconcile(input: ReconciliationInput, context: ReconciliationContext): ReconciliationResult
}
