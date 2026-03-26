import type { ExtractedRecord, SourceDocument } from '../domain'

export interface DeterministicDocumentParserInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
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
  fieldExtractionDebug?: Record<string, DeterministicDocumentFieldExtractionDebug>
}

export interface DeterministicDocumentFieldExtractionDebug {
  winnerRule?: string
  winnerValue?: string
  candidateValues: string[]
  groupedRowMatches: string[]
  lineWindowMatches: string[]
  fullDocumentFallbackMatches: string[]
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
