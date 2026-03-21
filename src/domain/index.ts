export function placeholder() {
  return { name: 'domain' }
}

export type {
  Brand,
  BankFeeCategory,
  RecordId,
  DocumentId,
  TransactionId,
  MatchGroupId,
  ExceptionCaseId,
  ISODateString,
  CurrencyCode,
  Money,
  ExpenseSettlementKind,
  SourceSystem,
  ReservationSettlementChannel,
  SettlementRoutingTarget,
  PayoutBatchPlatform,
  DocumentKind,
  ExtractionMethod,
  TransactionDirection,
  TransactionCategory,
  MatchStatus,
  ExceptionStatus,
  ExceptionSeverity
} from './value-types'

export type {
  SourceDocument,
  ExtractedRecord,
  NormalizedTransaction,
  MatchGroup,
  ExceptionCase,
  ReservationSourceRecord,
  AncillaryRevenueSourceRecord,
  PayoutRowExpectation,
  PayoutBatchExpectation,
  DirectBankSettlementExpectation,
  ExpenseDocumentExpectation,
  BankFeeClassification,
  ReconciliationWorkflowPlan
} from './types'
