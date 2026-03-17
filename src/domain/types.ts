export type ISODateString = string

export interface SourceDocument {
  id: string
  sourceSystem: string
  documentType: string
  fileName: string
  uploadedAt: ISODateString
  checksum?: string
  metadata?: Record<string, string>
}

export interface ExtractedRecord {
  id: string
  sourceDocumentId: string
  recordType: string
  extractedAt: ISODateString
  rawReference?: string
  amountMinor?: number
  currency?: string
  occurredAt?: ISODateString
  data: Record<string, unknown>
}

export interface NormalizedTransaction {
  id: string
  direction: 'in' | 'out' | 'internal'
  source: string
  amountMinor: number
  currency: string
  bookedAt: ISODateString
  valueAt?: ISODateString
  accountId: string
  counterparty?: string
  reference?: string
  reservationId?: string
  invoiceNumber?: string
  extractedRecordIds: string[]
  sourceDocumentIds: string[]
}

export interface MatchGroup {
  id: string
  transactionIds: string[]
  status: 'proposed' | 'confirmed' | 'rejected'
  reason: string
  confidence: number
  ruleKey: string
  autoCreated: boolean
  createdAt: ISODateString
}

export interface ExceptionCase {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_review' | 'resolved' | 'dismissed'
  explanation: string
  relatedTransactionIds: string[]
  relatedExtractedRecordIds: string[]
  relatedSourceDocumentIds: string[]
  recommendedNextStep?: string
  createdAt: ISODateString
  resolvedAt?: ISODateString
}
