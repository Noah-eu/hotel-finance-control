import type {
  BankFeeCategory,
  CurrencyCode,
  DocumentSettlementDirection,
  DocumentId,
  ExpenseSettlementKind,
  ExceptionCaseId,
  ExceptionSeverity,
  ExceptionStatus,
  ISODateString,
  MatchGroupId,
  MatchStatus,
  PayoutBatchPlatform,
  ReservationSettlementChannel,
  SourceSystem,
  SettlementRoutingTarget,
  TransactionDirection,
  TransactionId
} from './value-types'

export interface SourceDocument {
  id: DocumentId
  sourceSystem: SourceSystem
  documentType: string
  fileName: string
  uploadedAt: ISODateString
  checksum?: string
  metadata?: Record<string, string>
}

export interface ExtractedRecord {
  id: string
  sourceDocumentId: DocumentId
  recordType: string
  extractedAt: ISODateString
  rawReference?: string
  amountMinor?: number
  currency?: CurrencyCode
  occurredAt?: ISODateString
  data: Record<string, unknown>
}

export interface NormalizedTransaction {
  id: TransactionId
  direction: TransactionDirection
  source: SourceSystem
  subtype?: string
  settlementDirection?: DocumentSettlementDirection
  amountMinor: number
  currency: CurrencyCode
  bookedAt: ISODateString
  valueAt?: ISODateString
  accountId: string
  counterparty?: string
  reference?: string
  referenceHints?: string[]
  reservationId?: string
  bookingPayoutBatchKey?: string
  payoutBatchIdentity?: string
  payoutSupplementPaymentId?: string
  payoutSupplementPayoutDate?: ISODateString
  payoutSupplementPayoutTotalAmountMinor?: number
  payoutSupplementPayoutTotalCurrency?: CurrencyCode
  payoutSupplementLocalAmountMinor?: number
  payoutSupplementLocalCurrency?: CurrencyCode
  payoutSupplementIbanSuffix?: string
  payoutSupplementExchangeRate?: string
  payoutSupplementReferenceHints?: string[]
  payoutSupplementSourceDocumentIds?: DocumentId[]
  payoutSupplementReservationIds?: string[]
  invoiceNumber?: string
  variableSymbol?: string
  targetBankAccountHint?: string
  extractedRecordIds: string[]
  sourceDocumentIds: DocumentId[]
}

export interface MatchGroup {
  id: MatchGroupId
  transactionIds: TransactionId[]
  status: MatchStatus
  reason: string
  confidence: number
  ruleKey: string
  autoCreated: boolean
  createdAt: ISODateString
}

export interface ExceptionCase {
  id: ExceptionCaseId
  type: string
  ruleCode?: string
  severity: ExceptionSeverity
  status: ExceptionStatus
  explanation: string
  relatedTransactionIds: TransactionId[]
  relatedExtractedRecordIds: string[]
  relatedSourceDocumentIds: DocumentId[]
  recommendedNextStep?: string
  createdAt: ISODateString
  resolvedAt?: ISODateString
}

export interface ReservationSourceRecord {
  reservationId: string
  sourceDocumentId: DocumentId
  sourceSystem: 'previo'
  bookedAt: ISODateString
  createdAt?: ISODateString
  reference?: string
  guestName?: string
  channel?: string
  stayStartAt?: ISODateString
  stayEndAt?: ISODateString
  propertyId?: string
  grossRevenueMinor: number
  netRevenueMinor?: number
  outstandingBalanceMinor?: number
  roomName?: string
  companyName?: string
  currency: CurrencyCode
  expectedSettlementChannels: ReservationSettlementChannel[]
}

export interface AncillaryRevenueSourceRecord {
  sourceDocumentId: DocumentId
  sourceSystem: 'previo'
  reference: string
  reservationId?: string
  bookedAt?: ISODateString
  createdAt?: ISODateString
  itemLabel?: string
  channel?: string
  grossRevenueMinor: number
  outstandingBalanceMinor?: number
  currency: CurrencyCode
}

export interface ReservationSettlementMatch {
  reservationId: string
  reference?: string
  sourceDocumentId: DocumentId
  settlementKind: 'payout_row' | 'direct_bank_settlement'
  matchedRowId?: string
  matchedSettlementId?: string
  platform: 'booking' | 'airbnb' | 'comgate' | 'expedia_direct_bank'
  amountMinor: number
  currency: CurrencyCode
  confidence: number
  reasons: string[]
  evidence: Array<{
    key: string
    value: string | number | boolean
  }>
}

export interface ReservationSettlementNoMatch {
  reservationId: string
  reference?: string
  sourceDocumentId: DocumentId
  candidateCount: number
  noMatchReason: 'noCandidate' | 'ambiguousCandidates' | 'channelMismatch' | 'amountMismatch'
}

export interface PayoutRowExpectation {
  rowId: string
  platform: PayoutBatchPlatform
  sourceDocumentId: DocumentId
  reservationId?: string
  payoutReference: string
  payoutDate: ISODateString
  payoutBatchKey: string
  amountMinor: number
  currency: CurrencyCode
  bankRoutingTarget: 'rb_bank_inflow'
  payoutSupplementPaymentId?: string
  payoutSupplementPayoutDate?: ISODateString
  payoutSupplementPayoutTotalAmountMinor?: number
  payoutSupplementPayoutTotalCurrency?: CurrencyCode
  payoutSupplementLocalAmountMinor?: number
  payoutSupplementLocalCurrency?: CurrencyCode
  payoutSupplementIbanSuffix?: string
  payoutSupplementExchangeRate?: string
  payoutSupplementReferenceHints?: string[]
  payoutSupplementSourceDocumentIds?: DocumentId[]
  payoutSupplementReservationIds?: string[]
}

export interface PayoutBatchExpectation {
  payoutBatchKey: string
  platform: PayoutBatchPlatform
  payoutReference: string
  payoutDate: ISODateString
  bankRoutingTarget: 'rb_bank_inflow'
  rowIds: string[]
  expectedTotalMinor: number
  currency: CurrencyCode
  payoutSupplementPaymentId?: string
  payoutSupplementPayoutDate?: ISODateString
  payoutSupplementPayoutTotalAmountMinor?: number
  payoutSupplementPayoutTotalCurrency?: CurrencyCode
  payoutSupplementLocalAmountMinor?: number
  payoutSupplementLocalCurrency?: CurrencyCode
  payoutSupplementIbanSuffix?: string
  payoutSupplementExchangeRate?: string
  payoutSupplementReferenceHints?: string[]
  payoutSupplementSourceDocumentIds?: DocumentId[]
  payoutSupplementReservationIds?: string[]
}

export interface DirectBankSettlementExpectation {
  settlementId: string
  channel: 'expedia_direct_bank'
  reservationId: string
  bankRoutingTarget: 'fio_bank_inflow'
  accountIdHint?: string
  bookedAt: ISODateString
  amountMinor: number
  currency: CurrencyCode
}

export interface ExpenseDocumentExpectation {
  documentId: DocumentId
  kind: ExpenseSettlementKind
  sourceSystem: 'invoice' | 'receipt'
  settlementDirection: DocumentSettlementDirection
  bookedAt: ISODateString
  amountMinor: number
  currency: CurrencyCode
  expectedBankDirection: 'in' | 'out'
  routingTarget: 'document_expense_outflow' | 'document_refund_inflow'
  documentReference?: string
  targetBankAccountHint?: string
}

export interface BankFeeClassification {
  transactionId: TransactionId
  category: BankFeeCategory
  bankRoutingTarget: SettlementRoutingTarget
  bankAccountId?: string
  reason: string
}

export interface ReconciliationWorkflowPlan {
  reservationSources: ReservationSourceRecord[]
  ancillaryRevenueSources: AncillaryRevenueSourceRecord[]
  reservationSettlementMatches: ReservationSettlementMatch[]
  reservationSettlementNoMatches: ReservationSettlementNoMatch[]
  payoutRows: PayoutRowExpectation[]
  payoutBatches: PayoutBatchExpectation[]
  directBankSettlements: DirectBankSettlementExpectation[]
  expenseDocuments: ExpenseDocumentExpectation[]
  bankFeeClassifications: BankFeeClassification[]
}
