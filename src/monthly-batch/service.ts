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
  MonthlyBatchService,
  UploadedMonthlyFile
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

export function prepareUploadedMonthlyFiles(files: UploadedMonthlyFile[]): ImportedMonthlySourceFile[] {
  return files.map((file, index) => ({
    sourceDocument: buildSourceDocument(file, index),
    content: file.content
  }))
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

function buildSourceDocument(file: UploadedMonthlyFile, index: number): SourceDocument {
  const fileName = file.name.trim()
  const normalized = fileName.toLowerCase()
  const sourceSystem = inferSourceSystem(normalized)
  const documentType = inferDocumentType(sourceSystem)

  return {
    id: `uploaded:${sourceSystem}:${index + 1}:${slugify(fileName)}` as SourceDocument['id'],
    sourceSystem,
    documentType,
    fileName,
    uploadedAt: file.uploadedAt
  }
}

function inferSourceSystem(fileName: string): SourceDocument['sourceSystem'] {
  if (fileName.includes('raiff') || fileName.includes('raiffeisen')) {
    return 'bank'
  }

  if (fileName.includes('fio')) {
    return 'bank'
  }

  if (fileName.includes('booking')) {
    return 'booking'
  }

  if (fileName.includes('comgate')) {
    return 'comgate'
  }

  if (fileName.includes('invoice') || fileName.includes('faktura')) {
    return 'invoice'
  }

  if (fileName.includes('receipt') || fileName.includes('uctenka') || fileName.includes('účtenka')) {
    return 'receipt'
  }

  return 'unknown'
}

function inferDocumentType(sourceSystem: SourceDocument['sourceSystem']): SourceDocument['documentType'] {
  switch (sourceSystem) {
    case 'bank':
      return 'bank_statement'
    case 'booking':
      return 'ota_report'
    case 'comgate':
      return 'payment_gateway_report'
    case 'invoice':
      return 'invoice'
    case 'receipt':
      return 'receipt'
    default:
      return 'other'
  }
}

function slugify(fileName: string): string {
  return fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
}