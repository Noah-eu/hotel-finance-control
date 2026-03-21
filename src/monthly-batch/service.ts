import type { ExtractedRecord, SourceDocument } from '../domain'
import {
  parseAirbnbPayoutExport,
  parseBookingPayoutExport,
  parseComgateExport,
  parseExpediaPayoutExport,
  parseFioStatement,
  parseInvoiceDocument,
  parsePrevioReservationExport,
  parseReceiptDocument,
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
  binaryContentBase64?: string
}) => ExtractedRecord[]

export class DefaultMonthlyBatchService implements MonthlyBatchService {
  run(input: MonthlyBatchInput): MonthlyBatchResult {
    const files = input.files.map((file) => {
      const parser = selectParser(file.sourceDocument, file.content)
      const extractedRecords = parser({
        sourceDocument: file.sourceDocument,
        content: file.content,
        extractedAt: input.reconciliationContext.requestedAt,
        binaryContentBase64: file.binaryContentBase64
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
    content: file.content,
    binaryContentBase64: file.binaryContentBase64
  }))
}

function selectParser(sourceDocument: SourceDocument, content: string): Parser {
  if (sourceDocument.sourceSystem === 'bank' && inferBankParserVariant(sourceDocument.fileName, content) === 'raiffeisenbank') {
    return parseRaiffeisenbankStatement
  }

  if (sourceDocument.sourceSystem === 'bank' && inferBankParserVariant(sourceDocument.fileName, content) === 'fio') {
    return parseFioStatement
  }

  if (sourceDocument.sourceSystem === 'booking') {
    return parseBookingPayoutExport
  }

  if (sourceDocument.sourceSystem === 'airbnb') {
    return parseAirbnbPayoutExport
  }

  if (sourceDocument.sourceSystem === 'expedia') {
    return parseExpediaPayoutExport
  }

  if (sourceDocument.sourceSystem === 'previo') {
    return parsePrevioReservationExport
  }

  if (sourceDocument.sourceSystem === 'comgate') {
    return parseComgateExport
  }

  if (sourceDocument.sourceSystem === 'invoice') {
    return parseInvoiceDocument
  }

  if (sourceDocument.sourceSystem === 'receipt') {
    return parseReceiptDocument
  }

  throw new Error(
    `No monthly batch parser configured for source document ${sourceDocument.id} (${sourceDocument.sourceSystem}/${sourceDocument.fileName})`
  )
}

function inferBankParserVariant(fileName: string, content: string): 'raiffeisenbank' | 'fio' | 'unknown' {
  const normalizedFileName = fileName.toLowerCase()
  const headerFields = getNormalizedHeaderFields(content)
  const normalizedHeaderSample = getNormalizedHeaderSample(content)
  const isCanonicalBankHeader = matchesAnyHeaderSignature(normalizedHeaderSample, [
    'bookedat,amountminor,currency,accountid,counterparty,reference,transactiontype'
  ])
  const isFioSpecificHeader =
    hasAllHeaderFields(headerFields, ['datum provedení', 'datum zaúčtování', 'zaúčtovaná částka', 'měna účtu'])
    || hasAllHeaderFields(headerFields, ['datum provedeni', 'datum zauctovani', 'zauctovana castka', 'mena uctu'])
    || hasAllHeaderFields(headerFields, ['datum', 'objem', 'měna', 'číslo protiúčtu', 'název protiúčtu'])
    || hasAllHeaderFields(headerFields, ['datum', 'objem', 'mena', 'cislo protiuctu', 'nazev protiuctu'])
  const isRaiffeisenbankSpecificHeader =
    (hasAllHeaderFields(headerFields, ['datum', 'objem', 'měna', 'protiúčet', 'typ'])
      || hasAllHeaderFields(headerFields, ['datum', 'objem', 'měna', 'název protiúčtu', 'protiúčet', 'typ'])
      || hasAllHeaderFields(headerFields, ['datum', 'objem', 'mena', 'protiucet', 'typ']))
    && !hasAnyHeaderFields(headerFields, ['číslo protiúčtu', 'název protiúčtu', 'cislo protiuctu', 'nazev protiuctu'])

  if (isCanonicalBankHeader) {
    return 'raiffeisenbank'
  }

  if (isFioSpecificHeader) {
    return 'fio'
  }

  if (isRaiffeisenbankSpecificHeader) {
    return 'raiffeisenbank'
  }

  if (normalizedFileName.includes('raiff') || normalizedFileName.includes('raiffeisen')) {
    return 'raiffeisenbank'
  }

  if (normalizedFileName.includes('fio')) {
    return 'fio'
  }

  return 'unknown'
}

function buildSourceDocument(file: UploadedMonthlyFile, index: number): SourceDocument {
  const fileName = file.name.trim()
  const normalized = fileName.toLowerCase()
  const sourceSystem = inferUploadedSourceSystem({
    fileName: normalized,
    content: file.content,
    binaryContentBase64: file.binaryContentBase64
  })
  const documentType = inferDocumentType(sourceSystem)

  return {
    id: `uploaded:${sourceSystem}:${index + 1}:${slugify(fileName)}` as SourceDocument['id'],
    sourceSystem,
    documentType,
    fileName,
    uploadedAt: file.uploadedAt
  }
}

function inferUploadedSourceSystem(input: {
  fileName: string
  content: string
  binaryContentBase64?: string
}): SourceDocument['sourceSystem'] {
  const byFileName = inferSourceSystemFromFileName(input.fileName)

  if (byFileName !== 'unknown') {
    return byFileName
  }

  if (input.binaryContentBase64 && input.fileName.includes('prehled_rezervaci')) {
    return 'previo'
  }

  return inferSourceSystemFromContent(input.content)
}

function inferSourceSystemFromFileName(fileName: string): SourceDocument['sourceSystem'] {
  if (fileName.includes('raiff') || fileName.includes('raiffeisen')) {
    return 'bank'
  }

  if (fileName.includes('fio')) {
    return 'bank'
  }

  if (fileName.includes('booking')) {
    return 'booking'
  }

  if (fileName.includes('airbnb')) {
    return 'airbnb'
  }

  if (fileName.includes('expedia')) {
    return 'expedia'
  }

  if (fileName.includes('previo')) {
    return 'previo'
  }

  if (fileName.includes('prehled_rezervaci')) {
    return 'previo'
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

function inferSourceSystemFromContent(content: string): SourceDocument['sourceSystem'] {
  const normalizedContent = content.trim().toLowerCase()
  const normalizedHeaderSample = getNormalizedHeaderSample(content)
  const headerFields = getNormalizedHeaderFields(content)

  if (!normalizedHeaderSample) {
    return 'unknown'
  }

  if (
    hasAllHeaderFields(headerFields, ['datum provedení', 'datum zaúčtování', 'zaúčtovaná částka', 'měna účtu'])
    || hasAllHeaderFields(headerFields, ['datum provedeni', 'datum zauctovani', 'zauctovana castka', 'mena uctu'])
    || hasAllHeaderFields(headerFields, ['datum', 'objem', 'měna', 'číslo protiúčtu', 'název protiúčtu'])
    || hasAllHeaderFields(headerFields, ['datum', 'objem', 'mena', 'cislo protiuctu', 'nazev protiuctu'])
    || hasAllHeaderFields(headerFields, ['datum', 'objem', 'měna', 'protiúčet', 'typ'])
    || hasAllHeaderFields(headerFields, ['datum', 'objem', 'mena', 'protiucet', 'typ'])
    || matchesAnyHeaderSignature(normalizedHeaderSample, [
      'bookedat,amountminor,currency,accountid,counterparty,reference,transactiontype',
      'datum;částka;měna;účet;protistrana;poznámka;typ',
      'date;amount;currency;account;counterparty;message;type'
    ])
  ) {
    return 'bank'
  }

  if (matchesAnyHeaderSignature(normalizedHeaderSample, [
    'identifier;payoutdate;amountminor;currency;status;paymentmethod;merchant',
    'transactionid,payoutdate,amountminor,currency,paymentreference,paymenttype',
    'paidat,amountminor,currency,reference,paymentpurpose,reservationid'
  ])) {
    return 'comgate'
  }

  if (matchesAnyHeaderSignature(normalizedHeaderSample, [
    'payoutdate,amountminor,currency,payoutreference,reservationid,propertyid',
    'datumvyplaty;netamount;měna;paymentreference;bookingid;hotelid',
    'datumvyplaty;netamount;měna;bookingreference;bookingnumber;ubytovani'
  ]) && normalizedContent.includes('payout-book')) {
    return 'booking'
  }

  return 'unknown'
}

function matchesAnyHeaderSignature(headerSample: string, candidates: string[]): boolean {
  return candidates.some((candidate) => headerSample.includes(candidate))
}

function hasAllHeaderFields(headerFields: string[], requiredFields: string[]): boolean {
  return requiredFields.every((field) => headerFields.includes(field))
}

function hasAnyHeaderFields(headerFields: string[], candidateFields: string[]): boolean {
  return candidateFields.some((field) => headerFields.includes(field))
}

function getNormalizedHeaderSample(content: string): string {
  return content
    .trim()
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .slice(0, 4)
    .map((line) => normalizeHeaderLine(line))
    .join('\n')
}

function getNormalizedHeaderFields(content: string): string[] {
  const headerLine = content
    .trim()
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)[0]

  if (!headerLine) {
    return []
  }

  return headerLine
    .replace(/^\ufeff/, '')
    .split(/[;,]/)
    .map((field) => normalizeHeaderField(field))
    .filter(Boolean)
}

function normalizeHeaderLine(value: string): string {
  return value
    .replace(/^\ufeff/, '')
    .split(/[;,]/)
    .map((field) => normalizeHeaderField(field))
    .join(',')
}

function normalizeHeaderField(value: string): string {
  return value
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function inferDocumentType(sourceSystem: SourceDocument['sourceSystem']): SourceDocument['documentType'] {
  switch (sourceSystem) {
    case 'bank':
      return 'bank_statement'
    case 'booking':
    case 'airbnb':
    case 'expedia':
      return 'ota_report'
    case 'previo':
      return 'reservation_export'
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