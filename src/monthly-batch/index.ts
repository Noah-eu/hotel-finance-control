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
  UploadedMonthlyFile
} from './contracts'

export {
  DefaultMonthlyBatchService,
  ingestUploadedMonthlyFiles,
  prepareUploadedMonthlyBatchFiles,
  prepareUploadedMonthlyFiles,
  runMonthlyReconciliationBatch
} from './service'

export {
  detectUploadedMonthlyFileCapability,
  resolveUploadedMonthlyFileIngestionBranch
} from './capabilities'
