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
  ReconciliationService
} from './contracts'

export { DefaultReconciliationService, reconcileExtractedRecords } from './service'
