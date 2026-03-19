import type { ExtractedRecord, MatchGroup, NormalizedTransaction } from '../domain/types'
import type { MatchingContext } from '../matching'
import { detectExceptions } from '../exceptions'
import { matchTransactions } from '../matching'
import { normalizeExtractedRecords } from '../normalization'
import type {
  ReconciliationContext,
  ReconciliationInput,
  ReconciliationResult,
  SupportedExpenseLink,
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
const SUPPORT_LINK_MIN_SCORE = 4
const SUPPORT_LINK_MAX_DAY_DISTANCE = 7

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
    const supportedExpenseLinks = linkSupportedExpenses(normalization.transactions)
    const supportedExpenseIds = new Set(supportedExpenseLinks.map((link) => link.expenseTransactionId))

    const exceptions = detectExceptions(
      {
        unmatchedTransactions: buildUnmatchedTransactionExceptions(
          normalization.transactions,
          matching,
          matchedIds,
          supportedExpenseLinks,
          supportedExpenseIds
        ),
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
      supportedExpenseLinks,
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
  matchedIds: Set<NormalizedTransaction['id']>,
  supportedExpenseLinks: SupportedExpenseLink[],
  supportedExpenseIds: Set<NormalizedTransaction['id']>
) {
  return transactions
    .filter((transaction) => !matchedIds.has(transaction.id))
    .filter((transaction) => transaction.direction !== 'out' || !supportedExpenseIds.has(transaction.id))
    .map((transaction) =>
      buildUnmatchedExceptionRule(transaction, matching.matchGroups, transactions, supportedExpenseLinks)
    )
}

function buildUnmatchedExceptionRule(
  transaction: NormalizedTransaction,
  matchGroups: MatchGroup[],
  transactions: NormalizedTransaction[],
  supportedExpenseLinks: SupportedExpenseLink[]
) {
  const supportLink = supportedExpenseLinks.find((link) => link.expenseTransactionId === transaction.id)

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

  if (transaction.direction === 'out' && shouldFlagMissingSupportingDocument(transaction, supportLink)) {
    return {
      transactionId: transaction.id,
      ruleCode: MISSING_SUPPORTING_DOCUMENT_RULE_CODE,
      reason: buildMissingSupportingDocumentReason(transaction),
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
  supportLink?: SupportedExpenseLink
): boolean {
  if (SAFE_OUTFLOW_SOURCES.has(transaction.source)) {
    return false
  }

  if (supportLink) {
    return false
  }

  if (isKnownLegitimateOutflow(transaction)) {
    return false
  }

  return transaction.direction === 'out'
}

function buildMissingSupportingDocumentReason(transaction: NormalizedTransaction): string {
  const hints = [
    transaction.counterparty ? `protiúčastník "${transaction.counterparty}"` : undefined,
    transaction.reference ? `reference "${transaction.reference}"` : undefined,
    `částka ${transaction.amountMinor} ${transaction.currency}`,
    `datum ${transaction.bookedAt}`
  ].filter(Boolean)

  return `Outgoing expense-like transaction has no structured supporting invoice or receipt match in the current monthly batch (${hints.join(', ')}).`
}

function linkSupportedExpenses(transactions: NormalizedTransaction[]): SupportedExpenseLink[] {
  const expenseCandidates = transactions.filter((transaction) =>
    transaction.direction === 'out'
    && transaction.source === 'bank'
    && !isKnownLegitimateOutflow(transaction)
    && !isSuspiciousExpense(transaction)
  )
  const supportCandidates = transactions.filter((transaction) =>
    transaction.direction === 'out' && DOCUMENT_SOURCE_SET.has(transaction.source)
  )

  const links: SupportedExpenseLink[] = []
  const usedSupportIds = new Set<NormalizedTransaction['id']>()

  for (const expense of expenseCandidates) {
    const candidates = supportCandidates
      .filter((support) => !usedSupportIds.has(support.id))
      .map((support) => evaluateSupportLink(expense, support))
      .filter((candidate): candidate is SupportedExpenseLink => candidate !== null)
      .sort((left, right) => right.matchScore - left.matchScore)

    const winner = candidates[0]
    if (!winner) {
      continue
    }

    usedSupportIds.add(winner.supportTransactionId)
    links.push(winner)
  }

  return links
}

function evaluateSupportLink(
  expense: NormalizedTransaction,
  support: NormalizedTransaction
): SupportedExpenseLink | null {
  const reasons: string[] = []
  let score = 0

  if (expense.currency === support.currency) {
    score += 1
    reasons.push(`currency:${expense.currency}`)
  } else {
    return null
  }

  if (expense.amountMinor === support.amountMinor) {
    score += 2
    reasons.push(`amountExact:${expense.amountMinor}`)
  } else {
    return null
  }

  const dayDistance = calculateDayDistance(expense.bookedAt, support.bookedAt)
  if (dayDistance <= SUPPORT_LINK_MAX_DAY_DISTANCE) {
    score += dayDistance === 0 ? 2 : 1
    reasons.push(`dateDistance:${dayDistance}`)
  } else {
    return null
  }

  const counterpartyMatch = normalizedContains(expense.counterparty, support.counterparty)
    || normalizedContains(expense.counterparty, support.reference)
    || normalizedContains(expense.reference, support.counterparty)

  if (counterpartyMatch) {
    score += 2
    reasons.push('counterpartyAligned')
  }

  const referenceMatch = normalizedContains(expense.reference, support.reference)
    || normalizedContains(expense.reference, support.invoiceNumber)

  if (referenceMatch) {
    score += 2
    reasons.push('referenceAligned')
  }

  if (!counterpartyMatch && !referenceMatch) {
    return null
  }

  if (score < SUPPORT_LINK_MIN_SCORE) {
    return null
  }

  return {
    expenseTransactionId: expense.id,
    supportTransactionId: support.id,
    matchScore: score,
    reasons,
    supportSourceDocumentIds: support.sourceDocumentIds,
    supportExtractedRecordIds: support.extractedRecordIds
  }
}

function calculateDayDistance(left: string, right: string): number {
  const leftDate = new Date(`${left}T00:00:00Z`)
  const rightDate = new Date(`${right}T00:00:00Z`)
  return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
}

function normalizeComparable(value?: string): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizedContains(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeComparable(left)
  const normalizedRight = normalizeComparable(right)

  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
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
