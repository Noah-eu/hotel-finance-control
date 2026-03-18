import type { MatchGroup, NormalizedTransaction } from '../domain/types'
import type {
  MatchGroupId,
  MatchStatus,
  SourceSystem,
  TransactionDirection,
  TransactionId
} from '../domain/value-types'
import type {
  MatchExplanation,
  Matcher,
  MatchingCandidate,
  MatchingContext,
  MatchingInput,
  MatchingResult
} from './contracts'

const RULE_KEY = 'deterministic:payout-bank:1to1:v1'
const DATE_TOLERANCE_DAYS = 2

const EXPECTED_SOURCES = new Set<SourceSystem>(['booking', 'airbnb', 'comgate', 'expedia'])
const ACTUAL_SOURCES = new Set<SourceSystem>(['bank'])

function daysBetween(a: string, b: string): number {
  const aTime = new Date(a).getTime()
  const bTime = new Date(b).getTime()
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) return Number.POSITIVE_INFINITY
  return Math.abs(aTime - bTime) / (1000 * 60 * 60 * 24)
}

function normalizeRef(value?: string): string | undefined {
  if (!value) return undefined
  const cleaned = value.trim().toLowerCase()
  return cleaned.length > 0 ? cleaned : undefined
}

function compatibleDirection(expected: TransactionDirection, actual: TransactionDirection): boolean {
  return expected === 'in' && actual === 'in'
}

function buildExplanation(
  expected: NormalizedTransaction,
  actual: NormalizedTransaction,
  dateDiffDays: number
): MatchExplanation {
  const signals: MatchExplanation['signals'] = [
    { key: 'amountMinorExact', value: expected.amountMinor === actual.amountMinor, weight: 0.5 },
    { key: 'currencyExact', value: expected.currency === actual.currency, weight: 0.2 },
    { key: 'directionCompatible', value: compatibleDirection(expected.direction, actual.direction), weight: 0.1 },
    { key: 'dateDiffDays', value: Number(dateDiffDays.toFixed(3)), weight: 0.1 }
  ]

  const expectedRef = normalizeRef(expected.reference)
  const actualRef = normalizeRef(actual.reference)
  const refMatch = Boolean(expectedRef && actualRef && expectedRef === actualRef)
  if (expectedRef || actualRef) {
    signals.push({ key: 'referenceExact', value: refMatch, weight: 0.05 })
  }

  const reservationMatch = Boolean(
    expected.reservationId && actual.reservationId && expected.reservationId === actual.reservationId
  )
  if (expected.reservationId || actual.reservationId) {
    signals.push({ key: 'reservationIdExact', value: reservationMatch, weight: 0.05 })
  }

  const confidence = refMatch || reservationMatch ? 1 : 0.95

  return {
    reason: refMatch || reservationMatch
      ? 'Exact deterministic match on amount, currency, direction, date window and identifier signal.'
      : 'Exact deterministic match on amount, currency, direction and date window.',
    confidence,
    ruleKey: RULE_KEY,
    signals
  }
}

function isExpectedCandidate(tx: NormalizedTransaction): boolean {
  return EXPECTED_SOURCES.has(tx.source) && tx.direction === 'in'
}

function isActualCandidate(tx: NormalizedTransaction): boolean {
  return ACTUAL_SOURCES.has(tx.source) && tx.direction === 'in'
}

export class DeterministicPayoutBankMatcher implements Matcher {
  match(input: MatchingInput, context: MatchingContext): MatchingResult {
    const candidates: MatchingCandidate[] = []
    const matchGroups: MatchGroup[] = []

    const expectedPool = input.expected.filter(isExpectedCandidate)
    const actualPool = input.actual.filter(isActualCandidate)
    const matchedExpected = new Set<TransactionId>()
    const matchedActual = new Set<TransactionId>()

    for (const expected of expectedPool) {
      if (matchedExpected.has(expected.id)) continue

      const compatible = actualPool.filter((actual) => {
        if (matchedActual.has(actual.id)) return false
        if (actual.amountMinor !== expected.amountMinor) return false
        if (actual.currency !== expected.currency) return false
        if (!compatibleDirection(expected.direction, actual.direction)) return false

        const actualDate = actual.valueAt ?? actual.bookedAt
        const expectedDate = expected.valueAt ?? expected.bookedAt
        return daysBetween(actualDate, expectedDate) <= DATE_TOLERANCE_DAYS
      })

      if (compatible.length !== 1) continue

      const actual = compatible[0]
      const dateDiffDays = daysBetween(actual.valueAt ?? actual.bookedAt, expected.valueAt ?? expected.bookedAt)
      const explanation = buildExplanation(expected, actual, dateDiffDays)

      const status: MatchStatus = 'proposed'
      candidates.push({
        expectedTransactionIds: [expected.id],
        actualTransactionIds: [actual.id],
        status,
        explanation
      })

      const groupId = `mg:${context.runId}:${expected.id}:${actual.id}` as MatchGroupId
      matchGroups.push({
        id: groupId,
        transactionIds: [expected.id, actual.id],
        status,
        reason: explanation.reason,
        confidence: explanation.confidence,
        ruleKey: explanation.ruleKey,
        autoCreated: true,
        createdAt: context.requestedAt
      })

      matchedExpected.add(expected.id)
      matchedActual.add(actual.id)
    }

    return {
      matchGroups,
      candidates,
      unmatchedExpectedIds: expectedPool.filter((e) => !matchedExpected.has(e.id)).map((e) => e.id),
      unmatchedActualIds: actualPool.filter((a) => !matchedActual.has(a.id)).map((a) => a.id)
    }
  }
}
