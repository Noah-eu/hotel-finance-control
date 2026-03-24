import type { ExtractedRecord, SourceDocument } from '../domain'
import {
  parseAirbnbPayoutExport,
  parseBookingPayoutExport,
  parseBookingPayoutStatementPdf,
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
  PreparedUploadedMonthlyFilesResult,
  UploadedMonthlyIngestionResult,
  UploadedMonthlyFile
} from './contracts'
import { applyPayoutSupplements } from './payout-supplements'

type Parser = (input: {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
  binaryContentBase64?: string
}) => ExtractedRecord[]

interface ParsedImportedMonthlySourceFile {
  importedFile: ImportedMonthlySourceFile
  extractedRecords: ExtractedRecord[]
}

export class DefaultMonthlyBatchService implements MonthlyBatchService {
  run(input: MonthlyBatchInput): MonthlyBatchResult {
    const parsedFiles = input.files.map((file) => parseImportedMonthlySourceFile(file, input.reconciliationContext.requestedAt))

    return buildMonthlyBatchResultFromParsedFiles(parsedFiles, {
      reconciliationContext: input.reconciliationContext,
      reportGeneratedAt: input.reportGeneratedAt
    })
  }
}

const defaultMonthlyBatchService = new DefaultMonthlyBatchService()

export function runMonthlyReconciliationBatch(input: MonthlyBatchInput): MonthlyBatchResult {
  return defaultMonthlyBatchService.run(input)
}

export function ingestUploadedMonthlyFiles(input: {
  files: UploadedMonthlyFile[]
  reconciliationContext: MonthlyBatchInput['reconciliationContext']
  reportGeneratedAt: MonthlyBatchInput['reportGeneratedAt']
}): UploadedMonthlyIngestionResult {
  const prepared = prepareUploadedMonthlyBatchFiles(input.files)
  const fileRoutes = prepared.fileRoutes.map((file) => ({
    ...file,
    extractedCount: file.extractedCount ?? 0,
    extractedRecordIds: file.extractedRecordIds ?? []
  }))
  const parsedFiles: ParsedImportedMonthlySourceFile[] = []

  for (const importedFile of prepared.importedFiles) {
    const routeIndex = fileRoutes.findIndex((file) => file.sourceDocumentId === importedFile.sourceDocument.id)

    try {
      const parsed = parseImportedMonthlySourceFile(importedFile, input.reconciliationContext.requestedAt)
      parsedFiles.push(parsed)

      if (routeIndex !== -1) {
        fileRoutes[routeIndex] = {
          ...fileRoutes[routeIndex]!,
          status: 'supported',
          intakeStatus: 'parsed',
          extractedCount: parsed.extractedRecords.length,
          extractedRecordIds: parsed.extractedRecords.map((record) => record.id),
          reason: undefined,
          errorMessage: undefined
        }
      }
    } catch (error) {
      if (routeIndex !== -1) {
        const message = error instanceof Error ? error.message : String(error)
        fileRoutes[routeIndex] = {
          ...fileRoutes[routeIndex]!,
          status: 'error',
          intakeStatus: 'error',
          extractedCount: 0,
          extractedRecordIds: [],
          reason: message,
          errorMessage: message
        }
      }
    }
  }

  const parsedImportedFiles = parsedFiles.map((file) => file.importedFile)
  const batch = buildMonthlyBatchResultFromParsedFiles(parsedFiles, {
    reconciliationContext: input.reconciliationContext,
    reportGeneratedAt: input.reportGeneratedAt
  })

  return {
    importedFiles: parsedImportedFiles,
    fileRoutes,
    batch
  }
}

export function prepareUploadedMonthlyFiles(files: UploadedMonthlyFile[]): ImportedMonthlySourceFile[] {
  return prepareUploadedMonthlyBatchFiles(files).importedFiles.map((file) => ({
    sourceDocument: file.sourceDocument,
    content: file.content,
    binaryContentBase64: file.binaryContentBase64
  }))
}

export function prepareUploadedMonthlyBatchFiles(
  files: UploadedMonthlyFile[]
): PreparedUploadedMonthlyFilesResult {
  const classifiedFiles = files.map((file, index) => classifyUploadedMonthlyFile(file, index))
  const duplicateWarningsByIndex = collectDuplicateWarnings(classifiedFiles, files)

  const fileRoutes = classifiedFiles.map((classifiedFile, index) => ({
    ...classifiedFile.fileRoute,
    warnings: [...classifiedFile.fileRoute.warnings, ...duplicateWarningsByIndex[index]]
  }))

  const importedFiles = classifiedFiles.flatMap((classifiedFile, index) => {
    if (!classifiedFile.sourceDocument || !classifiedFile.parserId) {
      return []
    }

    return [{
      sourceDocument: classifiedFile.sourceDocument,
      content: files[index].content,
      binaryContentBase64: files[index].binaryContentBase64,
      routing: {
        classificationBasis: classifiedFile.fileRoute.classificationBasis,
        parserId: classifiedFile.parserId,
        warnings: [...classifiedFile.fileRoute.warnings, ...duplicateWarningsByIndex[index]],
        role: classifiedFile.fileRoute.role
      }
    }]
  })

  return {
    importedFiles,
    fileRoutes
  }
}

function parseImportedMonthlySourceFile(
  file: ImportedMonthlySourceFile,
  extractedAt: string
): ParsedImportedMonthlySourceFile {
  const parser = selectParser(file.sourceDocument, file.content)
  const extractedRecords = parser({
    sourceDocument: file.sourceDocument,
    content: file.content,
    extractedAt,
    binaryContentBase64: file.binaryContentBase64
  })

  return {
    importedFile: file,
    extractedRecords
  }
}

function buildMonthlyBatchResultFromParsedFiles(
  parsedFiles: ParsedImportedMonthlySourceFile[],
  input: {
    reconciliationContext: MonthlyBatchInput['reconciliationContext']
    reportGeneratedAt: MonthlyBatchInput['reportGeneratedAt']
  }
): MonthlyBatchResult {
  const extractedRecords = applyPayoutSupplements(
    parsedFiles.flatMap((file) => file.extractedRecords)
  )
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
    files: parsedFiles.map((file) => ({
      sourceDocumentId: file.importedFile.sourceDocument.id,
      extractedRecordIds: extractedRecords
        .filter((record) => record.sourceDocumentId === file.importedFile.sourceDocument.id)
        .map((record) => record.id),
      extractedCount: extractedRecords.filter(
        (record) => record.sourceDocumentId === file.importedFile.sourceDocument.id
      ).length
    }))
  }
}

function selectParser(sourceDocument: SourceDocument, content: string): Parser {
  if (sourceDocument.sourceSystem === 'booking' && sourceDocument.documentType === 'payout_statement') {
    return parseBookingPayoutStatementPdf
  }

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
    && !hasAnyHeaderFields(headerFields, ['číslo protiúčtu', 'cislo protiuctu'])

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

function buildSourceDocument(
  file: UploadedMonthlyFile,
  index: number,
  classification: {
    sourceSystem: SourceDocument['sourceSystem']
    documentType: SourceDocument['documentType']
  }
): SourceDocument {
  const fileName = file.name.trim()

  return {
    id: `uploaded:${classification.sourceSystem}:${index + 1}:${slugify(fileName)}` as SourceDocument['id'],
    sourceSystem: classification.sourceSystem,
    documentType: classification.documentType,
    fileName,
    uploadedAt: file.uploadedAt
  }
}

function classifyUploadedMonthlyFile(
  file: UploadedMonthlyFile,
  index: number
): {
  fileRoute: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]
  sourceDocument?: SourceDocument
  parserId?: string
} {
  const classification = inferUploadedFileClassification({
    fileName: file.name,
    content: file.content,
    binaryContentBase64: file.binaryContentBase64,
    contentFormat: file.contentFormat,
    ingestError: file.ingestError
  })

  if (classification.ingestError) {
    return {
      fileRoute: {
        fileName: file.name.trim(),
        uploadedAt: file.uploadedAt,
        status: 'error',
        intakeStatus: 'error',
        sourceSystem: classification.sourceSystem,
        documentType: classification.documentType,
        classificationBasis: classification.classificationBasis,
        role: classification.role,
        extractedCount: 0,
        extractedRecordIds: [],
        warnings: [],
        reason: classification.ingestError,
        errorMessage: classification.ingestError
      }
    }
  }

  if (classification.sourceSystem === 'unknown') {
    return {
      fileRoute: {
        fileName: file.name.trim(),
        uploadedAt: file.uploadedAt,
        status: 'unsupported',
        intakeStatus: 'unclassified',
        sourceSystem: 'unknown',
        documentType: 'other',
        classificationBasis: classification.classificationBasis,
        role: 'primary',
        extractedCount: 0,
        extractedRecordIds: [],
        warnings: [],
        reason: 'Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.'
      }
    }
  }

  const sourceDocument = buildSourceDocument(file, index, classification)
  const parserId = resolveParserId(sourceDocument, file.content)

  if (!parserId) {
    return {
      fileRoute: {
        fileName: sourceDocument.fileName,
        uploadedAt: sourceDocument.uploadedAt,
        status: 'unsupported',
        intakeStatus: 'unsupported',
        sourceSystem: sourceDocument.sourceSystem,
        documentType: sourceDocument.documentType,
        classificationBasis: classification.classificationBasis,
        parserId: undefined,
        sourceDocumentId: sourceDocument.id,
        role: classification.role,
        extractedCount: 0,
        extractedRecordIds: [],
        warnings: [],
        reason: 'Pro tento rozpoznaný typ dokumentu zatím není nakonfigurovaný parser.'
      }
    }
  }

  return {
    sourceDocument,
    parserId,
    fileRoute: {
      fileName: sourceDocument.fileName,
      uploadedAt: sourceDocument.uploadedAt,
      status: 'supported',
      intakeStatus: 'parsed',
      sourceSystem: sourceDocument.sourceSystem,
      documentType: sourceDocument.documentType,
      classificationBasis: classification.classificationBasis,
      parserId,
      sourceDocumentId: sourceDocument.id,
      role: classification.role,
      extractedCount: 0,
      extractedRecordIds: [],
      warnings: []
    }
  }
}

function inferUploadedFileClassification(input: {
  fileName: string
  content: string
  binaryContentBase64?: string
  contentFormat?: UploadedMonthlyFile['contentFormat']
  ingestError?: string
}): {
  sourceSystem: SourceDocument['sourceSystem']
  documentType: SourceDocument['documentType']
  classificationBasis: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['classificationBasis']
  role: 'primary' | 'supplemental'
  ingestError?: string
} {
  if (input.ingestError) {
    const sourceSystem = inferSourceSystemFromFileName(input.fileName)
    const role = inferSupplementRole(input.fileName, input.contentFormat)

    return {
      sourceSystem,
      documentType: role === 'supplemental' && sourceSystem === 'booking'
        ? 'payout_statement'
        : inferDocumentType(sourceSystem),
      classificationBasis: 'file-name',
      role,
      ingestError: input.ingestError
    }
  }

  const bookingPdfByContent = inferBookingSupplementDocumentTypeFromContent({
    fileName: input.fileName,
    content: input.content,
    contentFormat: input.contentFormat
  })

  if (bookingPdfByContent) {
    return {
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      classificationBasis: 'content',
      role: 'supplemental'
    }
  }

  const byContent = inferSourceSystemFromContent(input.content)

  if (byContent !== 'unknown') {
    return {
      sourceSystem: byContent,
      documentType: inferDocumentType(byContent),
      classificationBasis: 'content',
      role: 'primary'
    }
  }

  if (input.binaryContentBase64 && input.fileName.toLowerCase().includes('prehled_rezervaci')) {
    return {
      sourceSystem: 'previo',
      documentType: 'reservation_export',
      classificationBasis: 'binary-workbook',
      role: 'primary'
    }
  }

  if (looksLikeBookingPayoutStatementPdf(input.fileName, input.contentFormat)) {
    return {
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      classificationBasis: 'file-name',
      role: 'supplemental'
    }
  }

  const byFileName = inferSourceSystemFromFileName(input.fileName)

  if (byFileName !== 'unknown') {
    return {
      sourceSystem: byFileName,
      documentType: inferDocumentType(byFileName),
      classificationBasis: 'file-name',
      role: 'primary'
    }
  }

  return {
    sourceSystem: 'unknown',
    documentType: 'other',
    classificationBasis: 'unknown',
    role: 'primary'
  }
}

function inferSourceSystemFromFileName(fileName: string): SourceDocument['sourceSystem'] {
  const normalizedFileName = fileName.toLowerCase()

  if (normalizedFileName.includes('raiff') || normalizedFileName.includes('raiffeisen')) {
    return 'bank'
  }

  if (normalizedFileName.includes('fio')) {
    return 'bank'
  }

  if (normalizedFileName.includes('booking')) {
    return 'booking'
  }

  if (normalizedFileName.includes('airbnb')) {
    return 'airbnb'
  }

  if (normalizedFileName.includes('expedia')) {
    return 'expedia'
  }

  if (normalizedFileName.includes('previo')) {
    return 'previo'
  }

  if (normalizedFileName.includes('prehled_rezervaci')) {
    return 'previo'
  }

  if (
    normalizedFileName.includes('comgate')
    || (normalizedFileName.includes('klientský portál export transakcí') && normalizedFileName.includes('jokeland'))
    || (normalizedFileName.includes('klientsky portal export transakci') && normalizedFileName.includes('jokeland'))
  ) {
    return 'comgate'
  }

  if (normalizedFileName.includes('invoice') || normalizedFileName.includes('faktura')) {
    return 'invoice'
  }

  if (
    normalizedFileName.includes('receipt')
    || normalizedFileName.includes('uctenka')
    || normalizedFileName.includes('účtenka')
  ) {
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
    || hasAllHeaderFields(headerFields, ['datum', 'objem', 'měna', 'název protiúčtu', 'protiúčet', 'typ'])
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

  if (hasAllHeaderFields(headerFields, ['datum převodu', 'částka převodu', 'měna', 'transfer id', 'confirmation code', 'listing name'])
    || hasAllHeaderFields(headerFields, ['datum prevodu', 'castka prevodu', 'mena', 'transfer id', 'confirmation code', 'listing name'])
    || hasAllHeaderFields(headerFields, ['payout amount', 'currency', 'payout id', 'confirmation code', 'listing name'])
    || hasAllHeaderFields(headerFields, ['datum', 'bude připsán do dne', 'typ', 'podrobnosti', 'potvrzující kód', 'vyplaceno'])
    || hasAllHeaderFields(headerFields, ['datum', 'bude pripsan do dne', 'typ', 'podrobnosti', 'potvrzujici kod', 'vyplaceno'])) {
    return 'airbnb'
  }

  if (hasAllHeaderFields(headerFields, ['type', 'reference number', 'currency', 'amount', 'payout date', 'payout id'])
    || hasAllHeaderFields(headerFields, ['type', 'reference number', 'check-in', 'checkout', 'amount', 'payout id'])) {
    return 'booking'
  }

  if (hasAllHeaderFields(headerFields, ['datum zaplacení', 'uhrazená částka', 'měna', 'variabilní symbol', 'štítek', 'číslo objednávky'])
    || hasAllHeaderFields(headerFields, ['datum zaplaceni', 'uhrazena castka', 'mena', 'variabilni symbol', 'stitek', 'cislo objednavky'])) {
    return 'comgate'
  }

  if (matchesAnyHeaderSignature(normalizedHeaderSample, [
    'payoutdate,amountminor,currency,payoutreference,reservationid,propertyid',
    'datumvyplaty;netamount;měna;paymentreference;bookingid;hotelid',
    'datumvyplaty;netamount;měna;bookingreference;bookingnumber;ubytovani'
  ]) && normalizedContent.includes('payout-book')) {
    return 'booking'
  }

  if (matchesAnyHeaderSignature(normalizedHeaderSample, [
    'payoutdate,amountminor,currency,payoutreference,reservationid,listingid',
    'datum převodu;částka převodu;měna;transfer id;confirmation code;listing name',
    'datum prevodu;castka prevodu;mena;transfer id;confirmation code;listing name'
  ])) {
    return 'airbnb'
  }

  if (matchesAnyHeaderSignature(normalizedHeaderSample, [
    'type;reference number;checkin;checkout;guest name;reservation status;currency;payment status;amount;payout date;payout id'
  ])) {
    return 'booking'
  }

  return 'unknown'
}

function inferBookingSupplementDocumentTypeFromContent(input: {
  fileName: string
  content: string
  contentFormat?: UploadedMonthlyFile['contentFormat']
}): 'payout_statement' | undefined {
  const isPdfLike = input.contentFormat === 'pdf-text'
    || (!input.contentFormat && input.fileName.toLowerCase().endsWith('.pdf'))

  if (!isPdfLike) {
    return undefined
  }

  const normalized = input.content
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

  if (!normalized) {
    return undefined
  }

  const bookingBranding = /\bbooking(?:\.com| com| bv)?\b/i.test(normalized)
  const payoutStatementWording = [
    'payout statement',
    'payment statement',
    'payment overview',
    'payout overview',
    'payment summary',
    'payout summary'
  ].some((value) => normalized.includes(value))
  const hasPaymentId = hasAnyDocumentLabel(input.content, ['payment id', 'paymentid', 'booking payment id', 'payout id'])
  const hasPayoutDate = hasAnyDocumentLabel(input.content, ['payment date', 'payout date', 'transfer date', 'date'])
  const hasPayoutTotal = hasAnyDocumentLabel(input.content, ['payout total', 'payment total', 'total payout', 'transfer total', 'total transfer'])
  const hasReservationHint =
    /\bres-[a-z0-9-]+\b/i.test(input.content)
    || normalized.includes('included reservations')
    || normalized.includes('reservation reference')
    || normalized.includes('reservation id')
  const hasIbanHint = normalized.includes('iban') || normalized.includes('bank account')
  const strongCueCount = [hasPaymentId, hasPayoutDate, hasPayoutTotal, hasReservationHint, hasIbanHint, payoutStatementWording]
    .filter(Boolean)
    .length

  if (
    bookingBranding
    && hasPaymentId
    && hasPayoutDate
    && hasPayoutTotal
  ) {
    return 'payout_statement'
  }

  if (
    bookingBranding
    && hasPayoutDate
    && hasPayoutTotal
    && (hasReservationHint || hasIbanHint)
    && strongCueCount >= 4
  ) {
    return 'payout_statement'
  }

  return undefined
}

function hasAnyDocumentLabel(content: string, candidates: string[]): boolean {
  const normalizedLines = content
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((candidate) =>
    normalizedLines.some((line) => line.startsWith(`${candidate}:`) || line.startsWith(`${candidate} -`))
  )
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

function resolveParserId(sourceDocument: SourceDocument, content: string): string | undefined {
  if (sourceDocument.sourceSystem === 'booking' && sourceDocument.documentType === 'payout_statement') {
    return 'booking-payout-statement-pdf'
  }

  if (sourceDocument.sourceSystem === 'bank') {
    const variant = inferBankParserVariant(sourceDocument.fileName, content)
    return variant === 'unknown' ? undefined : variant
  }

  return sourceDocument.sourceSystem
}

function looksLikeBookingPayoutStatementPdf(
  fileName: string,
  contentFormat?: UploadedMonthlyFile['contentFormat']
): boolean {
  const normalizedFileName = fileName.toLowerCase()

  return normalizedFileName.endsWith('.pdf')
    && normalizedFileName.includes('booking')
    && contentFormat === 'pdf-text'
}

function inferSupplementRole(
  fileName: string,
  contentFormat?: UploadedMonthlyFile['contentFormat']
): 'primary' | 'supplemental' {
  return looksLikeBookingPayoutStatementPdf(fileName, contentFormat) ? 'supplemental' : 'primary'
}

function collectDuplicateWarnings(
  classifiedFiles: Array<ReturnType<typeof classifyUploadedMonthlyFile>>,
  files: UploadedMonthlyFile[]
): string[][] {
  return files.map((file, index) => {
    const duplicateIndex = files.findIndex((candidate, candidateIndex) =>
      candidateIndex < index
      && candidate.content === file.content
      && candidate.binaryContentBase64 === file.binaryContentBase64
      && classifiedFiles[candidateIndex]?.fileRoute.status === classifiedFiles[index]?.fileRoute.status
      && classifiedFiles[candidateIndex]?.fileRoute.sourceSystem === classifiedFiles[index]?.fileRoute.sourceSystem
      && classifiedFiles[candidateIndex]?.fileRoute.documentType === classifiedFiles[index]?.fileRoute.documentType
    )

    if (duplicateIndex === -1) {
      return []
    }

    return [`Možný duplicitní upload stejného obsahu jako ${files[duplicateIndex]!.name.trim()}.`]
  })
}

function slugify(fileName: string): string {
  return fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
}
