import type { NormalizedTransaction } from '../domain/types'
import type { MatchingContext, MatchingResult } from './contracts'
import { DeterministicPayoutBankMatcher } from './deterministic-payout-bank.matcher'

const defaultMatcher = new DeterministicPayoutBankMatcher()

export interface MatchTransactionsInput {
  expected: NormalizedTransaction[]
  actual: NormalizedTransaction[]
}

export function matchTransactions(
  input: MatchTransactionsInput,
  context: MatchingContext
): MatchingResult {
  return defaultMatcher.match(input, context)
}
