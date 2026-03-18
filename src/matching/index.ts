export function placeholder() {
  return { name: 'matching' }
}

export type {
  MatchingInput,
  MatchingContext,
  MatchingCandidate,
  MatchExplanation,
  MatchingResult,
  Matcher
} from './contracts'

export { DeterministicPayoutBankMatcher } from './deterministic-payout-bank.matcher'
export type { MatchTransactionsInput } from './service'
export { matchTransactions } from './service'
