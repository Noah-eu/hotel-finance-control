import type {
  MatchStatus,
  SourceSystem,
  TransactionId
} from '../domain/value-types'
import type { MatchGroup, NormalizedTransaction } from '../domain/types'

export interface MatchingInput {
  expected: NormalizedTransaction[]
  actual: NormalizedTransaction[]
}

export interface MatchingContext {
  sourceSystem?: SourceSystem
  runId: string
  requestedAt: string
}

export interface MatchExplanation {
  reason: string
  confidence: number
  ruleKey: string
  signals: Array<{
    key: string
    value: string | number | boolean
    weight?: number
  }>
}

export interface MatchingCandidate {
  expectedTransactionIds: TransactionId[]
  actualTransactionIds: TransactionId[]
  status: MatchStatus
  explanation: MatchExplanation
}

export interface MatchingResult {
  matchGroups: MatchGroup[]
  candidates: MatchingCandidate[]
  unmatchedExpectedIds: TransactionId[]
  unmatchedActualIds: TransactionId[]
}

export interface Matcher {
  match(input: MatchingInput, context: MatchingContext): MatchingResult
}
