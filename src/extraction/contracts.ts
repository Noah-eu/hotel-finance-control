import type { ExtractedRecord, SourceDocument } from '../domain'

export interface DeterministicDocumentParserInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

export interface DeterministicDocumentParser {
  parse(input: DeterministicDocumentParserInput): ExtractedRecord[]
}

export interface DocumentIngestionCapabilities {
  mode: 'deterministic-primary'
  ocrFallback: 'not-implemented'
}

export function documentIngestionCapabilities(): DocumentIngestionCapabilities {
  return {
    mode: 'deterministic-primary',
    ocrFallback: 'not-implemented'
  }
}