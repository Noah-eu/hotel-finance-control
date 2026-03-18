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
    .map((transaction) => ({
      transactionId: transaction.id,
      reason: buildUnmatchedReason(transaction, matching.matchGroups),
      severity: transaction.direction === 'out' ? ('high' as const) : ('medium' as const),
      sourceDocumentIds: transaction.sourceDocumentIds,
      extractedRecordIds: transaction.extractedRecordIds
    }))
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
