import type {
  CurrencyCode,
  DocumentId,
  ExceptionCaseId,
  ExceptionSeverity,
  ExceptionStatus,
  ISODateString,
  MatchGroupId,
  MatchStatus,
  SourceSystem,
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
  amountMinor: number
  currency: CurrencyCode
  bookedAt: ISODateString
  valueAt?: ISODateString
  accountId: string
  counterparty?: string
  reference?: string
  reservationId?: string
  invoiceNumber?: string
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
