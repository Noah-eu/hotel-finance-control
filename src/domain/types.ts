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
  counterpartyAccount?: string
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
  payoutReference?: string
  clientId?: string
  merchantOrderReference?: string
  payerVariableSymbol?: string
  comgateTransactionId?: string
  createdAt?: ISODateString
  paidAt?: ISODateString
  transferredAt?: ISODateString
  confirmedGrossMinor?: number
  transferredNetMinor?: number
  feeTotalMinor?: number
  feeInterbankMinor?: number
  feeAssociationMinor?: number
  feeProcessorMinor?: number
  paymentMethod?: string
  cardType?: string
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
  sourceRecordId: string
  sourceDocumentId: DocumentId
  sourceSystem: 'previo'
  reference: string
  reservationId?: string
  bookedAt?: ISODateString
  createdAt?: ISODateString
  stayStartAt?: ISODateString
  stayEndAt?: ISODateString
  itemLabel?: string
  channel?: string
  grossRevenueMinor: number
  outstandingBalanceMinor?: number
  currency: CurrencyCode
}

export interface InvoiceListEnrichmentRecord {
  sourceRecordId: string
  sourceDocumentId: DocumentId
  recordKind: 'header' | 'line-item'
  invoiceDocumentType?: string
  invoiceLineDocumentType?: string
  voucher?: string
  variableSymbol?: string
  invoiceNumber?: string
  customerId?: string
  customerName?: string
  guestName?: string
  stayStartAt?: ISODateString
  stayEndAt?: ISODateString
  roomName?: string
  paymentMethod?: string
  itemLabel?: string
  grossAmountMinor?: number
  netAmountMinor?: number
  currency: CurrencyCode
}

export interface ReservationSettlementMatch {
  reservationId: string
  reference?: string
  sourceDocumentId: DocumentId
  settlementKind: 'payout_row' | 'direct_bank_settlement'
  matchedRowId?: string
  matchedSettlementId?: string
  platform: 'booking' | 'airbnb' | 'comgate' | 'expedia_direct_bank' | 'direct_bank_transfer'
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
  totalFeeMinor?: number
  matchingAmountMinor?: number
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
  fromPreviousMonth?: boolean
  sourceMonthKey?: string
  bankRoutingTarget: 'rb_bank_inflow'
  rowIds: string[]
  expectedTotalMinor: number
  grossTotalMinor?: number
  feeTotalMinor?: number
  netSettlementTotalMinor?: number
  currency: CurrencyCode
  componentReservationIds?: string[]
  sourceEvidenceSummary?: string[]
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
  channel: 'expedia_direct_bank' | 'direct_bank_transfer'
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
  previoReservationTruth?: ReservationSourceRecord[]
  reservationSources: ReservationSourceRecord[]
  ancillaryRevenueSources: AncillaryRevenueSourceRecord[]
  invoiceListEnrichment: InvoiceListEnrichmentRecord[]
  reservationSettlementMatches: ReservationSettlementMatch[]
  reservationSettlementNoMatches: ReservationSettlementNoMatch[]
  payoutRows: PayoutRowExpectation[]
  payoutBatches: PayoutBatchExpectation[]
  directBankSettlements: DirectBankSettlementExpectation[]
  expenseDocuments: ExpenseDocumentExpectation[]
  bankFeeClassifications: BankFeeClassification[]
}
