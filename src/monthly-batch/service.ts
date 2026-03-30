import type { ExtractedRecord, SourceDocument } from '../domain'
import {
  inspectAirbnbPayoutHeaderDiagnostics,
  detectInvoiceDocumentKeywordHits,
  detectBookingPayoutStatementSignals,
  inspectBookingPayoutStatementExtractionSummary,
  inspectBookingPayoutStatementFieldCheck,
  inspectInvoiceDocumentExtractionSummary,
  inspectReceiptDocumentExtractionSummary,
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
  UploadedMonthlyFileCapabilityAssessment,
  UploadedMonthlyFileDecision,
  UploadedMonthlyIngestionResult,
  UploadedMonthlyFile
} from './contracts'
import {
  detectUploadedMonthlyFileCapability,
  resolveUploadedMonthlyFileIngestionBranch
} from './capabilities'
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

interface UploadedMonthlyFileClassificationDescriptor {
  fileName: string
  content: string
  binaryContentBase64?: string
  contentFormat?: UploadedMonthlyFile['contentFormat']
  sourceDescriptor?: UploadedMonthlyFile['sourceDescriptor']
  ingestError?: string
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
    const parseDiagnostics = inspectUploadedFileParseDiagnostics(importedFile)

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
          parseDiagnostics,
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
          parseDiagnostics,
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

function inspectUploadedFileParseDiagnostics(
  file: ImportedMonthlySourceFile
): PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['parseDiagnostics'] | undefined {
  if (file.sourceDocument.sourceSystem === 'booking' && file.sourceDocument.documentType === 'payout_statement') {
    const fieldCheck = inspectBookingPayoutStatementFieldCheck(file.content)

    return {
      documentExtractionSummary: inspectBookingPayoutStatementExtractionSummary(file.content),
      parserExtractedPaymentId: fieldCheck.parserExtracted.paymentId,
      parserExtractedPayoutDate: fieldCheck.parserExtracted.payoutDate,
      parserExtractedPayoutTotal: fieldCheck.parserExtracted.payoutTotal,
      parserExtractedLocalTotal: fieldCheck.parserExtracted.localTotal,
      parserExtractedIbanHint: fieldCheck.parserExtracted.ibanHint,
      parserExtractedExchangeRate: fieldCheck.parserExtracted.exchangeRate,
      validatorInputPaymentId: fieldCheck.validatorInput.paymentId,
      validatorInputPayoutDate: fieldCheck.validatorInput.payoutDate,
      validatorInputPayoutTotal: fieldCheck.validatorInput.payoutTotal,
      parsedPaymentId: fieldCheck.fields.paymentId,
      parsedPayoutDate: fieldCheck.fields.payoutDate,
      parsedPayoutTotal: buildParseDiagnosticMoneyLabel(
        fieldCheck.fields.payoutTotalAmountMinor,
        fieldCheck.fields.payoutTotalCurrency
      ),
      parsedLocalTotal: buildParseDiagnosticMoneyLabel(
        fieldCheck.fields.localAmountMinor,
        fieldCheck.fields.localCurrency
      ),
      parsedIbanHint: fieldCheck.fields.ibanSuffix,
      parsedExchangeRate: fieldCheck.fields.exchangeRate,
      requiredFieldsCheck: fieldCheck.requiredFieldsCheck,
      missingFields: fieldCheck.missingFields
    }
  }

  if (file.sourceDocument.sourceSystem === 'invoice') {
    const summary = inspectInvoiceDocumentExtractionSummary({
      content: file.content,
      binaryContentBase64: file.binaryContentBase64
    })

    return {
      documentExtractionSummary: summary,
      requiredFieldsCheck: summary.requiredFieldsCheck,
      missingFields: [...summary.missingRequiredFields]
    }
  }

  if (file.sourceDocument.sourceSystem === 'airbnb') {
    return {
      airbnbHeaderDiagnostics: inspectAirbnbPayoutHeaderDiagnostics(file.content)
    }
  }

  if (file.sourceDocument.sourceSystem === 'receipt') {
    const summary = inspectReceiptDocumentExtractionSummary({
      content: file.content,
      binaryContentBase64: file.binaryContentBase64
    })

    return {
      documentExtractionSummary: summary,
      requiredFieldsCheck: summary.requiredFieldsCheck,
      missingFields: [...summary.missingRequiredFields]
    }
  }

  return undefined
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
    sourceDescriptor: file.sourceDescriptor,
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
        errorMessage: classification.ingestError,
        decision: classification.decision
      }
    }
  }

  if (classification.decision.resolvedBucket === 'unsupported' && classification.decision.ingestionBranch === 'ocr-required') {
    return {
      fileRoute: {
        fileName: file.name.trim(),
        uploadedAt: file.uploadedAt,
        status: 'unsupported',
        intakeStatus: 'unsupported',
        sourceSystem: classification.sourceSystem,
        documentType: classification.documentType,
        classificationBasis: classification.classificationBasis,
        role: classification.role,
        extractedCount: 0,
        extractedRecordIds: [],
        warnings: [],
        reason: classification.decision.ingestionReason,
        decision: classification.decision
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
        reason: classification.decision.ingestionReason || 'Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.',
        decision: classification.decision
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
        reason: 'Pro tento rozpoznaný typ dokumentu zatím není nakonfigurovaný parser.',
        decision: classification.decision
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
      warnings: [],
      decision: classification.decision
    }
  }
}

function inferUploadedFileClassification(input: UploadedMonthlyFileClassificationDescriptor): {
  sourceSystem: SourceDocument['sourceSystem']
  documentType: SourceDocument['documentType']
  classificationBasis: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['classificationBasis']
  role: 'primary' | 'supplemental'
  decision: UploadedMonthlyFileDecision
  ingestError?: string
} {
  const capability = detectUploadedMonthlyFileCapability(input)
  const ingestionBranch = resolveUploadedMonthlyFileIngestionBranch(capability)
  const invoiceSummary = inspectInvoiceDocumentExtractionSummary({
    content: input.content,
    binaryContentBase64: input.binaryContentBase64
  })
  const bookingPdfDecision = buildBookingPayoutSupplementDecision(input)
  const fileNameSourceSystem = inferSourceSystemFromFileName(input.fileName)
  const fileNameRole = inferSupplementRole(input.fileName, input.contentFormat)
  const fileNameDocumentType = fileNameRole === 'supplemental' && fileNameSourceSystem === 'booking'
    ? 'payout_statement'
    : inferDocumentType(fileNameSourceSystem)

  if (ingestionBranch === 'ocr-required') {
    const hintedSourceSystem = capability.documentHints.includes('invoice_like')
      ? 'invoice'
      : capability.documentHints.includes('receipt_like')
        ? 'receipt'
        : undefined
    const sourceSystem = fileNameSourceSystem
    const ocrSupportedSourceSystem = sourceSystem === 'unknown'
      ? hintedSourceSystem
      : (sourceSystem === 'invoice' || sourceSystem === 'receipt' ? sourceSystem : undefined)

    if (ocrSupportedSourceSystem) {
      return {
        sourceSystem: ocrSupportedSourceSystem,
        documentType: inferDocumentType(ocrSupportedSourceSystem),
        classificationBasis: sourceSystem === 'unknown' ? 'file-name' : 'file-name',
        role: 'primary',
        decision: buildResolvedDecision({
          capability,
          ingestionBranch,
          sourceSystem: ocrSupportedSourceSystem,
          documentType: inferDocumentType(ocrSupportedSourceSystem),
          classificationBasis: 'file-name',
          role: 'primary',
          parserSupported: true,
          matchedRules: ['capability-ocr-required', 'ocr-fallback-parser-supported'],
          missingSignals: [],
          detectedSignals: []
        })
      }
    }

    const role = fileNameRole
    const documentType = role === 'supplemental' && sourceSystem === 'booking'
      ? 'payout_statement'
      : inferDocumentType(sourceSystem)

    return {
      sourceSystem,
      documentType,
      classificationBasis: sourceSystem === 'unknown' ? 'unknown' : 'file-name',
      role,
      decision: buildUnsupportedDecision({
        capability,
        ingestionBranch,
        sourceSystem,
        documentType,
        role,
        matchedRules: [
          ...new Set([
            ...(bookingPdfDecision?.matchedRules ?? []),
            'capability-ocr-required'
          ])
        ],
        missingSignals: bookingPdfDecision?.missingSignals ?? [],
        detectedSignals: bookingPdfDecision?.detectedSignals ?? [],
        parserSupported: false,
        reason: buildOcrRequiredReason(capability, sourceSystem, documentType)
      })
    }
  }

  if (input.ingestError) {
    return {
      sourceSystem: fileNameSourceSystem,
      documentType: fileNameDocumentType,
      classificationBasis: fileNameSourceSystem === 'unknown' ? 'unknown' : 'file-name',
      role: fileNameRole,
      decision: {
        capability,
        ingestionBranch,
        ingestionReason: input.ingestError,
        detectedSignals: bookingPdfDecision?.detectedSignals ?? [],
        matchedRules: ['ingest-error'],
        missingSignals: bookingPdfDecision?.missingSignals ?? [],
        parserSupported: false,
        confidence: 'none',
        resolvedSourceSystem: fileNameSourceSystem,
        resolvedDocumentType: fileNameDocumentType,
        resolvedRole: fileNameRole,
        resolvedBucket: 'ingest-error'
      },
      ingestError: input.ingestError
    }
  }

  if (invoiceSummary.confidence === 'strong') {
    return {
      sourceSystem: 'invoice',
      documentType: 'invoice',
      classificationBasis: 'content',
      role: 'primary',
      decision: buildResolvedDecision({
        capability,
        ingestionBranch,
        sourceSystem: 'invoice',
        documentType: 'invoice',
        classificationBasis: 'content',
        role: 'primary',
        parserSupported: true,
        matchedRules: ['content-signature', 'invoice-summary-strong'],
        missingSignals: [],
        detectedSignals: bookingPdfDecision?.detectedSignals ?? []
      })
    }
  }

  if (bookingPdfDecision?.resolvedSourceSystem === 'booking') {
    return {
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      classificationBasis: 'content',
      role: 'supplemental',
      decision: bookingPdfDecision
    }
  }

  if (
    ingestionBranch === 'structured-parser'
    || ingestionBranch === 'text-document-parser'
    || ingestionBranch === 'text-pdf-parser'
  ) {
    const byContent = inferSourceSystemFromContent(input.content)

    if (byContent !== 'unknown') {
      return {
        sourceSystem: byContent,
        documentType: inferDocumentType(byContent),
        classificationBasis: 'content',
        role: 'primary',
        decision: buildResolvedDecision({
          capability,
          ingestionBranch,
          sourceSystem: byContent,
          documentType: inferDocumentType(byContent),
          classificationBasis: 'content',
          role: 'primary',
          parserSupported: true,
          matchedRules: ['content-signature'],
          missingSignals: [],
          detectedSignals: bookingPdfDecision?.detectedSignals ?? []
        })
      }
    }
  }

  if (input.binaryContentBase64 && input.fileName.toLowerCase().includes('prehled_rezervaci')) {
    return {
      sourceSystem: 'previo',
      documentType: 'reservation_export',
      classificationBasis: 'binary-workbook',
      role: 'primary',
      decision: buildResolvedDecision({
        capability,
        ingestionBranch,
        sourceSystem: 'previo',
        documentType: 'reservation_export',
        classificationBasis: 'binary-workbook',
        role: 'primary',
        parserSupported: true,
        matchedRules: ['binary-workbook-signature'],
        missingSignals: [],
        detectedSignals: bookingPdfDecision?.detectedSignals ?? []
      })
    }
  }

  if (looksLikeBookingPayoutStatementPdf(input.fileName, input.contentFormat)) {
    return {
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      classificationBasis: 'file-name',
      role: 'supplemental',
      decision: buildResolvedDecision({
        capability,
        ingestionBranch,
        sourceSystem: 'booking',
        documentType: 'payout_statement',
        classificationBasis: 'file-name',
        role: 'supplemental',
        parserSupported: true,
        matchedRules: ['file-name-pdf-fallback'],
        missingSignals: bookingPdfDecision?.missingSignals ?? [],
        detectedSignals: bookingPdfDecision?.detectedSignals ?? []
      })
    }
  }

  const byFileName = inferSourceSystemFromFileName(input.fileName)

  if (byFileName !== 'unknown') {
    return {
      sourceSystem: byFileName,
      documentType: inferDocumentType(byFileName),
      classificationBasis: 'file-name',
      role: 'primary',
      decision: buildResolvedDecision({
        capability,
        ingestionBranch,
        sourceSystem: byFileName,
        documentType: inferDocumentType(byFileName),
        classificationBasis: 'file-name',
        role: 'primary',
        parserSupported: true,
        matchedRules: ['file-name-signature'],
        missingSignals: bookingPdfDecision?.missingSignals ?? [],
        detectedSignals: bookingPdfDecision?.detectedSignals ?? []
      })
    }
  }

  return {
    sourceSystem: 'unknown',
    documentType: 'other',
    classificationBasis: 'unknown',
    role: 'primary',
    decision: bookingPdfDecision ?? buildUnknownDecision({
      capability,
      ingestionBranch,
      detectedSignals: [],
      matchedRules: [],
      missingSignals: [],
      parserSupported: false
    })
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
  const invoiceSummary = inspectInvoiceDocumentExtractionSummary(content)
  const receiptSummary = inspectReceiptDocumentExtractionSummary(content)

  if (invoiceSummary.confidence === 'strong' || looksLikeInvoiceDocumentText(content)) {
    return 'invoice'
  }

  if (receiptSummary.confidence === 'strong' || looksLikeReceiptDocumentText(content)) {
    return 'receipt'
  }

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

function buildBookingPayoutSupplementDecision(
  input: UploadedMonthlyFileClassificationDescriptor
): UploadedMonthlyFileDecision | undefined {
  const capability = detectUploadedMonthlyFileCapability(input)
  const ingestionBranch = resolveUploadedMonthlyFileIngestionBranch(capability)
  const isPdfLike = input.contentFormat === 'pdf-text'
    || input.sourceDescriptor?.browserTextExtraction?.mode === 'pdf-text'
    || input.sourceDescriptor?.mimeType === 'application/pdf'
    || (!input.contentFormat && input.fileName.toLowerCase().endsWith('.pdf'))

  if (!isPdfLike) {
    return undefined
  }

  const signals = detectBookingPayoutStatementSignals(input.content)
  const detectedSignals = collectBookingPayoutDecisionSignals(signals, input)
  const detectedSignalSet = new Set(detectedSignals)
  const hasBookingBranding = detectedSignalSet.has('booking-branding')
  const hasStatementWording = detectedSignalSet.has('booking-payout-statement-wording')
  const hasPaymentId = detectedSignalSet.has('booking-payment-id')
  const hasPayoutDate = detectedSignalSet.has('booking-payout-date')
  const hasPayoutTotal = detectedSignalSet.has('booking-payout-total')
  const hasIban = detectedSignalSet.has('iban-hint')
  const hasReservationReference = detectedSignalSet.has('booking-reservation-reference')
  const signalCount = detectedSignals.length
  const parserSupported = true
  const matchedRules = ['pdf-like-upload']
  const missingSignals = [
    hasBookingBranding ? undefined : 'booking-branding',
    hasStatementWording ? undefined : 'booking-payout-statement-wording',
    hasPaymentId ? undefined : 'booking-payment-id',
    hasPayoutDate ? undefined : 'booking-payout-date',
    hasPayoutTotal ? undefined : 'booking-payout-total'
  ].filter((value): value is string => Boolean(value))

  if (!input.content.trim() && signalCount === 0) {
    return buildUnknownDecision({
      capability,
      ingestionBranch,
      detectedSignals,
      matchedRules,
      missingSignals,
      parserSupported
    })
  }

  if (hasBookingBranding && hasPaymentId && hasPayoutDate && hasPayoutTotal) {
    return buildResolvedDecision({
      capability,
      ingestionBranch,
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      classificationBasis: 'content',
      role: 'supplemental',
      parserSupported,
      matchedRules: [...matchedRules, 'booking-payout-core-fields'],
      missingSignals,
      detectedSignals
    })
  }

  if (hasBookingBranding && hasStatementWording && signalCount >= 4) {
    return buildResolvedDecision({
      capability,
      ingestionBranch,
      sourceSystem: 'booking',
      documentType: 'payout_statement',
      classificationBasis: 'content',
      role: 'supplemental',
      parserSupported,
      matchedRules: [...matchedRules, 'booking-payout-threshold-reached'],
      missingSignals,
      detectedSignals
    })
  }

  if (hasBookingBranding && hasStatementWording && parserSupported) {
    return {
      capability,
      ingestionBranch,
      ingestionReason: buildIngestionReason(ingestionBranch, capability, 'Booking payout PDF má branding a wording, ale čeká na plné parser pole.'),
      detectedSignals,
      matchedRules: [...matchedRules, 'booking-payout-branding-and-wording', 'booking-payout-parser-supported'],
      missingSignals,
      parserSupported,
      confidence: 'hint',
      resolvedSourceSystem: 'booking',
      resolvedDocumentType: 'payout_statement',
      resolvedRole: 'supplemental',
      resolvedBucket: 'supplemental-supported'
    }
  }

  return buildUnknownDecision({
    capability,
    ingestionBranch,
    detectedSignals,
    matchedRules: [
      ...matchedRules,
      ...(hasIban ? ['iban-hint'] : []),
      ...(hasReservationReference ? ['booking-reservation-reference'] : [])
    ],
    missingSignals,
    parserSupported
  })
}

function collectBookingPayoutDecisionSignals(
  signals: ReturnType<typeof detectBookingPayoutStatementSignals>,
  input: UploadedMonthlyFileClassificationDescriptor
): string[] {
  const detectedSignals = new Set(input.sourceDescriptor?.browserTextExtraction?.detectedSignatures ?? [])

  if (signals.hasBookingBranding) {
    detectedSignals.add('booking-branding')
  }

  if (signals.hasStatementWording) {
    detectedSignals.add('booking-payout-statement-wording')
  }

  if (signals.paymentId) {
    detectedSignals.add('booking-payment-id')
  }

  if (signals.payoutDateRaw) {
    detectedSignals.add('booking-payout-date')
  }

  if (signals.payoutTotalRaw) {
    detectedSignals.add('booking-payout-total')
  }

  if (signals.ibanValue) {
    detectedSignals.add('iban-hint')
  }

  if (signals.reservationIds.length > 0) {
    detectedSignals.add('booking-reservation-reference')
  }

  return Array.from(detectedSignals)
}

function buildResolvedDecision(input: {
  capability: UploadedMonthlyFileCapabilityAssessment
  ingestionBranch: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['decision']['ingestionBranch']
  sourceSystem: SourceDocument['sourceSystem']
  documentType: SourceDocument['documentType']
  classificationBasis: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['classificationBasis']
  role: 'primary' | 'supplemental'
  parserSupported: boolean
  matchedRules: string[]
  missingSignals: string[]
  detectedSignals: string[]
}): UploadedMonthlyFileDecision {
  return {
    capability: input.capability,
    ingestionBranch: input.ingestionBranch,
    ingestionReason: buildIngestionReason(input.ingestionBranch, input.capability),
    detectedSignals: input.detectedSignals,
    matchedRules: input.matchedRules,
    missingSignals: input.missingSignals,
    parserSupported: input.parserSupported,
    confidence: input.classificationBasis === 'content' ? 'strong' : 'hint',
    resolvedSourceSystem: input.sourceSystem,
    resolvedDocumentType: input.documentType,
    resolvedRole: input.role,
    resolvedBucket: input.role === 'supplemental'
      ? 'supplemental-supported'
      : 'recognized-supported'
  }
}

function buildUnknownDecision(input: {
  capability: UploadedMonthlyFileCapabilityAssessment
  ingestionBranch: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['decision']['ingestionBranch']
  detectedSignals: string[]
  matchedRules: string[]
  missingSignals: string[]
  parserSupported: boolean
}): UploadedMonthlyFileDecision {
  return {
    capability: input.capability,
    ingestionBranch: input.ingestionBranch,
    ingestionReason: buildIngestionReason(
      input.ingestionBranch,
      input.capability,
      'Soubor se nepodařilo jednoznačně přiřadit k podporovanému měsíčnímu zdroji.'
    ),
    detectedSignals: input.detectedSignals,
    matchedRules: input.matchedRules,
    missingSignals: input.missingSignals,
    parserSupported: input.parserSupported,
    confidence: input.detectedSignals.length > 0 ? 'hint' : 'none',
    resolvedSourceSystem: 'unknown',
    resolvedDocumentType: 'other',
    resolvedRole: 'primary',
    resolvedBucket: 'unclassified'
  }
}

function buildUnsupportedDecision(input: {
  capability: UploadedMonthlyFileCapabilityAssessment
  ingestionBranch: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['decision']['ingestionBranch']
  sourceSystem: SourceDocument['sourceSystem']
  documentType: SourceDocument['documentType']
  role: 'primary' | 'supplemental'
  matchedRules: string[]
  missingSignals: string[]
  detectedSignals: string[]
  parserSupported: boolean
  reason: string
}): UploadedMonthlyFileDecision {
  return {
    capability: input.capability,
    ingestionBranch: input.ingestionBranch,
    ingestionReason: input.reason,
    detectedSignals: input.detectedSignals,
    matchedRules: input.matchedRules,
    missingSignals: input.missingSignals,
    parserSupported: input.parserSupported,
    confidence: input.capability.confidence,
    resolvedSourceSystem: input.sourceSystem,
    resolvedDocumentType: input.documentType,
    resolvedRole: input.role,
    resolvedBucket: 'unsupported'
  }
}

function buildIngestionReason(
  branch: PreparedUploadedMonthlyFilesResult['fileRoutes'][number]['decision']['ingestionBranch'],
  capability: UploadedMonthlyFileCapabilityAssessment,
  fallbackReason?: string
): string {
  if (fallbackReason) {
    return fallbackReason
  }

  switch (branch) {
    case 'structured-parser':
      return 'Soubor má strukturovaný export vhodný pro deterministický parser.'
    case 'text-document-parser':
      return 'Soubor má čitelný textový obsah vhodný pro dokumentový parser.'
    case 'text-pdf-parser':
      return 'Soubor obsahuje textovou PDF vrstvu a pokračuje textovým PDF ingestem.'
    case 'ocr-required':
      return buildOcrRequiredReason(capability, 'unknown', 'other')
    case 'unsupported':
    default:
      return 'Soubor nemá dostatečnou ingest capability pro podporovaný deterministický tok.'
  }
}

function buildOcrRequiredReason(
  capability: UploadedMonthlyFileCapabilityAssessment,
  sourceSystem: SourceDocument['sourceSystem'],
  documentType: SourceDocument['documentType']
): string {
  if (capability.transportProfile === 'image_pdf') {
    return sourceSystem === 'booking' && documentType === 'payout_statement'
      ? 'Booking payout statement vypadá jako scan bez čitelné textové vrstvy. Pro ingest je potřeba OCR.'
      : capability.documentHints.includes('invoice_like')
        ? 'Doklad vypadá jako scan faktury bez čitelné textové vrstvy. V browser režimu zatím vyžaduje OCR.'
        : capability.documentHints.includes('receipt_like')
          ? 'Doklad vypadá jako scan účtenky bez čitelné textové vrstvy. V browser režimu zatím vyžaduje OCR.'
          : capability.documentHints.includes('payout_statement_like')
            ? 'Rozpoznaný payout statement je dostupný jen jako scan bez čitelné textové vrstvy. V browser režimu zatím vyžaduje OCR.'
            : 'PDF vypadá jako scan bez čitelné textové vrstvy. Pro ingest je potřeba OCR.'
  }

  if (capability.transportProfile === 'image_document') {
    return capability.documentHints.includes('invoice_like')
      ? 'Soubor vypadá jako obrázková faktura nebo scan. V browser režimu zatím vyžaduje OCR.'
      : capability.documentHints.includes('receipt_like')
        ? 'Soubor vypadá jako obrázkový výdajový doklad nebo scan. V browser režimu zatím vyžaduje OCR.'
        : 'Soubor vypadá jako obrázkový doklad nebo scan. Pro ingest je potřeba OCR.'
  }

  return 'Soubor vyžaduje OCR větev, která zatím není zapojená do deterministického ingestu.'
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

function looksLikeInvoiceDocumentText(content: string): boolean {
  return detectInvoiceDocumentKeywordHits(content).length >= 3
}

function looksLikeReceiptDocumentText(content: string): boolean {
  return countMatchingPatterns(content, [
    /\breceipt\s*(?:no|number)\b/i,
    /\bčíslo\s+účtenky\b/i,
    /\bmerchant\b/i,
    /\bstore\b/i,
    /\bobchod\b/i,
    /\bpurchase\s+date\b/i,
    /\bdatum\s+n[aá]kupu\b/i,
    /\bcategory\b/i,
    /\bkategorie\b/i,
    /\bnote\b/i,
    /\bpozn[aá]mka\b/i
  ]) >= 3
}

function countMatchingPatterns(content: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(content)).length
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

function buildParseDiagnosticMoneyLabel(
  amountMinor: number | undefined,
  currency: string | undefined
): string | undefined {
  if (amountMinor === undefined || !currency) {
    return undefined
  }

  return `${(amountMinor / 100).toFixed(2)} ${currency}`
}
