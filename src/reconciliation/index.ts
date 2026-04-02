export function placeholder() {
  return {
    name: 'reconciliation',
    pipeline: 'default'
  }
}

export type {
  CarryoverSourcePayoutBatch,
  ReconciliationInput,
  ReconciliationContext,
  ReconciliationSummary,
  ReconciliationResult,
  ReconciliationService,
  PayoutBatchBankMatch,
  PayoutBatchNoMatchDiagnostic,
  PayoutBatchCandidateDiagnostic,
  PayoutBatchBankDecisionTrace,
  PreviousMonthCarryoverSource
} from './contracts'

export { DefaultReconciliationService, reconcileExtractedRecords } from './service'
export { buildReconciliationWorkflowPlan } from './workflow-plan'
export {
  matchPayoutBatchesToBank,
  diagnoseUnmatchedPayoutBatchesToBank,
  inspectPayoutBatchBankDecisions
} from './payout-batch-bank.matcher'
export { matchReservationSourcesToSettlements } from './reservation-settlement.matcher'
