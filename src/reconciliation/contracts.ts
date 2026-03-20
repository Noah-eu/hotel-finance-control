import type { ExceptionDetectionResult } from '../exceptions'
import type { MatchingResult } from '../matching'
import type { NormalizationResult } from '../normalization'
import type {
  ExceptionCase,
  ExtractedRecord,
  MatchGroup,
  NormalizedTransaction,
  PayoutBatchExpectation,
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

export interface PayoutBatchBankMatch {
  payoutBatchKey: PayoutBatchExpectation['payoutBatchKey']
  payoutBatchRowIds: PayoutBatchExpectation['rowIds']
  bankTransactionId: NormalizedTransaction['id']
  bankAccountId: NormalizedTransaction['accountId']
  amountMinor: number
  currency: NormalizedTransaction['currency']
  confidence: number
  ruleKey: string
  matched: boolean
  reasons: string[]
  evidence: Array<{
    key: string
    value: string | number | boolean
  }>
}

export interface PayoutBatchCandidateDiagnostic {
  bankTransactionId: NormalizedTransaction['id']
  bankAccountId: NormalizedTransaction['accountId']
  amountMinor: NormalizedTransaction['amountMinor']
  currency: NormalizedTransaction['currency']
  bookedAt: NormalizedTransaction['bookedAt']
  reference?: string
  eligible: boolean
  rejectionReasons: Array<
    'noExactAmount'
    | 'currencyMismatch'
    | 'wrongBankRouting'
    | 'dateToleranceMiss'
  >
  dateDistanceDays: number
}

export interface PayoutBatchNoMatchDiagnostic {
  payoutBatchKey: PayoutBatchExpectation['payoutBatchKey']
  payoutReference: PayoutBatchExpectation['payoutReference']
  platform: PayoutBatchExpectation['platform']
  expectedTotalMinor: PayoutBatchExpectation['expectedTotalMinor']
  currency: PayoutBatchExpectation['currency']
  payoutDate: PayoutBatchExpectation['payoutDate']
  bankRoutingTarget: PayoutBatchExpectation['bankRoutingTarget']
  eligibleCandidates: PayoutBatchCandidateDiagnostic[]
  allInboundBankCandidates: PayoutBatchCandidateDiagnostic[]
  noMatchReason:
  | 'noExactAmount'
  | 'wrongBankRouting'
  | 'ambiguousCandidates'
  | 'dateToleranceMiss'
  | 'noCandidateAtAll'
  matched: false
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
  payoutBatchMatches?: PayoutBatchBankMatch[]
  payoutBatchNoMatchDiagnostics?: PayoutBatchNoMatchDiagnostic[]
  normalization: Pick<NormalizationResult, 'warnings' | 'trace'>
  exceptions: ExceptionDetectionResult
  summary: ReconciliationSummary
}

export interface ReconciliationService {
  reconcile(input: ReconciliationInput, context: ReconciliationContext): ReconciliationResult
}
