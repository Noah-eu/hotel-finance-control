import { buildExportArtifactsFiles } from '../export/shared'
import {
  detectBookingPayoutStatementKeywordHits,
  detectInvoiceDocumentKeywordHits,
  inspectComgateHeaderDiagnostics
} from '../extraction'
import {
  ingestUploadedMonthlyFiles,
  ingestUploadedMonthlyFilesProgressively,
  type UploadedMonthlyFile
} from '../monthly-batch'
import { inspectPayoutBatchBankDecisions, type PreviousMonthCarryoverSource } from '../reconciliation'
import {
  buildReservationPaymentOverview,
  buildReviewScreen,
  inspectInternalTransferPairSelections,
  inspectReservationPaymentOverviewClassification
} from '../review'
import { resolveRuntimeBuildInfo } from '../shared/build-provenance'
import { formatAmountMinorCs } from '../shared/money'
import type { BrowserRuntimeProgressUpdate, BrowserRuntimeUploadState } from './index.js'

type IngestionBatch = ReturnType<typeof ingestUploadedMonthlyFiles>['batch']

export interface BuildBrowserRuntimeStateInput {
  files: UploadedMonthlyFile[]
  runId: string
  generatedAt: string
  previousMonthCarryoverSource?: PreviousMonthCarryoverSource
  runtimeBuildInfo?: BrowserRuntimeUploadState['runtimeBuildInfo']
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
    reportGeneratedAt: input.generatedAt,
    previousMonthCarryoverSource: input.previousMonthCarryoverSource
  })

  return buildBrowserRuntimeUploadStateFromIngestion(input, ingestion)
}

export async function buildBrowserRuntimeUploadStateFromFilesProgressively(
  input: BuildBrowserRuntimeStateInput,
  options: {
    onProgress?: (progress: BrowserRuntimeProgressUpdate) => void
    yieldEvery?: number
  } = {}
): Promise<BrowserRuntimeUploadState> {
  const ingestion = await ingestUploadedMonthlyFilesProgressively({
    files: input.files,
    reconciliationContext: {
      runId: input.runId,
      requestedAt: input.generatedAt
    },
    reportGeneratedAt: input.generatedAt,
    previousMonthCarryoverSource: input.previousMonthCarryoverSource
  }, {
    onProgress(progress) {
      options.onProgress?.({
        stage: progress.stage,
        totalFiles: progress.totalFiles,
        completedFiles: progress.completedFiles,
        currentFileName: progress.currentFileName,
        currentFileStatus: progress.currentFileStatus
      })
    },
    yieldEvery: options.yieldEvery
  })

  options.onProgress?.({
    stage: 'finalizing',
    totalFiles: input.files.length,
    completedFiles: input.files.length
  })
  await yieldBrowserRuntimeStateWork()

  return buildBrowserRuntimeUploadStateFromIngestion(input, ingestion)
}

function buildBrowserRuntimeUploadStateFromIngestion(
  input: BuildBrowserRuntimeStateInput,
  ingestion: ReturnType<typeof ingestUploadedMonthlyFiles>
): BrowserRuntimeUploadState {
  const importedFiles = ingestion.importedFiles
  const batch = ingestion.batch
  const review = buildReviewScreen({
    batch,
    generatedAt: input.generatedAt,
    fileRoutes: ingestion.fileRoutes
  })
  const reservationPaymentOverview = buildReservationPaymentOverview(batch)
  const reservationPaymentOverviewDebug = inspectReservationPaymentOverviewClassification(batch)
  const previoAncillaryParserTrace = batch.extractedRecords
    .filter((record) => record.data.platform === 'previo')
    .filter((record) => record.data.rowKind === 'ancillary')
    .map((record) => ({
      sourceRecordId: record.id,
      sourceDocumentId: record.sourceDocumentId,
      reference: typeof record.data.reference === 'string' && record.data.reference.trim().length > 0
        ? record.data.reference.trim()
        : typeof record.rawReference === 'string' && record.rawReference.trim().length > 0
          ? record.rawReference.trim()
          : record.id,
      itemLabel: typeof record.data.itemLabel === 'string' && record.data.itemLabel.trim().length > 0
        ? record.data.itemLabel.trim()
        : undefined,
      roomName: typeof record.data.roomName === 'string' && record.data.roomName.trim().length > 0
        ? record.data.roomName.trim()
        : undefined,
      channel: typeof record.data.channel === 'string' && record.data.channel.trim().length > 0
        ? record.data.channel.trim()
        : undefined,
      stayStartAt: typeof record.data.stayStartAt === 'string' && record.data.stayStartAt.trim().length > 0
        ? record.data.stayStartAt.trim()
        : undefined,
      stayEndAt: typeof record.data.stayEndAt === 'string' && record.data.stayEndAt.trim().length > 0
        ? record.data.stayEndAt.trim()
        : undefined
    }))
  const exportFiles = buildExportArtifactsFiles({
    batch,
    review
  })
  const runtimeAudit = buildRuntimeAudit(input.files, ingestion.fileRoutes, importedFiles, batch, review)
  const payoutBatchMatchCount = review.payoutBatchMatched.length
  const unmatchedPayoutBatchCount = review.payoutBatchUnmatched.length

  return {
    generatedAt: input.generatedAt,
    runId: input.runId,
    monthLabel: deriveMonthLabel(input.runId),
    runtimeBuildInfo: input.runtimeBuildInfo ?? resolveRuntimeBuildInfo({
      generatedAt: input.generatedAt,
      fallbackBuildSource: 'browser-runtime'
    }),
    reconciliationSnapshot: buildReconciliationSnapshot(batch),
    carryoverSourceSnapshot: buildCarryoverSourceSnapshot(batch, deriveMonthLabel(input.runId)),
    reservationPaymentOverviewDebug,
    previoAncillaryParserTrace,
    carryoverDebug: buildCarryoverDebugState(batch, input),
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
    reportSummary: {
      ...batch.report.summary,
      payoutBatchMatchCount,
      unmatchedPayoutBatchCount
    },
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
    reservationPaymentOverview,
    reviewSections: {
      matched: review.matched,
      reservationSettlementOverview: review.reservationSettlementOverview,
      ancillarySettlementOverview: review.ancillarySettlementOverview,
      unmatchedReservationSettlements: review.unmatchedReservationSettlements,
      payoutBatchMatched: review.payoutBatchMatched,
      payoutBatchUnmatched: review.payoutBatchUnmatched,
      expenseMatched: review.expenseMatched,
      expenseNeedsReview: review.expenseNeedsReview,
      expenseUnmatchedDocuments: review.expenseUnmatchedDocuments,
      expenseUnmatchedOutflows: review.expenseUnmatchedOutflows,
      expenseUnmatchedInflows: review.expenseUnmatchedInflows,
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

function buildCarryoverSourceSnapshot(
  batch: ReturnType<typeof ingestUploadedMonthlyFiles>['batch'],
  monthLabel: string
): BrowserRuntimeUploadState['carryoverSourceSnapshot'] {
  const unmatchedBatchKeys = new Set(
    (batch.reconciliation.payoutBatchNoMatchDiagnostics ?? []).map((item) => item.payoutBatchKey)
  )
  const payoutBatches = (batch.reconciliation.workflowPlan?.payoutBatches ?? [])
    .filter((item) => item.platform === 'comgate')
    .filter((item) => !item.fromPreviousMonth)
    .filter((item) => unmatchedBatchKeys.has(item.payoutBatchKey))
    .map((item) => ({
      payoutBatchKey: item.payoutBatchKey,
      platform: item.platform,
      payoutReference: item.payoutReference,
      payoutDate: item.payoutDate,
      bankRoutingTarget: item.bankRoutingTarget,
      rowIds: item.rowIds.slice(),
      expectedTotalMinor: item.expectedTotalMinor,
      grossTotalMinor: item.grossTotalMinor,
      feeTotalMinor: item.feeTotalMinor,
      netSettlementTotalMinor: item.netSettlementTotalMinor,
      currency: item.currency,
      payoutSupplementPaymentId: item.payoutSupplementPaymentId,
      payoutSupplementPayoutDate: item.payoutSupplementPayoutDate,
      payoutSupplementPayoutTotalAmountMinor: item.payoutSupplementPayoutTotalAmountMinor,
      payoutSupplementPayoutTotalCurrency: item.payoutSupplementPayoutTotalCurrency,
      payoutSupplementLocalAmountMinor: item.payoutSupplementLocalAmountMinor,
      payoutSupplementLocalCurrency: item.payoutSupplementLocalCurrency,
      payoutSupplementIbanSuffix: item.payoutSupplementIbanSuffix,
      payoutSupplementExchangeRate: item.payoutSupplementExchangeRate,
      payoutSupplementReferenceHints: item.payoutSupplementReferenceHints?.slice(),
      payoutSupplementSourceDocumentIds: item.payoutSupplementSourceDocumentIds?.slice(),
      payoutSupplementReservationIds: item.payoutSupplementReservationIds?.slice()
    }))

  return {
    sourceMonthKey: monthLabel,
    payoutBatches
  }
}

function buildCarryoverDebugState(
  batch: ReturnType<typeof ingestUploadedMonthlyFiles>['batch'],
  input: BuildBrowserRuntimeStateInput
): BrowserRuntimeUploadState['carryoverDebug'] {
  const matchingInputPayoutBatchKeys = Array.isArray(input.previousMonthCarryoverSource?.payoutBatches)
    ? input.previousMonthCarryoverSource.payoutBatches.map((item) => item.payoutBatchKey)
    : []
  const carryoverPayoutBatchKeys = new Set(
    (batch.reconciliation.workflowPlan?.payoutBatches ?? [])
      .filter((item) => item.fromPreviousMonth)
      .map((item) => item.payoutBatchKey)
  )
  const carryoverDecision = inspectPayoutBatchBankDecisions({
    payoutBatches: batch.reconciliation.workflowPlan?.payoutBatches ?? [],
    bankTransactions: batch.reconciliation.normalizedTransactions
  }).find((item) => item.fromPreviousMonth && item.platform === 'comgate')

  return {
    sourceMonthKey: input.previousMonthCarryoverSource?.sourceMonthKey,
    currentMonthKey: deriveMonthLabel(input.runId),
    loadedPayoutBatchCount: carryoverPayoutBatchKeys.size,
    loadedPayoutBatchKeysSample: Array.from(carryoverPayoutBatchKeys).slice(0, 5),
    matchingInputPayoutBatchCount: matchingInputPayoutBatchKeys.length,
    matchingInputPayoutBatchKeysSample: matchingInputPayoutBatchKeys.slice(0, 5),
    matcherCarryoverCandidateExists: Boolean(carryoverDecision?.carryoverCandidateExistsInMatcher),
    matcherCarryoverRejectedReason: carryoverDecision?.carryoverRejectedReason,
    matchedCount: (batch.reconciliation.payoutBatchMatches ?? []).filter((item) => carryoverPayoutBatchKeys.has(item.payoutBatchKey)).length,
    unmatchedCount: (batch.reconciliation.payoutBatchNoMatchDiagnostics ?? []).filter((item) => carryoverPayoutBatchKeys.has(item.payoutBatchKey)).length
  }
}

async function yieldBrowserRuntimeStateWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function buildReconciliationSnapshot(
  batch: ReturnType<typeof ingestUploadedMonthlyFiles>['batch']
): BrowserRuntimeUploadState['reconciliationSnapshot'] {
  const matchedItems = (batch.reconciliation.payoutBatchMatches ?? []).filter((item) => item.matched)
  const unmatchedItems = batch.reconciliation.payoutBatchNoMatchDiagnostics ?? []
  const payoutBatchDecisions = buildPayoutBatchDecisionSnapshot(batch)
  const inboundBankTransactions = batch.reconciliation.normalizedTransactions
    .filter((transaction) => transaction.source === 'bank' && transaction.direction === 'in')
    .map((transaction) => ({
      transactionId: transaction.id,
      bookedAt: transaction.bookedAt,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      counterparty: transaction.counterparty,
      reference: transaction.reference,
      accountId: transaction.accountId
    }))

  return {
    sourceFunction: 'buildBrowserRuntimeUploadStateFromFiles -> batch.reconciliation',
    objectPath: 'state.reconciliationSnapshot',
    matchedCount: matchedItems.length,
    unmatchedCount: unmatchedItems.length,
    matchedPayoutBatchKeys: matchedItems.map((item) => item.payoutBatchKey),
    unmatchedPayoutBatchKeys: unmatchedItems.map((item) => item.payoutBatchKey),
    payoutBatchDecisions,
    airbnbUnmatchedHistogram: buildAirbnbUnmatchedHistogram(payoutBatchDecisions),
    inboundBankTransactions
  }
}

function buildPayoutBatchDecisionSnapshot(
  batch: ReturnType<typeof ingestUploadedMonthlyFiles>['batch']
): BrowserRuntimeUploadState['reconciliationSnapshot']['payoutBatchDecisions'] {
  const payoutRows = batch.reconciliation.workflowPlan?.payoutRows ?? []
  const payoutRowsByBatchKey = new Map<string, Array<(typeof payoutRows)[number]>>()

  for (const row of payoutRows) {
    const items = payoutRowsByBatchKey.get(row.payoutBatchKey) ?? []
    items.push(row)
    payoutRowsByBatchKey.set(row.payoutBatchKey, items)
  }

  return inspectPayoutBatchBankDecisions({
    payoutBatches: batch.reconciliation.workflowPlan?.payoutBatches ?? [],
    bankTransactions: batch.reconciliation.normalizedTransactions
  }).map((decision) => {
    const componentRows = payoutRowsByBatchKey.get(decision.payoutBatchKey) ?? []
    const nearestAmountDeltaMinor = decision.exactAmountMatchExistsBeforeDateEvidence
      ? 0
      : decision.sameCurrencyCandidateAmountMinors
        .map((amountMinor) => Math.abs(amountMinor - decision.expectedBankAmountMinor))
        .sort((left, right) => left - right)[0]

    return {
      payoutBatchKey: decision.payoutBatchKey,
      platform: decision.platform,
      expectedTotalMinor: decision.expectedTotalMinor,
      grossTotalMinor: decision.grossTotalMinor,
      feeTotalMinor: decision.feeTotalMinor,
      netSettlementTotalMinor: decision.netSettlementTotalMinor,
      documentTotalMinor: decision.documentTotalMinor,
      expectedBankAmountMinor: decision.expectedBankAmountMinor,
      currency: decision.currency,
      documentCurrency: decision.documentCurrency,
      expectedBankCurrency: decision.expectedBankCurrency,
      matchingAmountSource: decision.matchingAmountSource,
      selectionMode: decision.selectionMode,
      fromPreviousMonth: decision.fromPreviousMonth,
      sourceMonthKey: decision.sourceMonthKey,
      exactAmountMatchExistsBeforeDateEvidence: decision.exactAmountMatchExistsBeforeDateEvidence,
      sameCurrencyCandidateAmountMinors: decision.sameCurrencyCandidateAmountMinors,
      sameMonthExactAmountCandidateExists: decision.sameMonthExactAmountCandidateExists,
      rejectedOnlyByDateGate: decision.rejectedOnlyByDateGate,
      appliedComgateSameMonthLagRule: decision.appliedComgateSameMonthLagRule,
      wouldRejectOnStrictDateGate: decision.wouldRejectOnStrictDateGate,
      carryoverCandidateExistsInMatcher: decision.carryoverCandidateExistsInMatcher,
      carryoverRejectedReason: decision.carryoverRejectedReason,
      nearestAmountDeltaMinor,
      componentRowCount: componentRows.length,
      componentRowAmountMinors: componentRows.map((row) => row.amountMinor),
      payoutDate: decision.payoutDate,
      bankCandidateCountBeforeFiltering: decision.bankCandidateCountBeforeFiltering,
      bankCandidateCountAfterAmountCurrency: decision.bankCandidateCountAfterAmountCurrency,
      bankCandidateCountAfterDateWindow: decision.bankCandidateCountAfterDateWindow,
      bankCandidateCountAfterEvidenceFiltering: decision.bankCandidateCountAfterEvidenceFiltering,
      matched: decision.matched,
      matchedBankTransactionId: decision.matchedBankTransactionId,
      noMatchReason: decision.noMatchReason
    }
  })
}

function buildAirbnbUnmatchedHistogram(
  decisions: BrowserRuntimeUploadState['reconciliationSnapshot']['payoutBatchDecisions']
): BrowserRuntimeUploadState['reconciliationSnapshot']['airbnbUnmatchedHistogram'] {
  const airbnbUnmatched = decisions.filter((decision) => decision.platform === 'airbnb' && !decision.matched)

  let noExactAmount = 0
  let dateRejected = 0
  let evidenceRejected = 0
  let ambiguous = 0
  let other = 0

  for (const decision of airbnbUnmatched) {
    if (!decision.exactAmountMatchExistsBeforeDateEvidence) {
      noExactAmount += 1
      continue
    }

    if (decision.noMatchReason === 'ambiguousCandidates') {
      ambiguous += 1
      continue
    }

    if (decision.bankCandidateCountAfterDateWindow === 0) {
      dateRejected += 1
      continue
    }

    if (decision.bankCandidateCountAfterEvidenceFiltering === 0) {
      evidenceRejected += 1
      continue
    }

    other += 1
  }

  return {
    noExactAmount,
    dateRejected,
    evidenceRejected,
    ambiguous,
    other
  }
}

function buildRuntimeAudit(
  uploadedFiles: UploadedMonthlyFile[],
  fileRoutes: ReturnType<typeof ingestUploadedMonthlyFiles>['fileRoutes'],
  importedFiles: ReturnType<typeof ingestUploadedMonthlyFiles>['importedFiles'],
  batch: ReturnType<typeof ingestUploadedMonthlyFiles>['batch'],
  review: ReturnType<typeof buildReviewScreen>
): BrowserRuntimeUploadState['runtimeAudit'] {
  const payoutDecisionTraces = inspectPayoutBatchBankDecisions({
    payoutBatches: batch.reconciliation.workflowPlan?.payoutBatches ?? [],
    bankTransactions: batch.reconciliation.normalizedTransactions
  })
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
  const internalTransferDiagnostics = inspectInternalTransferPairSelections(
    batch.reconciliation.normalizedTransactions,
    new Set(batch.reconciliation.supportedExpenseLinks.map((link) => link.expenseTransactionId))
  )
  const exactInternalTransferPairTrace = buildExactInternalTransferPairTrace(
    batch,
    review,
    internalTransferDiagnostics
  )

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
    internalTransferDiagnostics,
    exactInternalTransferPairTrace,
    fileIntakeDiagnostics: uploadedFiles.map((file, index) => {
      const route = fileRoutes[index]
      const browserTextExtraction = file.sourceDescriptor?.browserTextExtraction
      const parsedSupplement = findParsedBookingPayoutSupplementRecord(
        batch,
        route?.sourceDocumentId
      )
      const parseDiagnostics = route?.parseDiagnostics
      const fallbackComgateHeaderDiagnostics = buildFallbackComgateHeaderDiagnostics(file.content, parseDiagnostics?.comgateHeaderDiagnostics)
      const comgatePipelineDiagnostics = buildComgatePipelineDiagnostics(
        batch,
        route?.sourceDocumentId,
        route?.sourceSystem,
        payoutDecisionTraces,
        fallbackComgateHeaderDiagnostics
      )

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
        capabilityProfile: route?.decision.capability.profile ?? file.sourceDescriptor?.capability?.profile ?? 'unknown',
        capabilityTransportProfile: route?.decision.capability.transportProfile ?? file.sourceDescriptor?.capability?.transportProfile ?? 'unknown_document',
        capabilityDocumentHints: route?.decision.capability.documentHints ?? file.sourceDescriptor?.capability?.documentHints ?? [],
        capabilityConfidence: route?.decision.capability.confidence ?? file.sourceDescriptor?.capability?.confidence ?? 'none',
        capabilityEvidence: route?.decision.capability.evidence ?? file.sourceDescriptor?.capability?.evidence ?? [],
        ingestionBranch: route?.decision.ingestionBranch ?? 'unsupported',
        ingestionReason: route?.decision.ingestionReason ?? route?.reason ?? route?.errorMessage,
        detectedSignals: route?.decision.detectedSignals ?? [],
        detectedSignatures: browserTextExtraction?.detectedSignatures ?? [],
        matchedRules: route?.decision.matchedRules ?? [],
        missingSignals: route?.decision.missingSignals ?? [],
        parserSupported: route?.decision.parserSupported ?? false,
        decisionConfidence: route?.decision.confidence ?? 'none',
        documentExtractionSummary: parseDiagnostics?.documentExtractionSummary,
        airbnbHeaderDiagnostics: parseDiagnostics?.airbnbHeaderDiagnostics,
        comgateHeaderDiagnostics: parseDiagnostics?.comgateHeaderDiagnostics ?? fallbackComgateHeaderDiagnostics,
        parserExtractedPaymentId: parseDiagnostics?.parserExtractedPaymentId,
        parserExtractedPayoutDate: parseDiagnostics?.parserExtractedPayoutDate,
        parserExtractedPayoutTotal: parseDiagnostics?.parserExtractedPayoutTotal,
        parserExtractedLocalTotal: parseDiagnostics?.parserExtractedLocalTotal,
        parserExtractedIbanHint: parseDiagnostics?.parserExtractedIbanHint,
        parserExtractedExchangeRate: parseDiagnostics?.parserExtractedExchangeRate,
        validatorInputPaymentId: parseDiagnostics?.validatorInputPaymentId,
        validatorInputPayoutDate: parseDiagnostics?.validatorInputPayoutDate,
        validatorInputPayoutTotal: parseDiagnostics?.validatorInputPayoutTotal,
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
        presentFields: parseDiagnostics?.presentFields ?? [],
        noExtractReason: parseDiagnostics?.noExtractReason,
        parsedSupplierOrCounterparty: parseDiagnostics?.parsedSupplierOrCounterparty,
        parsedReferenceNumber: parseDiagnostics?.parsedReferenceNumber,
        parsedSettlementDirection: parseDiagnostics?.parsedSettlementDirection,
        parsedAmountMinor: parseDiagnostics?.parsedAmountMinor,
        parsedAmountCurrency: parseDiagnostics?.parsedAmountCurrency,
        parsedDateCandidate: parseDiagnostics?.parsedDateCandidate,
        parsedTargetBankAccountHint: parseDiagnostics?.parsedTargetBankAccountHint,
        invoiceScanFallbackApplied: parseDiagnostics?.invoiceScanFallbackApplied,
        invoiceScanFallbackRejectedReason: parseDiagnostics?.invoiceScanFallbackRejectedReason,
        invoiceScanFallbackRecordCreated: parseDiagnostics?.invoiceScanFallbackRecordCreated,
        invoiceScanFallbackRecordDroppedReason: parseDiagnostics?.invoiceScanFallbackRecordDroppedReason,
        comgatePipelineDiagnostics,
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

const EXACT_INTERNAL_TRANSFER_OUTGOING_REFERENCE = '76526712'
const EXACT_INTERNAL_TRANSFER_INCOMING_REFERENCE = '71394921'
const EXACT_INTERNAL_TRANSFER_AMOUNT_MINOR = 500000
const EXACT_INTERNAL_TRANSFER_CURRENCY = 'CZK'
const INTERNAL_TRANSFER_PRIMARY_DAY_GATE = 2
const INTERNAL_TRANSFER_EXTENDED_DAY_GATE = 14

function buildExactInternalTransferPairTrace(
  batch: ReturnType<typeof ingestUploadedMonthlyFiles>['batch'],
  review: ReturnType<typeof buildReviewScreen>,
  internalTransferDiagnostics: BrowserRuntimeUploadState['runtimeAudit']['internalTransferDiagnostics']
): BrowserRuntimeUploadState['runtimeAudit']['exactInternalTransferPairTrace'] | undefined {
  const bankTransactions = batch.reconciliation.normalizedTransactions.filter((transaction) =>
    transaction.source === 'bank'
    && transaction.currency === EXACT_INTERNAL_TRANSFER_CURRENCY
    && transaction.amountMinor === EXACT_INTERNAL_TRANSFER_AMOUNT_MINOR
  )
  const outgoing = bankTransactions.find((transaction) =>
    transaction.direction === 'out'
    && transaction.reference === EXACT_INTERNAL_TRANSFER_OUTGOING_REFERENCE
  )
  const incoming = bankTransactions.find((transaction) =>
    transaction.direction === 'in'
    && transaction.reference === EXACT_INTERNAL_TRANSFER_INCOMING_REFERENCE
  )

  if (!outgoing || !incoming) {
    return undefined
  }

  const knownOwnAccountIds = [...new Set(bankTransactions.map((transaction) => transaction.accountId).filter(Boolean))]
  const extractedRecordsById = new Map(batch.extractedRecords.map((record) => [record.id, record]))
  const outgoingTrace = buildExactMovementTrace({
    transaction: outgoing,
    counterMovement: incoming,
    allBankTransactions: bankTransactions,
    knownOwnAccountIds,
    extractedRecordsById
  })
  const incomingTrace = buildExactMovementTrace({
    transaction: incoming,
    counterMovement: outgoing,
    allBankTransactions: bankTransactions,
    knownOwnAccountIds,
    extractedRecordsById
  })
  const matchedReviewItem = review.expenseMatched.find((item) =>
    item.transactionIds.includes(outgoing.id)
    && item.transactionIds.includes(incoming.id)
  )
  const unmatchedOutgoingItem = review.expenseUnmatchedOutflows.find((item) => item.transactionIds.includes(outgoing.id))
  const unmatchedIncomingItem = review.expenseUnmatchedInflows.find((item) => item.transactionIds.includes(incoming.id))
  const pairDiagnostic = internalTransferDiagnostics.find((trace) =>
    trace.outgoingTransactionId === outgoing.id
    && trace.incomingTransactionId === incoming.id
  )

  return {
    outgoing: outgoingTrace,
    incoming: incomingTrace,
    internalTransferPairCreated: Boolean(pairDiagnostic?.matched),
    matchedTransferPairId: matchedReviewItem?.id,
    consumedInReviewProjection: Boolean(matchedReviewItem) && !unmatchedOutgoingItem && !unmatchedIncomingItem,
    visibleInUnmatchedOutgoing: Boolean(unmatchedOutgoingItem),
    visibleInUnmatchedIncoming: Boolean(unmatchedIncomingItem),
    visibleUnmatchedOutgoingReason: unmatchedOutgoingItem?.detail,
    visibleUnmatchedIncomingReason: unmatchedIncomingItem?.detail
  }
}

function buildExactMovementTrace(input: {
  transaction: ReturnType<typeof ingestUploadedMonthlyFiles>['batch']['reconciliation']['normalizedTransactions'][number]
  counterMovement: ReturnType<typeof ingestUploadedMonthlyFiles>['batch']['reconciliation']['normalizedTransactions'][number]
  allBankTransactions: ReturnType<typeof ingestUploadedMonthlyFiles>['batch']['reconciliation']['normalizedTransactions']
  knownOwnAccountIds: string[]
  extractedRecordsById: Map<string, ReturnType<typeof ingestUploadedMonthlyFiles>['batch']['extractedRecords'][number]>
}): NonNullable<BrowserRuntimeUploadState['runtimeAudit']['exactInternalTransferPairTrace']>['outgoing'] {
  const oppositeDirectionCandidates = input.allBankTransactions.filter((candidate) =>
    candidate.id !== input.transaction.id
    && candidate.direction !== input.transaction.direction
  )
  const sameAmountCandidates = input.allBankTransactions.filter((candidate) =>
    candidate.id !== input.transaction.id
    && candidate.amountMinor === input.transaction.amountMinor
    && candidate.currency === input.transaction.currency
  )
  const directionAndAmountCandidates = oppositeDirectionCandidates.filter((candidate) =>
    candidate.amountMinor === input.transaction.amountMinor
    && candidate.currency === input.transaction.currency
  )
  const ownAccountAndHintCandidates = directionAndAmountCandidates.filter((candidate) =>
    candidate.accountId !== input.transaction.accountId
    &&
    input.knownOwnAccountIds.includes(candidate.accountId ?? '')
    && input.knownOwnAccountIds.includes(input.transaction.accountId ?? '')
    && exactTraceMentionsAccount(input.transaction, candidate.accountId ?? '')
  )
  const primaryDateGateCandidates = ownAccountAndHintCandidates.filter((candidate) =>
    calculateDayDistanceForTrace(input.transaction.bookedAt, candidate.bookedAt) <= INTERNAL_TRANSFER_PRIMARY_DAY_GATE
  )
  const extendedDateGateCandidates = ownAccountAndHintCandidates.filter((candidate) =>
    calculateDayDistanceForTrace(input.transaction.bookedAt, candidate.bookedAt) <= INTERNAL_TRANSFER_EXTENDED_DAY_GATE
  )
  const extractedRecord = input.extractedRecordsById.get(input.transaction.extractedRecordIds[0] ?? '')
  const extractedData = extractedRecord?.data as Record<string, unknown> | undefined
  const counterMovementUsesSameAccountId = input.transaction.accountId === input.counterMovement.accountId
  const counterMovementMentionsAccount = exactTraceMentionsAccount(input.transaction, input.counterMovement.accountId ?? '')
  const finalMatchedOrUnmatchedReason = input.transaction.id === input.counterMovement.id
    ? 'self'
    : counterMovementUsesSameAccountId
      ? 'rejected-by-same-account-id'
      : counterMovementMentionsAccount
      ? primaryDateGateCandidates.some((candidate) => candidate.id === input.counterMovement.id)
        ? 'matched-within-primary-date-gate'
        : extendedDateGateCandidates.some((candidate) => candidate.id === input.counterMovement.id)
          ? 'matched-within-extended-own-account-date-gate'
          : 'rejected-by-date-gate'
      : 'rejected-by-own-account-account-hint-filter'

  return {
    rawRowId: input.transaction.extractedRecordIds[0],
    normalizedTransactionId: input.transaction.id,
    movementFingerprint: buildExactMovementFingerprint(input.transaction),
    bankAccountId: input.transaction.accountId ?? '',
    direction: input.transaction.direction === 'in' ? 'in' : 'out',
    amountMinor: input.transaction.amountMinor,
    currency: input.transaction.currency,
    transactionDate: input.transaction.bookedAt,
    valueDate: readOptionalTraceDate(extractedData?.accountingDate, extractedData?.date),
    ownAccountEvidence: {
      accountRecognizedAsOwnAccount: input.knownOwnAccountIds.includes(input.transaction.accountId ?? ''),
      accountHintMatchedOnCounterMovement: counterMovementMentionsAccount,
      counterMovementRecognizedAsOwnAccount: input.knownOwnAccountIds.includes(input.counterMovement.accountId ?? '')
    },
    candidateCountBeforeFilters: input.allBankTransactions.filter((candidate) => candidate.id !== input.transaction.id).length,
    candidateCountAfterAmountFilter: sameAmountCandidates.length,
    candidateCountAfterDirectionFilter: directionAndAmountCandidates.length,
    candidateCountAfterOwnAccountAccountHintFilter: ownAccountAndHintCandidates.length,
    candidateCountAfterDateGate: primaryDateGateCandidates.length > 0
      ? primaryDateGateCandidates.length
      : extendedDateGateCandidates.length,
    candidateCountAfterPrimaryDateGate: primaryDateGateCandidates.length,
    candidateCountAfterExtendedDateGate: extendedDateGateCandidates.length,
    finalMatchedOrUnmatchedReason
  }
}

function buildExactMovementFingerprint(
  transaction: ReturnType<typeof ingestUploadedMonthlyFiles>['batch']['reconciliation']['normalizedTransactions'][number]
): string {
  return [
    transaction.direction,
    transaction.accountId ?? 'no-account',
    transaction.bookedAt,
    `${transaction.amountMinor}:${transaction.currency}`,
    transaction.reference ?? 'no-reference',
    transaction.counterparty ?? 'no-counterparty'
  ].join('|')
}

function exactTraceMentionsAccount(
  transaction: ReturnType<typeof ingestUploadedMonthlyFiles>['batch']['reconciliation']['normalizedTransactions'][number],
  accountId: string
): boolean {
  const normalizedAccountHints = buildExactTraceAccountHints(accountId)
  const comparableValues = [
    transaction.counterparty,
    transaction.counterpartyAccount,
    transaction.reference,
    transaction.accountId
  ]

  return comparableValues.some((value) => {
    const normalizedValue = String(value ?? '').toLowerCase().replace(/\s+/g, ' ')
    const digitsOnly = String(value ?? '').replace(/\D+/g, '')

    return normalizedAccountHints.some((hint) =>
      hint.length >= 6
      && (normalizedValue.includes(hint) || digitsOnly.includes(hint.replace(/\D+/g, '')))
    )
  })
}

function buildExactTraceAccountHints(accountId: string): string[] {
  const normalized = accountId.trim().toLowerCase()
  const digits = normalized.replace(/\D+/g, '')
  const [accountNumberPart, bankCodePart] = normalized.split('/')
  const accountNumberDigits = (accountNumberPart ?? '').replace(/\D+/g, '')
  const bankCodeDigits = (bankCodePart ?? '').replace(/\D+/g, '')

  return [...new Set([
    normalized,
    digits,
    accountNumberDigits,
    bankCodeDigits ? `${accountNumberDigits}${bankCodeDigits}` : undefined
  ].filter((value): value is string => Boolean(value)))]
}

function calculateDayDistanceForTrace(left: string, right: string): number {
  const leftDate = new Date(left)
  const rightDate = new Date(right)

  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return Number.POSITIVE_INFINITY
  }

  return Math.abs(rightDate.getTime() - leftDate.getTime()) / (1000 * 60 * 60 * 24)
}

function readOptionalTraceDate(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

function buildComgatePipelineDiagnostics(
  batch: IngestionBatch,
  sourceDocumentId: string | undefined,
  sourceSystem: string | undefined,
  payoutDecisionTraces: ReturnType<typeof inspectPayoutBatchBankDecisions>,
  comgateHeaderDiagnostics?: BrowserRuntimeUploadState['runtimeAudit']['fileIntakeDiagnostics'][number]['comgateHeaderDiagnostics']
): BrowserRuntimeUploadState['runtimeAudit']['fileIntakeDiagnostics'][number]['comgatePipelineDiagnostics'] {
  if ((!sourceDocumentId || sourceSystem !== 'comgate') && !comgateHeaderDiagnostics) {
    return undefined
  }

  const extractedRecords = batch.extractedRecords.filter((record) => record.sourceDocumentId === sourceDocumentId)
  const normalizedSourceDocumentId = sourceDocumentId as IngestionBatch['reconciliation']['normalizedTransactions'][number]['sourceDocumentIds'][number]

  if (extractedRecords.length === 0) {
    if (!comgateHeaderDiagnostics || comgateHeaderDiagnostics.detectedFileKind === 'unknown') {
      return undefined
    }

    return {
      parserVariants: [],
      extractedRecordCount: 0,
      extractedPaymentPurposeBreakdown: [],
      normalizedTransactionCount: 0,
      normalizedKindBreakdown: [],
      matchingInputPayoutRowCount: 0,
      payoutBatchCount: 0,
      matchingDecisionCount: 0,
      lossBoundary: 'extraction-to-normalization',
      lossStage: 'normalizer-produced-no-transactions',
      payoutBatchSummaries: []
    }
  }

  const extractedRecordIds = new Set(extractedRecords.map((record) => record.id))
  const normalizedTransactions = batch.reconciliation.normalizedTransactions.filter((transaction) =>
    transaction.sourceDocumentIds.includes(normalizedSourceDocumentId)
    || transaction.extractedRecordIds.some((recordId) => extractedRecordIds.has(recordId))
  )
  const payoutRows = (batch.reconciliation.workflowPlan?.payoutRows ?? []).filter((row) =>
    row.sourceDocumentId === sourceDocumentId
  )
  const payoutBatchKeys = [...new Set(payoutRows.map((row) => row.payoutBatchKey))]
  const payoutBatchSummaries = payoutDecisionTraces
    .filter((decision) => payoutBatchKeys.includes(decision.payoutBatchKey))
    .map((decision) => ({
      payoutBatchKey: decision.payoutBatchKey,
      payoutReference: decision.payoutReference,
      grossTotalMinor: decision.grossTotalMinor,
      feeTotalMinor: decision.feeTotalMinor,
      netSettlementTotalMinor: decision.netSettlementTotalMinor,
      expectedBankAmountMinor: decision.expectedBankAmountMinor,
      currency: decision.expectedBankCurrency,
      bankCandidateCountBeforeFiltering: decision.bankCandidateCountBeforeFiltering,
      bankCandidateCountAfterAmountCurrency: decision.bankCandidateCountAfterAmountCurrency,
      bankCandidateCountAfterDateWindow: decision.bankCandidateCountAfterDateWindow,
      bankCandidateCountAfterEvidenceFiltering: decision.bankCandidateCountAfterEvidenceFiltering,
      matched: decision.matched,
      noMatchReason: decision.noMatchReason
    }))
  const parserVariants = uniqueStrings(
    extractedRecords.map((record) => optionalString(record.data.comgateParserVariant))
  )
  const currentPortalBatchTotalsPreview = parserVariants.includes('current-portal')
    ? payoutBatchSummaries.map((summary) => ({
      payoutBatchKey: summary.payoutBatchKey,
      grossTotalMinor: summary.grossTotalMinor ?? summary.expectedBankAmountMinor,
      feeTotalMinor: summary.feeTotalMinor ?? 0,
      netSettlementTotalMinor: summary.netSettlementTotalMinor ?? summary.expectedBankAmountMinor,
      currency: summary.currency
    }))
    : undefined
  const extractedPaymentPurposeBreakdown = buildKindBreakdown(
    extractedRecords.map((record) => optionalString(record.data.paymentPurpose) ?? 'unspecified')
  )
  const normalizedKindBreakdown = buildKindBreakdown(
    normalizedTransactions.map((transaction) => {
      const subtype = optionalString(transaction.subtype)
      return subtype ? `${transaction.source}:${subtype}` : `${transaction.source}:default`
    })
  )
  const lossClassification = classifyComgatePipelineLoss(normalizedTransactions.length, payoutRows.length, payoutBatchSummaries)

  return {
    parserVariants,
    extractedRecordCount: extractedRecords.length,
    extractedPaymentPurposeBreakdown,
    normalizedTransactionCount: normalizedTransactions.length,
    normalizedKindBreakdown,
    currentPortalRawRowCount: parserVariants.includes('current-portal') ? payoutRows.length : undefined,
    currentPortalPayoutBatchCount: parserVariants.includes('current-portal') ? payoutBatchKeys.length : undefined,
    currentPortalBatchTotalsPreview,
    matchingInputPayoutRowCount: payoutRows.length,
    payoutBatchCount: payoutBatchKeys.length,
    matchingDecisionCount: payoutBatchSummaries.length,
    lossBoundary: lossClassification.lossBoundary,
    lossStage: lossClassification.lossStage,
    payoutBatchSummaries
  }
}

function buildFallbackComgateHeaderDiagnostics(
  content: string,
  existingDiagnostics?: BrowserRuntimeUploadState['runtimeAudit']['fileIntakeDiagnostics'][number]['comgateHeaderDiagnostics']
): BrowserRuntimeUploadState['runtimeAudit']['fileIntakeDiagnostics'][number]['comgateHeaderDiagnostics'] | undefined {
  if (existingDiagnostics) {
    return existingDiagnostics
  }

  const diagnostics = inspectComgateHeaderDiagnostics(content)
  return diagnostics.detectedFileKind === 'unknown' ? undefined : diagnostics
}

function classifyComgatePipelineLoss(
  normalizedTransactionCount: number,
  payoutRowCount: number,
  payoutBatchSummaries: Array<{
    bankCandidateCountBeforeFiltering: number
    bankCandidateCountAfterAmountCurrency: number
    bankCandidateCountAfterDateWindow: number
    bankCandidateCountAfterEvidenceFiltering: number
    matched: boolean
  }>
): Pick<NonNullable<BrowserRuntimeUploadState['runtimeAudit']['fileIntakeDiagnostics'][number]['comgatePipelineDiagnostics']>, 'lossBoundary' | 'lossStage'> {
  if (normalizedTransactionCount === 0) {
    return {
      lossBoundary: 'extraction-to-normalization',
      lossStage: 'normalizer-produced-no-transactions'
    }
  }

  if (payoutRowCount === 0) {
    return {
      lossBoundary: 'normalization-to-matching-input',
      lossStage: 'workflow-plan-produced-no-payout-rows'
    }
  }

  if (payoutBatchSummaries.length === 0) {
    return {
      lossBoundary: 'matching',
      lossStage: 'no-payout-batch-decisions'
    }
  }

  if (payoutBatchSummaries.every((summary) => summary.matched)) {
    return {
      lossBoundary: 'no-loss',
      lossStage: 'matched'
    }
  }

  if (payoutBatchSummaries.every((summary) => summary.bankCandidateCountBeforeFiltering === 0)) {
    return {
      lossBoundary: 'matching',
      lossStage: 'no-bank-candidates'
    }
  }

  if (payoutBatchSummaries.every((summary) => summary.bankCandidateCountAfterAmountCurrency === 0)) {
    return {
      lossBoundary: 'matching',
      lossStage: 'amount-currency-filter'
    }
  }

  if (payoutBatchSummaries.every((summary) => summary.bankCandidateCountAfterDateWindow === 0)) {
    return {
      lossBoundary: 'matching',
      lossStage: 'date-window-filter'
    }
  }

  if (payoutBatchSummaries.every((summary) => summary.bankCandidateCountAfterEvidenceFiltering === 0 || !summary.matched)) {
    return {
      lossBoundary: 'matching',
      lossStage: 'evidence-or-ambiguity-filter'
    }
  }

  return {
    lossBoundary: 'no-loss',
    lossStage: 'not-applicable'
  }
}

function buildKindBreakdown(values: string[]): Array<{ kind: string, count: number }> {
  const counts = new Map<string, number>()

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind))
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
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

  const hits = [
    ...detectInvoiceDocumentKeywordHits(file.content),
    ...detectBookingPayoutStatementKeywordHits(file.content)
  ]

  if (hits.length > 0) {
    return Array.from(new Set(hits))
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
