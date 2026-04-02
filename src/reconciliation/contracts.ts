import type { ExceptionDetectionResult } from '../exceptions'
import type { MatchingResult } from '../matching'
import type { NormalizationResult } from '../normalization'
import type {
  ExceptionCase,
  ExtractedRecord,
  MatchGroup,
  NormalizedTransaction,
  PayoutBatchExpectation,
  ReservationSettlementMatch,
  ReservationSettlementNoMatch,
  ReconciliationWorkflowPlan
} from '../domain/types'

export interface CarryoverSourcePayoutBatch {
  payoutBatchKey: PayoutBatchExpectation['payoutBatchKey']
  platform: PayoutBatchExpectation['platform']
  payoutReference: PayoutBatchExpectation['payoutReference']
  payoutDate: PayoutBatchExpectation['payoutDate']
  bankRoutingTarget: PayoutBatchExpectation['bankRoutingTarget']
  rowIds: PayoutBatchExpectation['rowIds']
  expectedTotalMinor: PayoutBatchExpectation['expectedTotalMinor']
  grossTotalMinor?: PayoutBatchExpectation['grossTotalMinor']
  feeTotalMinor?: PayoutBatchExpectation['feeTotalMinor']
  netSettlementTotalMinor?: PayoutBatchExpectation['netSettlementTotalMinor']
  currency: PayoutBatchExpectation['currency']
  payoutSupplementPaymentId?: PayoutBatchExpectation['payoutSupplementPaymentId']
  payoutSupplementPayoutDate?: PayoutBatchExpectation['payoutSupplementPayoutDate']
  payoutSupplementPayoutTotalAmountMinor?: PayoutBatchExpectation['payoutSupplementPayoutTotalAmountMinor']
  payoutSupplementPayoutTotalCurrency?: PayoutBatchExpectation['payoutSupplementPayoutTotalCurrency']
  payoutSupplementLocalAmountMinor?: PayoutBatchExpectation['payoutSupplementLocalAmountMinor']
  payoutSupplementLocalCurrency?: PayoutBatchExpectation['payoutSupplementLocalCurrency']
  payoutSupplementIbanSuffix?: PayoutBatchExpectation['payoutSupplementIbanSuffix']
  payoutSupplementExchangeRate?: PayoutBatchExpectation['payoutSupplementExchangeRate']
  payoutSupplementReferenceHints?: PayoutBatchExpectation['payoutSupplementReferenceHints']
  payoutSupplementSourceDocumentIds?: PayoutBatchExpectation['payoutSupplementSourceDocumentIds']
  payoutSupplementReservationIds?: PayoutBatchExpectation['payoutSupplementReservationIds']
}

export interface PreviousMonthCarryoverSource {
  sourceMonthKey: string
  payoutBatches: CarryoverSourcePayoutBatch[]
}

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
  counterparty?: string
  reference?: string
  eligible: boolean
  clueScore: number
  clueLabels: string[]
  evidenceScore: number
  evidenceLabels: string[]
  rejectionReasons: Array<
    'noExactAmount'
    | 'currencyMismatch'
    | 'wrongBankRouting'
    | 'dateToleranceMiss'
    | 'counterpartyClueMismatch'
  >
  dateDistanceDays: number
  strictDateEligible: boolean
  comgateSameMonthLagRuleApplied: boolean
  comgatePreviousMonthCarryoverRuleApplied: boolean
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
  | 'counterpartyClueMismatch'
  | 'ambiguousCandidates'
  | 'dateToleranceMiss'
  | 'noCandidateAtAll'
  matched: false
}

export interface PayoutBatchBankDecisionTrace {
  payoutBatchKey: PayoutBatchExpectation['payoutBatchKey']
  payoutReference: PayoutBatchExpectation['payoutReference']
  platform: PayoutBatchExpectation['platform']
  fromPreviousMonth?: boolean
  sourceMonthKey?: string
  expectedTotalMinor: PayoutBatchExpectation['expectedTotalMinor']
  grossTotalMinor?: PayoutBatchExpectation['grossTotalMinor']
  feeTotalMinor?: PayoutBatchExpectation['feeTotalMinor']
  netSettlementTotalMinor?: PayoutBatchExpectation['netSettlementTotalMinor']
  documentTotalMinor?: number
  expectedBankAmountMinor: number
  currency: PayoutBatchExpectation['currency']
  documentCurrency?: NormalizedTransaction['currency']
  expectedBankCurrency: NormalizedTransaction['currency']
  matchingAmountSource: 'batch_total' | 'booking_local_total'
  selectionMode?: 'eligible_candidate' | 'unique_exact_amount_fallback'
  exactAmountMatchExistsBeforeDateEvidence: boolean
  sameCurrencyCandidateAmountMinors: number[]
  sameMonthExactAmountCandidateExists: boolean
  rejectedOnlyByDateGate: boolean
  appliedComgateSameMonthLagRule: boolean
  wouldRejectOnStrictDateGate: boolean
  payoutDate: PayoutBatchExpectation['payoutDate']
  bankCandidateCountBeforeFiltering: number
  bankCandidateCountAfterAmountCurrency: number
  bankCandidateCountAfterDateWindow: number
  bankCandidateCountAfterEvidenceFiltering: number
  carryoverCandidateExistsInMatcher: boolean
  carryoverRejectedReason?:
  | 'noInboundBankCandidate'
  | 'noExactAmount'
  | 'currencyMismatch'
  | 'wrongBankRouting'
  | 'counterpartyClueMismatch'
  | 'sourceMonthKeyMismatch'
  | 'notImmediateNextCalendarMonth'
  | 'noEligibleCarryoverCandidate'
  matched: boolean
  matchedBankTransactionId?: NormalizedTransaction['id']
  noMatchReason?: PayoutBatchNoMatchDiagnostic['noMatchReason']
}

export interface ReconciliationInput {
  extractedRecords: ExtractedRecord[]
  previousMonthCarryoverSource?: PreviousMonthCarryoverSource
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
  reservationSettlementMatches?: ReservationSettlementMatch[]
  reservationSettlementNoMatches?: ReservationSettlementNoMatch[]
  payoutBatchMatches?: PayoutBatchBankMatch[]
  payoutBatchNoMatchDiagnostics?: PayoutBatchNoMatchDiagnostic[]
  normalization: Pick<NormalizationResult, 'warnings' | 'trace'>
  exceptions: ExceptionDetectionResult
  summary: ReconciliationSummary
}

export interface ReconciliationService {
  reconcile(input: ReconciliationInput, context: ReconciliationContext): ReconciliationResult
}
