export function placeholder() {
  return {
    name: 'reconciliation',
    pipeline: 'default'
  }
}

export type {
  ReconciliationInput,
  ReconciliationContext,
  ReconciliationSummary,
  ReconciliationResult,
  ReconciliationService,
  PayoutBatchBankMatch,
  PayoutBatchNoMatchDiagnostic,
  PayoutBatchCandidateDiagnostic
} from './contracts'

export { DefaultReconciliationService, reconcileExtractedRecords } from './service'
export { buildReconciliationWorkflowPlan } from './workflow-plan'
export {
  matchPayoutBatchesToBank,
  diagnoseUnmatchedPayoutBatchesToBank
} from './payout-batch-bank.matcher'
export { matchReservationSourcesToSettlements } from './reservation-settlement.matcher'
