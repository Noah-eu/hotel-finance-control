import type { ExtractedRecord, SourceDocument } from '../domain'
import {
  parseBookingPayoutExport,
  parseComgateExport,
  parseFioStatement,
  parseInvoiceDocument,
  parseRaiffeisenbankStatement
} from '../extraction'
import { reconcileExtractedRecords } from '../reconciliation'
import { buildReconciliationReport } from '../reporting'
import type {
  ImportedMonthlySourceFile,
  MonthlyBatchInput,
  MonthlyBatchResult,
  MonthlyBatchService
} from './contracts'

type Parser = (input: {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}) => ExtractedRecord[]

export class DefaultMonthlyBatchService implements MonthlyBatchService {
  run(input: MonthlyBatchInput): MonthlyBatchResult {
    const files = input.files.map((file) => {
      const parser = selectParser(file.sourceDocument)
      const extractedRecords = parser({
        sourceDocument: file.sourceDocument,
        content: file.content,
        extractedAt: input.reconciliationContext.requestedAt
      })

      return {
        sourceDocumentId: file.sourceDocument.id,
        extractedRecords
      }
    })

    const extractedRecords = files.flatMap((file) => file.extractedRecords)
    const reconciliation = reconcileExtractedRecords(
      { extractedRecords },
      input.reconciliationContext
    )
    const report = buildReconciliationReport({
      reconciliation,
      generatedAt: input.reportGeneratedAt
    })

    return {
      extractedRecords,
      reconciliation,
      report,
      files: files.map((file) => ({
        sourceDocumentId: file.sourceDocumentId,
        extractedRecordIds: file.extractedRecords.map((record) => record.id),
        extractedCount: file.extractedRecords.length
      }))
    }
  }
}

const defaultMonthlyBatchService = new DefaultMonthlyBatchService()

export function runMonthlyReconciliationBatch(input: MonthlyBatchInput): MonthlyBatchResult {
  return defaultMonthlyBatchService.run(input)
}

function selectParser(sourceDocument: SourceDocument): Parser {
  if (sourceDocument.sourceSystem === 'bank' && sourceDocument.fileName.includes('raiffeisen')) {
    return parseRaiffeisenbankStatement
  }

  if (sourceDocument.sourceSystem === 'bank' && sourceDocument.fileName.includes('fio')) {
    return parseFioStatement
  }

  if (sourceDocument.sourceSystem === 'booking') {
    return parseBookingPayoutExport
  }

  if (sourceDocument.sourceSystem === 'comgate') {
    return parseComgateExport
  }

  if (sourceDocument.sourceSystem === 'invoice') {
    return parseInvoiceDocument
  }

  throw new Error(
    `No monthly batch parser configured for source document ${sourceDocument.id} (${sourceDocument.sourceSystem}/${sourceDocument.fileName})`
  )
}