import type { ExtractedRecord, SourceDocument } from '../domain'
import type { DocumentSettlementDirection } from '../domain'

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
  settlementDirection?: DocumentSettlementDirection
  issuerOrCounterparty?: string
  customer?: string
  billingPeriod?: string
  issueDate?: string
  taxableDate?: string
  paymentDate?: string
  dueDate?: string
  paymentMethod?: string
  totalAmountMinor?: number
  totalCurrency?: string
  settlementAmountMinor?: number
  settlementCurrency?: string
  summaryTotalAmountMinor?: number
  summaryTotalCurrency?: string
  localAmountMinor?: number
  localCurrency?: string
  vatBaseAmountMinor?: number
  vatBaseCurrency?: string
  vatAmountMinor?: number
  vatCurrency?: string
  referenceNumber?: string
  variableSymbol?: string
  ibanHint?: string
  targetBankAccountHint?: string
  confidence: 'none' | 'hint' | 'strong'
  finalStatus: DeterministicDocumentFinalStatus
  requiredFieldsCheck: 'passed' | 'failed'
  missingRequiredFields: string[]
  invoiceScanFallbackApplied?: boolean
  invoiceScanFallbackRejectedReason?: string
  invoiceScanFallbackRecordCreated?: boolean
  invoiceScanFallbackRecordDroppedReason?: string
  qrDetected?: boolean
  qrRawPayload?: string
  qrParsedFields?: DeterministicDocumentQrParsedFields
  ocrDetected?: boolean
  ocrRawPayload?: string
  ocrParsedFields?: DeterministicDocumentOcrParsedFields
  fieldProvenance?: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>>
  fieldConfidence?: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldConfidence>>
  qrRecoveredFields?: DeterministicDocumentSummaryFieldKey[]
  qrConfirmedFields?: DeterministicDocumentSummaryFieldKey[]
  ocrRecoveredFields?: DeterministicDocumentSummaryFieldKey[]
  ocrConfirmedFields?: DeterministicDocumentSummaryFieldKey[]
  extractionStages?: DeterministicDocumentExtractionStageDebug[]
  groupedHeaderLabels?: string[]
  groupedHeaderValues?: string[]
  groupedTotalsLabels?: string[]
  groupedTotalsValues?: string[]
  groupedHeaderBlockDebug?: DeterministicDocumentGroupedBlockDebug[]
  groupedTotalsBlockDebug?: DeterministicDocumentGroupedBlockDebug[]
  rawBlockDiscoveryDebug?: DeterministicDocumentRawBlockDebug[]
  fieldExtractionDebug?: Record<string, DeterministicDocumentFieldExtractionDebug>
  receiptParsingDebug?: ReceiptParsingDebug
}

export interface ReceiptParsingAmountCandidateDebug {
  lineIndex: number
  matchIndex: number
  line: string
  raw: string
  currency: string
  amountMinor: number
  score?: number
  source: string
}

export interface ReceiptParsingDebug {
  normalizedLines: string[]
  reconstructedReceiptLines: string[]
  reconstructedFooterLines: string[]
  footerWindowLines: string[]
  vendorProfileSelected: string
  amountCandidates: ReceiptParsingAmountCandidateDebug[]
  anchoredAmountCandidates: ReceiptParsingAmountCandidateDebug[]
  anchoredSearchInputSource: 'raw-normalized-lines' | 'footer-window-lines' | 'reconstructed-footer-lines'
  anchoredCandidateCountBeforeReconstruction: number
  anchoredCandidateCountAfterReconstruction: number
  footerAnchorMatched: boolean
  finalTotalCandidateScope: 'footer-window' | 'reconstructed-lines' | 'generic-fallback'
  footerAmountCandidatesRaw: string[]
  footerAmountCandidatesNormalized: ReceiptParsingAmountCandidateDebug[]
  footerAmountWinnerRaw?: string
  footerAmountWinnerReason: string
  footerAnchorRejectedLines: string[]
  footerNormalizationSteps: string[]
  rejectedHighScoreBodyCandidates: ReceiptParsingAmountCandidateDebug[]
  reconstructedAmountTokens: string[]
  genericInferredTotalRaw?: string
  vendorSelectedTotalRaw?: string
  finalTotalRaw?: string
  genericInferredDateRaw?: string
  vendorSelectedDateRaw?: string
  finalDateRaw?: string
  winningAmountSource: string
  winningDateSource: string
  anchoredFinalTotalMatched: boolean
  anchoredFinalTotalHadCandidates: boolean
  anchoredFinalTotalRejected: boolean
  anchoredFinalTotalOverwritten: boolean
  anchoredFinalTotalReason: string
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

export type DeterministicDocumentFieldConfidence = 'none' | 'hint' | 'strong'

export type DeterministicDocumentFieldProvenance =
  | 'text'
  | 'qr'
  | 'ocr'
  | 'vision'
  | 'inferred'
  | 'text+qr-confirmed'

export type DeterministicDocumentFinalStatus = 'parsed' | 'needs_review' | 'failed'

export type DeterministicDocumentSummaryFieldKey =
  | 'referenceNumber'
  | 'issuerOrCounterparty'
  | 'customer'
  | 'issueDate'
  | 'paymentDate'
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

export interface DeterministicDocumentOcrParsedFields {
  referenceNumber?: string
  issuerOrCounterparty?: string
  customer?: string
  issueDate?: string
  dueDate?: string
  taxableDate?: string
  paymentDate?: string
  paymentMethod?: string
  totalAmount?: string
  vatBaseAmount?: string
  vatAmount?: string
  ibanHint?: string
  category?: string
  note?: string
}

export interface DeterministicDocumentExtractionStageDebug {
  stage:
  | 'text_layer_parse'
  | 'qr_or_spd_fallback'
  | 'ocr_or_vision_fallback'
  | 'validation_and_confidence'
  outcome: 'applied' | 'skipped' | 'not_available'
  adapter?: 'text' | 'qr' | 'ocr' | 'vision'
  recoveredFields?: DeterministicDocumentSummaryFieldKey[]
  confirmedFields?: DeterministicDocumentSummaryFieldKey[]
  notes?: string[]
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
  ocrFallback: 'stub-adapter'
}

export function documentIngestionCapabilities(): DocumentIngestionCapabilities {
  return {
    mode: 'deterministic-primary',
    browserCapabilityLadder: ['structured-parser', 'text-pdf-parser', 'text-document-parser', 'ocr-required'],
    ocrFallback: 'stub-adapter'
  }
}
