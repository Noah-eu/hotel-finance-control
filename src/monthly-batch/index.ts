export function placeholder() {
  return {
    name: 'monthly-batch',
    mode: 'deterministic'
  }
}

export type {
  ImportedMonthlySourceFile,
  MonthlyBatchFileResult,
  MonthlyBatchInput,
  MonthlyBatchResult,
  MonthlyBatchService,
  PreparedUploadedMonthlyFilesResult,
  UploadedMonthlyFileCapabilityAssessment,
  UploadedMonthlyFileCapabilityProfile,
  UploadedMonthlyIngestionResult,
  UploadedMonthlyFileClassificationBasis,
  UploadedMonthlyFileDecision,
  UploadedMonthlyFileDecisionBucket,
  UploadedMonthlyFileDecisionConfidence,
  UploadedMonthlyFileIngestionBranch,
  UploadedMonthlyFileSourceDescriptor,
  UploadedMonthlyFileRoute,
  UploadedMonthlyFile,
  PreviousMonthCarryoverSource
} from './contracts'

export type { UploadedMonthlyIngestionProgress } from './service'

export {
  DefaultMonthlyBatchService,
  ingestUploadedMonthlyFiles,
  ingestUploadedMonthlyFilesProgressively,
  prepareUploadedMonthlyBatchFiles,
  prepareUploadedMonthlyFiles,
  runMonthlyReconciliationBatch
} from './service'

export {
  detectUploadedMonthlyFileCapability,
  resolveUploadedMonthlyFileIngestionBranch
} from './capabilities'
