export function placeholder() {
  return { name: 'domain' }
}

export type {
  Brand,
  RecordId,
  DocumentId,
  TransactionId,
  MatchGroupId,
  ExceptionCaseId,
  ISODateString,
  CurrencyCode,
  Money,
  SourceSystem,
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
  ExceptionCase
} from './types'
