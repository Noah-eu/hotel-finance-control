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
  UploadedMonthlyIngestionResult,
  UploadedMonthlyFileClassificationBasis,
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
