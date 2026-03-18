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
  UploadedMonthlyFile
} from './contracts'

export {
  DefaultMonthlyBatchService,
  prepareUploadedMonthlyFiles,
  runMonthlyReconciliationBatch
} from './service'