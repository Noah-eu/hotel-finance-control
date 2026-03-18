import type {
  ExceptionSeverity,
  ExceptionStatus,
  ISODateString,
  TransactionId
} from '../domain/value-types'
import type { ExceptionCase, ExtractedRecord, MatchGroup, SourceDocument } from '../domain/types'

export interface ExceptionDetectionInput {
  unmatchedTransactions?: Array<{
    transactionId: TransactionId
    reason: string
    ruleCode?: string
    severity?: ExceptionSeverity
    sourceDocumentIds?: SourceDocument['id'][]
    extractedRecordIds?: ExtractedRecord['id'][]
    recommendedNextStep?: string
  }>
  unmatchedDocuments?: SourceDocument[]
  lowConfidenceMatches?: Array<{
    matchGroup: MatchGroup
    threshold: number
  }>
}

export interface ExceptionDetectionContext {
  runId: string
  requestedAt: ISODateString
  defaultStatus?: ExceptionStatus
}

export interface ExceptionDetectionResult {
  cases: ExceptionCase[]
  trace: Array<{
    exceptionCaseId: ExceptionCase['id']
    source: 'unmatched_transaction' | 'unmatched_document' | 'low_confidence_match'
    referenceId: string
  }>
}

export interface ExceptionDetector {
  detect(input: ExceptionDetectionInput, context: ExceptionDetectionContext): ExceptionDetectionResult
}

const DEFAULT_STATUS: ExceptionStatus = 'open'

export class BaselineExceptionDetector implements ExceptionDetector {
  detect(
    input: ExceptionDetectionInput,
    context: ExceptionDetectionContext
  ): ExceptionDetectionResult {
    const cases: ExceptionCase[] = []
    const trace: ExceptionDetectionResult['trace'] = []

    for (const unmatched of input.unmatchedTransactions ?? []) {
      const id = toExceptionCaseId(`exc:txn:${unmatched.transactionId}`)
      cases.push({
        id,
        type: 'unmatched_transaction',
        ruleCode: unmatched.ruleCode,
        severity: unmatched.severity ?? 'medium',
        status: context.defaultStatus ?? DEFAULT_STATUS,
        explanation: unmatched.reason,
        relatedTransactionIds: [unmatched.transactionId],
        relatedExtractedRecordIds: unmatched.extractedRecordIds ?? [],
        relatedSourceDocumentIds: unmatched.sourceDocumentIds ?? [],
        recommendedNextStep:
          unmatched.recommendedNextStep
          ?? 'Review transaction classification and collect supporting documents.',
        createdAt: context.requestedAt
      })
      trace.push({
        exceptionCaseId: id,
        source: 'unmatched_transaction',
        referenceId: unmatched.transactionId
      })
    }

    for (const document of input.unmatchedDocuments ?? []) {
      const id = toExceptionCaseId(`exc:doc:${document.id}`)
      cases.push({
        id,
        type: 'unmatched_document',
        severity: 'high',
        status: context.defaultStatus ?? DEFAULT_STATUS,
        explanation: `Uploaded document \"${document.fileName}\" is not linked to a reconciled transaction or match group.`,
        relatedTransactionIds: [],
        relatedExtractedRecordIds: [],
        relatedSourceDocumentIds: [document.id],
        recommendedNextStep: 'Check extraction results and connect the document to the correct reservation, payout, or expense.',
        createdAt: context.requestedAt
      })
      trace.push({
        exceptionCaseId: id,
        source: 'unmatched_document',
        referenceId: document.id
      })
    }

    for (const candidate of input.lowConfidenceMatches ?? []) {
      const id = toExceptionCaseId(`exc:match:${candidate.matchGroup.id}`)
      cases.push({
        id,
        type: 'low_confidence_match',
        severity: candidate.matchGroup.confidence < candidate.threshold / 2 ? 'high' : 'medium',
        status: context.defaultStatus ?? DEFAULT_STATUS,
        explanation: `Match group ${candidate.matchGroup.id} has confidence ${candidate.matchGroup.confidence.toFixed(2)}, below threshold ${candidate.threshold.toFixed(2)}.`,
        relatedTransactionIds: candidate.matchGroup.transactionIds,
        relatedExtractedRecordIds: [],
        relatedSourceDocumentIds: [],
        recommendedNextStep: 'Request human review before confirming this match.',
        createdAt: context.requestedAt
      })
      trace.push({
        exceptionCaseId: id,
        source: 'low_confidence_match',
        referenceId: candidate.matchGroup.id
      })
    }

    return { cases, trace }
  }
}

const defaultDetector = new BaselineExceptionDetector()

export function detectExceptions(
  input: ExceptionDetectionInput,
  context: ExceptionDetectionContext
): ExceptionDetectionResult {
  return defaultDetector.detect(input, context)
}

export function placeholder() {
  return {
    name: 'exceptions',
    detector: 'baseline',
    detectExceptions
  }
}

function toExceptionCaseId(value: string): ExceptionCase['id'] {
  return value as ExceptionCase['id']
}

export type { ExceptionCase } from '../domain/types'
