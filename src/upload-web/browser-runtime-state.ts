import { buildExportArtifactsFiles } from '../export/shared'
import { detectBookingPayoutStatementKeywordHits } from '../extraction'
import {
  ingestUploadedMonthlyFiles,
  type UploadedMonthlyFile
} from '../monthly-batch'
import { buildReviewScreen } from '../review'
import { formatAmountMinorCs } from '../shared/money'
import type { BrowserRuntimeUploadState } from './index.js'

type IngestionBatch = ReturnType<typeof ingestUploadedMonthlyFiles>['batch']

export interface BuildBrowserRuntimeStateInput {
  files: UploadedMonthlyFile[]
  runId: string
  generatedAt: string
}

export function buildBrowserRuntimeUploadStateFromFiles(
  input: BuildBrowserRuntimeStateInput
): BrowserRuntimeUploadState {
  const ingestion = ingestUploadedMonthlyFiles({
    files: input.files,
    reconciliationContext: {
      runId: input.runId,
      requestedAt: input.generatedAt
    },
    reportGeneratedAt: input.generatedAt
  })
  const importedFiles = ingestion.importedFiles
  const batch = ingestion.batch
  const review = buildReviewScreen({
    batch,
    generatedAt: input.generatedAt
  })
  const exportFiles = buildExportArtifactsFiles({
    batch,
    review
  })
  const runtimeAudit = buildRuntimeAudit(input.files, ingestion.fileRoutes, importedFiles, batch, review)

  return {
    generatedAt: input.generatedAt,
    runId: input.runId,
    monthLabel: deriveMonthLabel(input.runId),
    routingSummary: {
      uploadedFileCount: ingestion.fileRoutes.length,
      supportedFileCount: ingestion.fileRoutes.filter((file) => file.status === 'supported').length,
      unsupportedFileCount: ingestion.fileRoutes.filter((file) => file.status === 'unsupported').length,
      errorFileCount: ingestion.fileRoutes.filter((file) => file.status === 'error').length
    },
    runtimeAudit,
    preparedFiles: importedFiles.map((file) => ({
      fileName: file.sourceDocument.fileName,
      sourceDocumentId: file.sourceDocument.id,
      sourceSystem: file.sourceDocument.sourceSystem,
      documentType: file.sourceDocument.documentType,
      parserId: file.routing?.parserId,
      classificationBasis: file.routing?.classificationBasis ?? 'unknown',
      role: file.routing?.role ?? 'primary',
      warnings: file.routing?.warnings ?? []
    })),
    fileRoutes: ingestion.fileRoutes.map((file) => ({
      fileName: file.fileName,
      status: file.status,
      intakeStatus: file.intakeStatus,
      sourceSystem: file.sourceSystem,
      documentType: file.documentType,
      sourceDocumentId: file.sourceDocumentId,
      parserId: file.parserId,
      classificationBasis: file.classificationBasis,
      role: file.role,
      extractedCount: file.extractedCount ?? 0,
      extractedRecordIds: file.extractedRecordIds ?? [],
      warnings: file.warnings,
      reason: file.reason,
      errorMessage: file.errorMessage,
      decision: file.decision
    })),
    extractedRecords: importedFiles.map((file) => ({
      fileName: file.sourceDocument.fileName,
      extractedCount: findBatchFileExtractedCount(batch, file.sourceDocument.id),
      extractedRecordIds: findBatchFileExtractedIds(batch, file.sourceDocument.id),
      accountLabelCs: buildAccountLabel(
        file.sourceDocument.fileName,
        findBatchFileExtractedAccountId(batch, file.sourceDocument.id),
        file.sourceDocument.sourceSystem,
        file.sourceDocument.documentType
      ),
      parserDebugLabel: findBatchFileParserVariant(batch, file.sourceDocument.id)
    })),
    supportedExpenseLinks: batch.report.supportedExpenseLinks.map((link) => ({
      expenseTransactionId: link.expenseTransactionId,
      supportTransactionId: link.supportTransactionId,
      supportSourceDocumentIds: link.supportSourceDocumentIds,
      matchScore: link.matchScore,
      reasons: link.reasons
    })),
    reportSummary: batch.report.summary,
    reportTransactions: batch.report.transactions.slice(0, 5).map((transaction) => ({
      transactionId: transaction.transactionId,
      labelCs: buildVisibleTransactionLabel(
        transaction.transactionId,
        transaction.source,
        findVisibleTransactionSubtype(batch, transaction.transactionId, transaction.source)
      ),
      source: transaction.source,
      subtype: findVisibleTransactionSubtype(batch, transaction.transactionId, transaction.source),
      amount: formatAmountMinorCs(transaction.amountMinor, transaction.currency),
      status: transaction.status
    })),
    reviewSummary: review.summary,
    reviewSections: {
      matched: review.matched,
      reservationSettlementOverview: review.reservationSettlementOverview,
      ancillarySettlementOverview: review.ancillarySettlementOverview,
      unmatchedReservationSettlements: review.unmatchedReservationSettlements,
      payoutBatchMatched: review.payoutBatchMatched,
      payoutBatchUnmatched: review.payoutBatchUnmatched,
      unmatched: review.unmatched,
      suspicious: review.suspicious,
      missingDocuments: review.missingDocuments
    },
    exportFiles: exportFiles.map((file) => ({
      labelCs: file.labelCs,
      fileName: file.fileName
    }))
  }
}

function buildRuntimeAudit(
  uploadedFiles: UploadedMonthlyFile[],
  fileRoutes: ReturnType<typeof ingestUploadedMonthlyFiles>['fileRoutes'],
  importedFiles: ReturnType<typeof ingestUploadedMonthlyFiles>['importedFiles'],
  batch: ReturnType<typeof ingestUploadedMonthlyFiles>['batch'],
  review: ReturnType<typeof buildReviewScreen>
): BrowserRuntimeUploadState['runtimeAudit'] {
  const airbnbSourceDocumentIds = importedFiles
    .filter((file) => file.sourceDocument.sourceSystem === 'airbnb')
    .map((file) => file.sourceDocument.id)

  const extractedAirbnbTransferRecords = batch.extractedRecords.filter((record) => {
    if (!airbnbSourceDocumentIds.includes(record.sourceDocumentId)) {
      return false
    }

    return String(record.data.rowKind ?? '') === 'transfer'
  })

  const workflowAirbnbPayoutRows = (batch.reconciliation.workflowPlan?.payoutRows ?? [])
    .filter((row) => String(row.platform).toLowerCase() === 'airbnb')

  const reportMatchedAirbnb = batch.report.payoutBatchMatches
    .filter((item) => String(item.platform).toLowerCase() === 'airbnb')

  const reportUnmatchedAirbnb = batch.report.unmatchedPayoutBatches
    .filter((item) => String(item.platform).toLowerCase() === 'airbnb')

  const runtimeMatchedTitleSourceValues = review.payoutBatchMatched
    .filter((item) => String(item.title).startsWith('Airbnb payout dávka '))
    .map((item) => String(item.title).replace(/^Airbnb payout dávka\s+/, ''))

  const runtimeUnmatchedTitleSourceValues = review.payoutBatchUnmatched
    .filter((item) => String(item.title).startsWith('Airbnb payout dávka '))
    .map((item) => String(item.title).replace(/^Airbnb payout dávka\s+/, ''))

  return {
    payoutDiagnostics: {
      extractedAirbnbPayoutRowRefs: extractedAirbnbTransferRecords.map((record) => String(record.id ?? '')),
      extractedAirbnbRawReferences: extractedAirbnbTransferRecords.map((record) => String(record.rawReference ?? '')),
      extractedAirbnbDataReferences: extractedAirbnbTransferRecords.map((record) => String(record.data.reference ?? '')),
      extractedAirbnbReferenceCodes: extractedAirbnbTransferRecords.map((record) => String(record.data.referenceCode ?? '')),
      extractedAirbnbPayoutReferences: extractedAirbnbTransferRecords.map((record) => String(record.data.payoutReference ?? '')),
      workflowPayoutBatchKeys: workflowAirbnbPayoutRows.map((row) => String(row.payoutBatchKey ?? '')),
      workflowPayoutReferences: workflowAirbnbPayoutRows.map((row) => String(row.payoutReference ?? '')),
      reportMatchedPayoutReferences: reportMatchedAirbnb.map((item) => String(item.payoutReference ?? '')),
      reportUnmatchedPayoutReferences: reportUnmatchedAirbnb.map((item) => String(item.payoutReference ?? '')),
      runtimeMatchedTitleSourceValues,
      runtimeUnmatchedTitleSourceValues
    },
    fileIntakeDiagnostics: uploadedFiles.map((file, index) => {
      const route = fileRoutes[index]
      const browserTextExtraction = file.sourceDescriptor?.browserTextExtraction
      const parsedSupplement = findParsedBookingPayoutSupplementRecord(
        batch,
        route?.sourceDocumentId
      )
      const parseDiagnostics = route?.parseDiagnostics

      return {
        fileName: file.name,
        mimeType: file.sourceDescriptor?.mimeType,
        textExtractionMode: browserTextExtraction?.mode,
        textExtractionStatus: browserTextExtraction?.status,
        extractedTextPresent: file.content.trim().length > 0,
        textLength: file.content.length,
        textPreview: buildFileIntakeTextPreview(browserTextExtraction?.textPreview, file.content),
        textTailPreview: buildFileIntakeTextTailPreview(file.content),
        keywordHits: buildFileIntakeKeywordHits(file, browserTextExtraction?.detectedSignatures ?? []),
        detectedSignals: route?.decision.detectedSignals ?? [],
        detectedSignatures: browserTextExtraction?.detectedSignatures ?? [],
        matchedRules: route?.decision.matchedRules ?? [],
        missingSignals: route?.decision.missingSignals ?? [],
        parserSupported: route?.decision.parserSupported ?? false,
        decisionConfidence: route?.decision.confidence ?? 'none',
        parsedPaymentId: parseDiagnostics?.parsedPaymentId
          ?? parseSupplementStringField(parsedSupplement?.data.paymentId),
        parsedPayoutDate: parseDiagnostics?.parsedPayoutDate
          ?? parseSupplementStringField(parsedSupplement?.data.payoutDate),
        parsedPayoutTotal: parseDiagnostics?.parsedPayoutTotal
          ?? buildParsedMoneyDebugLabel(
            parseSupplementNumberField(parsedSupplement?.data.payoutTotalAmountMinor),
            parseSupplementStringField(parsedSupplement?.data.payoutTotalCurrency)
          ),
        parsedLocalTotal: parseDiagnostics?.parsedLocalTotal
          ?? buildParsedMoneyDebugLabel(
            parseSupplementNumberField(parsedSupplement?.data.localAmountMinor),
            parseSupplementStringField(parsedSupplement?.data.localCurrency)
          ),
        parsedIbanHint: parseDiagnostics?.parsedIbanHint
          ?? parseSupplementStringField(parsedSupplement?.data.ibanSuffix),
        parsedExchangeRate: parseDiagnostics?.parsedExchangeRate
          ?? parseSupplementStringField(parsedSupplement?.data.exchangeRate),
        requiredFieldsCheck: parseDiagnostics?.requiredFieldsCheck,
        missingFields: parseDiagnostics?.missingFields ?? [],
        sourceSystem: route?.sourceSystem ?? 'unknown',
        documentType: route?.documentType ?? 'other',
        classificationBasis: route?.classificationBasis ?? 'unknown',
        status: route?.status ?? 'unsupported',
        intakeStatus: route?.intakeStatus ?? 'unclassified',
        role: route?.role ?? 'primary'
      }
    })
  }
}

function buildFileIntakeTextPreview(textPreview: string | undefined, fallbackContent: string): string | undefined {
  const normalized = String(textPreview ?? fallbackContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length === 0) {
    return undefined
  }

  return normalized.slice(0, 160)
}

function buildFileIntakeTextTailPreview(fallbackContent: string): string | undefined {
  const normalized = String(fallbackContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length === 0) {
    return undefined
  }

  return normalized.length <= 160
    ? normalized
    : normalized.slice(-160)
}

function buildFileIntakeKeywordHits(
  file: UploadedMonthlyFile,
  detectedSignatures: string[]
): string[] {
  if ((file.contentFormat ?? file.sourceDescriptor?.browserTextExtraction?.mode) !== 'pdf-text') {
    return []
  }

  const hits = detectBookingPayoutStatementKeywordHits(file.content)

  if (hits.length > 0) {
    return hits
  }

  if (detectedSignatures.length > 0) {
    return detectedSignatures
  }

  return []
}

function findParsedBookingPayoutSupplementRecord(
  batch: IngestionBatch,
  sourceDocumentId: string | undefined
): IngestionBatch['extractedRecords'][number] | undefined {
  if (!sourceDocumentId) {
    return undefined
  }

  return batch.extractedRecords.find((record) =>
    record.sourceDocumentId === sourceDocumentId
    && record.recordType === 'payout-supplement'
    && String(record.data.platform ?? '').toLowerCase() === 'booking'
    && String(record.data.supplementRole ?? '').toLowerCase() === 'payout_statement'
  )
}

function parseSupplementStringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

function parseSupplementNumberField(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function buildParsedMoneyDebugLabel(amountMinor: number | undefined, currency: string | undefined): string | undefined {
  if (amountMinor === undefined || !currency) {
    return undefined
  }

  return `${(amountMinor / 100).toFixed(2)} ${currency}`
}

function findBatchFileExtractedCount(
  batch: IngestionBatch,
  sourceDocumentId: string
): number {
  return batch.files.find((file) => file.sourceDocumentId === sourceDocumentId)?.extractedCount ?? 0
}

function findBatchFileExtractedIds(
  batch: IngestionBatch,
  sourceDocumentId: string
): string[] {
  return batch.files.find((file) => file.sourceDocumentId === sourceDocumentId)?.extractedRecordIds ?? []
}

function findBatchFileExtractedAccountId(
  batch: IngestionBatch,
  sourceDocumentId: string
): string | undefined {
  return batch.extractedRecords.find((record) => record.sourceDocumentId === sourceDocumentId)?.data.accountId as string | undefined
}

function findBatchFileParserVariant(
  batch: IngestionBatch,
  sourceDocumentId: string
): string | undefined {
  return batch.extractedRecords.find((record) => record.sourceDocumentId === sourceDocumentId)?.data.bankParserVariant as string | undefined
}

function buildAccountLabel(
  fileName: string,
  accountId: string | undefined,
  sourceSystem: string,
  documentType: string
): string {
  const normalizedFileName = fileName.toLowerCase()

  if (sourceSystem !== 'bank') {
    return buildNonBankSourceLabel(sourceSystem, documentType)
  }

  if (accountId) {
    if (accountId.startsWith('5599955956')) {
      return `RB účet ${accountId}`
    }

    if (accountId.startsWith('8888997777')) {
      return `Fio účet ${accountId}`
    }

    return `Bankovní účet ${accountId}`
  }

  if (normalizedFileName.includes('5599955956')) {
    return 'RB účet 5599955956'
  }

  if (normalizedFileName.includes('8888997777')) {
    return 'Fio účet 8888997777'
  }

  return 'Bankovní účet neuveden'
}

function buildNonBankSourceLabel(sourceSystem: string, documentType: string): string {
  if (sourceSystem === 'booking' && documentType === 'payout_statement') {
    return 'Booking payout statement PDF'
  }

  if (sourceSystem === 'booking') {
    return 'Booking payout report'
  }

  if (sourceSystem === 'airbnb') {
    return 'Airbnb payout report'
  }

  if (sourceSystem === 'comgate') {
    return 'Comgate platební report'
  }

  if (sourceSystem === 'expedia') {
    return 'Expedia payout report'
  }

  if (sourceSystem === 'previo') {
    return 'Previo rezervační export'
  }

  if (documentType === 'invoice') {
    return 'Dodavatelská faktura'
  }

  if (documentType === 'receipt') {
    return 'Výdajový doklad'
  }

  if (documentType === 'ota_report') {
    return 'OTA payout report'
  }

  return 'Nebankovní zdroj zpracování'
}

function deriveMonthLabel(runId: string): string {
  const prefix = 'browser-runtime-upload-'

  if (!runId.startsWith(prefix)) {
    return 'neuvedeno'
  }

  const suffix = runId.slice(prefix.length)
  return suffix === 'local' ? 'neuvedeno' : suffix
}

function findVisibleTransactionSubtype(
  batch: IngestionBatch,
  transactionId: string,
  source: string
): string | undefined {
  if (source !== 'airbnb') {
    return undefined
  }

  const extractedRecord = batch.extractedRecords.find((record) => `txn:payout:${record.id}` === transactionId)
  return typeof extractedRecord?.data.rowKind === 'string' ? extractedRecord.data.rowKind : undefined
}

function buildVisibleTransactionLabel(transactionId: string, source: string, subtype?: string): string {
  const normalizedSource = source.toLowerCase()
  const normalizedId = transactionId.toLowerCase()

  if (normalizedSource.includes('booking') || normalizedId.includes('booking')) {
    return 'Booking.com payout'
  }

  if (normalizedSource.includes('airbnb') || normalizedId.includes('airbnb')) {
    if (subtype === 'reservation') {
      return 'Airbnb rezervace'
    }

    return 'Airbnb payout'
  }

  if (normalizedSource.includes('comgate') || normalizedId.includes('comgate')) {
    return 'Comgate platba'
  }

  if (normalizedSource.includes('expedia') || normalizedId.includes('expedia')) {
    return 'Expedia settlement'
  }

  if (normalizedSource.includes('bank') || normalizedId.includes('bank')) {
    return 'Bankovní transakce'
  }

  return 'Transakce'
}
