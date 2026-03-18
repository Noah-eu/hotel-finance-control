import type { ExtractedRecord, MatchGroup, NormalizedTransaction } from '../domain/types'
import type { MatchingContext } from '../matching'
import { detectExceptions } from '../exceptions'
import { matchTransactions } from '../matching'
import { normalizeExtractedRecords } from '../normalization'
import type {
  ReconciliationContext,
  ReconciliationInput,
  ReconciliationResult,
  ReconciliationService
} from './contracts'

const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.9
const SUSPICIOUS_EXPENSE_RULE_CODE = 'suspicious_private_expense'
const MISSING_SUPPORTING_DOCUMENT_RULE_CODE = 'missing_supporting_document'
const DOCUMENT_SOURCE_SET = new Set(['invoice', 'receipt'])
const SAFE_OUTFLOW_SOURCES = new Set(['invoice', 'receipt'])
const SAFE_OUTFLOW_COUNTERPARTY_PATTERNS = [/payroll/i]
const SUSPICIOUS_REFERENCE_PATTERNS = [/personal/i, /private/i]
const SUSPICIOUS_COUNTERPARTY_PATTERNS = [/electro world/i]

export class DefaultReconciliationService implements ReconciliationService {
  reconcile(input: ReconciliationInput, context: ReconciliationContext): ReconciliationResult {
    const normalization = normalizeExtractedRecords({
      extractedRecords: input.extractedRecords,
      runId: context.runId,
      requestedAt: context.requestedAt
    })

    const expected = normalization.transactions.filter(isExpectedTransaction)
    const actual = normalization.transactions.filter(isActualTransaction)

    const matchingContext: MatchingContext = {
      runId: context.runId,
      requestedAt: context.requestedAt
    }

    const matching = matchTransactions({ expected, actual }, matchingContext)
    const matchedIds = new Set(matching.matchGroups.flatMap((group) => group.transactionIds))
    const lowConfidenceThreshold = context.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD

    const exceptions = detectExceptions(
      {
        unmatchedTransactions: buildUnmatchedTransactionExceptions(normalization.transactions, matching, matchedIds),
        lowConfidenceMatches: matching.matchGroups
          .filter((group) => group.confidence < lowConfidenceThreshold)
          .map((matchGroup) => ({ matchGroup, threshold: lowConfidenceThreshold }))
      },
      {
        runId: context.runId,
        requestedAt: context.requestedAt
      }
    )

    return {
      normalizedTransactions: normalization.transactions,
      matching,
      matchGroups: matching.matchGroups,
      exceptionCases: exceptions.cases,
      normalization: {
        warnings: normalization.warnings,
        trace: normalization.trace
      },
      exceptions,
      summary: {
        normalizedTransactionCount: normalization.transactions.length,
        matchedGroupCount: matching.matchGroups.length,
        exceptionCount: exceptions.cases.length,
        unmatchedExpectedCount: matching.unmatchedExpectedIds.length,
        unmatchedActualCount: matching.unmatchedActualIds.length
      }
    }
  }
}

const defaultReconciliationService = new DefaultReconciliationService()

export function reconcileExtractedRecords(
  input: ReconciliationInput,
  context: ReconciliationContext
): ReconciliationResult {
  return defaultReconciliationService.reconcile(input, context)
}

function isExpectedTransaction(transaction: NormalizedTransaction): boolean {
  return transaction.direction === 'in' && transaction.source !== 'bank'
}

function isActualTransaction(transaction: NormalizedTransaction): boolean {
  return transaction.direction === 'in' && transaction.source === 'bank'
}

function buildUnmatchedTransactionExceptions(
  transactions: NormalizedTransaction[],
  matching: ReconciliationResult['matching'],
  matchedIds: Set<NormalizedTransaction['id']>
) {
  return transactions
    .filter((transaction) => !matchedIds.has(transaction.id))
    .map((transaction) => buildUnmatchedExceptionRule(transaction, matching.matchGroups, transactions))
}

function buildUnmatchedExceptionRule(
  transaction: NormalizedTransaction,
  matchGroups: MatchGroup[],
  transactions: NormalizedTransaction[]
) {
  const supportingDocuments = transactions.filter(
    (candidate) =>
      candidate.direction === 'out'
      && candidate.sourceDocumentIds.some((sourceDocumentId) =>
        transaction.sourceDocumentIds.includes(sourceDocumentId)
      )
      && DOCUMENT_SOURCE_SET.has(candidate.source)
  )

  if (transaction.direction === 'out' && isSuspiciousExpense(transaction)) {
    return {
      transactionId: transaction.id,
      ruleCode: SUSPICIOUS_EXPENSE_RULE_CODE,
      reason: buildSuspiciousExpenseReason(transaction),
      severity: 'high' as const,
      sourceDocumentIds: transaction.sourceDocumentIds,
      extractedRecordIds: transaction.extractedRecordIds,
      recommendedNextStep:
        'Review whether this expense is hotel-related and attach supporting invoice or receipt if it is legitimate.'
    }
  }

  if (transaction.direction === 'out' && shouldFlagMissingSupportingDocument(transaction, supportingDocuments)) {
    return {
      transactionId: transaction.id,
      ruleCode: MISSING_SUPPORTING_DOCUMENT_RULE_CODE,
      reason: 'Outgoing expense-like transaction has no supporting invoice or receipt in the current monthly batch.',
      severity: 'high' as const,
      sourceDocumentIds: transaction.sourceDocumentIds,
      extractedRecordIds: transaction.extractedRecordIds,
      recommendedNextStep:
        'Collect the missing invoice or receipt and link it to this expense transaction.'
    }
  }

  return {
    transactionId: transaction.id,
    reason: buildUnmatchedReason(transaction, matchGroups),
    severity: transaction.direction === 'out' ? ('high' as const) : ('medium' as const),
    sourceDocumentIds: transaction.sourceDocumentIds,
    extractedRecordIds: transaction.extractedRecordIds
  }
}

function buildUnmatchedReason(
  transaction: NormalizedTransaction,
  matchGroups: MatchGroup[]
): string {
  const hasPartialRelatedMatch = matchGroups.some((group) =>
    group.transactionIds.some((transactionId) => transaction.extractedRecordIds.some(() => transactionId === transaction.id))
  )

  if (transaction.source === 'bank') {
    return hasPartialRelatedMatch
      ? 'Incoming bank transaction is only partially reconciled and requires review.'
      : 'Incoming bank transaction could not be matched to an expected payout.'
  }

  if (transaction.direction === 'out') {
    return 'Outgoing transaction is not yet linked to a supporting invoice or receipt.'
  }

  return 'Expected incoming transaction could not be matched to an actual bank movement.'
}

function shouldFlagMissingSupportingDocument(
  transaction: NormalizedTransaction,
  supportingDocuments: NormalizedTransaction[]
): boolean {
  if (SAFE_OUTFLOW_SOURCES.has(transaction.source)) {
    return false
  }

  if (supportingDocuments.length > 0) {
    return false
  }

  if (isKnownLegitimateOutflow(transaction)) {
    return false
  }

  return transaction.direction === 'out'
}

function isKnownLegitimateOutflow(transaction: NormalizedTransaction): boolean {
  const reference = transaction.reference?.toLowerCase() ?? ''
  const counterparty = transaction.counterparty?.toLowerCase() ?? ''

  if (reference.includes('payroll')) {
    return true
  }

  return SAFE_OUTFLOW_COUNTERPARTY_PATTERNS.some((pattern) => pattern.test(counterparty))
}

function isSuspiciousExpense(transaction: NormalizedTransaction): boolean {
  if (transaction.direction !== 'out') {
    return false
  }

  const reference = transaction.reference ?? ''
  const counterparty = transaction.counterparty ?? ''

  return SUSPICIOUS_REFERENCE_PATTERNS.some((pattern) => pattern.test(reference))
    || SUSPICIOUS_COUNTERPARTY_PATTERNS.some((pattern) => pattern.test(counterparty))
}

function buildSuspiciousExpenseReason(transaction: NormalizedTransaction): string {
  if ((transaction.reference ?? '').toLowerCase().includes('personal')) {
    return `Outgoing expense ${transaction.id} is flagged as suspicious/private because its reference "${transaction.reference}" looks personal.`
  }

  return `Outgoing expense ${transaction.id} is flagged as suspicious/private because counterparty "${transaction.counterparty ?? 'unknown'}" matches a suspicious spending pattern.`
}
