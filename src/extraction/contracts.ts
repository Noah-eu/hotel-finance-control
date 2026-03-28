import type { ExtractedRecord, SourceDocument } from '../domain'

export interface DeterministicDocumentParserInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
  binaryContentBase64?: string
}

export interface DeterministicDocumentParser {
  parse(input: DeterministicDocumentParserInput): ExtractedRecord[]
}

export type DeterministicDocumentKind =
  | 'invoice'
  | 'receipt'
  | 'payout_statement'
  | 'other'

export interface DeterministicDocumentExtractionSummary {
  documentKind: DeterministicDocumentKind
  sourceSystem: SourceDocument['sourceSystem']
  documentType: SourceDocument['documentType']
  issuerOrCounterparty?: string
  customer?: string
  issueDate?: string
  taxableDate?: string
  paymentDate?: string
  dueDate?: string
  paymentMethod?: string
  totalAmountMinor?: number
  totalCurrency?: string
  localAmountMinor?: number
  localCurrency?: string
  vatBaseAmountMinor?: number
  vatBaseCurrency?: string
  vatAmountMinor?: number
  vatCurrency?: string
  referenceNumber?: string
  ibanHint?: string
  confidence: 'none' | 'hint' | 'strong'
  missingRequiredFields: string[]
  qrDetected?: boolean
  qrRawPayload?: string
  qrParsedFields?: DeterministicDocumentQrParsedFields
  fieldProvenance?: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>>
  qrRecoveredFields?: DeterministicDocumentSummaryFieldKey[]
  qrConfirmedFields?: DeterministicDocumentSummaryFieldKey[]
  groupedHeaderLabels?: string[]
  groupedHeaderValues?: string[]
  groupedTotalsLabels?: string[]
  groupedTotalsValues?: string[]
  groupedHeaderBlockDebug?: DeterministicDocumentGroupedBlockDebug[]
  groupedTotalsBlockDebug?: DeterministicDocumentGroupedBlockDebug[]
  rawBlockDiscoveryDebug?: DeterministicDocumentRawBlockDebug[]
  fieldExtractionDebug?: Record<string, DeterministicDocumentFieldExtractionDebug>
}

export interface DeterministicDocumentFieldExtractionDebug {
  winnerRule?: string
  winnerValue?: string
  candidateValues: string[]
  rejectedCandidates?: string[]
  groupedRowMatches: string[]
  lineWindowMatches: string[]
  fullDocumentFallbackMatches: string[]
}

export type DeterministicDocumentFieldProvenance = 'text' | 'qr' | 'text+qr-confirmed'

export type DeterministicDocumentSummaryFieldKey =
  | 'referenceNumber'
  | 'issuerOrCounterparty'
  | 'customer'
  | 'issueDate'
  | 'dueDate'
  | 'taxableDate'
  | 'paymentMethod'
  | 'totalAmount'
  | 'vatBaseAmount'
  | 'vatAmount'
  | 'ibanHint'

export interface DeterministicDocumentQrParsedFields {
  account?: string
  ibanHint?: string
  amountMinor?: number
  currency?: string
  variableSymbol?: string
  constantSymbol?: string
  specificSymbol?: string
  recipientName?: string
  message?: string
  dueDate?: string
  referenceNumber?: string
}

export interface DeterministicDocumentGroupedBlockDebug {
  blockTypeCandidate: string
  labels: string[]
  values: string[]
  score: number
  accepted: boolean
  rejectionReason?: string
}

export interface DeterministicDocumentRawBlockDebug {
  blockIndex: number
  rawLines: string[]
  normalizedLines: string[]
  blockTypeGuess: string
  promotedTo?: string
  promotionDecision: string
}

export interface DocumentIngestionCapabilities {
  mode: 'deterministic-primary'
  browserCapabilityLadder: ['structured-parser', 'text-pdf-parser', 'text-document-parser', 'ocr-required']
  ocrFallback: 'not-implemented'
}

export function documentIngestionCapabilities(): DocumentIngestionCapabilities {
  return {
    mode: 'deterministic-primary',
    browserCapabilityLadder: ['structured-parser', 'text-pdf-parser', 'text-document-parser', 'ocr-required'],
    ocrFallback: 'not-implemented'
  }
}
