import type { ExtractedRecord } from '../../domain'
import type {
  DeterministicDocumentExtractionStageDebug,
  DeterministicDocumentFieldConfidence,
  DeterministicDocumentFieldProvenance,
  DeterministicDocumentOcrParsedFields,
  ReceiptParsingDebug,
  DeterministicDocumentSummaryFieldKey,
  DeterministicDocumentExtractionSummary,
  DeterministicDocumentParserInput
} from '../contracts'
import {
  normalizeDocumentDate,
  parseDocumentAmountMinor,
  parseDocumentMoney,
  parseLabeledDocumentText,
  pickRequiredField
} from './document-utils'
import {
  deriveFieldConfidence,
  extractDocumentOcrOrVisionFallback,
  resolveDocumentFinalStatus
} from './document-layered-recovery'
import {
  applyReceiptVendorProfile,
  inspectReceiptVendorCandidates,
  type ReceiptVendorProfileKey,
  type ReceiptVendorProfileResult,
  type ReceiptVendorProfileSupplementaryAmount
} from './receipt-vendor-profiles'

const FIELD_ALIASES = {
  receiptNumber: ['Receipt No', 'Receipt number', 'Číslo účtenky', 'Uctenka cislo'],
  merchant: ['Merchant', 'Store', 'Dodavatel', 'Obchod'],
  purchaseDate: ['Purchase date', 'Paid at', 'Datum nákupu', 'Datum'],
  total: ['Total', 'Amount paid', 'Celkem', 'Zaplaceno'],
  category: ['Category', 'Expense type', 'Kategorie', 'Typ nákupu'],
  note: ['Note', 'Description', 'Poznámka', 'Účel']
} satisfies Record<string, string[]>

export interface ParseReceiptDocumentInput extends DeterministicDocumentParserInput { }

export type InspectReceiptDocumentExtractionSummaryInput =
  | string
  | {
    content: string
    binaryContentBase64?: string
    ocrOrVisionFallback?: ParseReceiptDocumentInput['ocrOrVisionFallback']
  }

interface ReceiptExtractedFields {
  receiptNumber?: string
  merchant?: string
  purchaseDateRaw?: string
  totalRaw?: string
  paymentMethod?: string
  category?: string
  note?: string
  vendorProfileKey?: ReceiptVendorProfileKey
  merchantRegistrationId?: string
  merchantTaxId?: string
  vatBaseRaw?: string
  vatRaw?: string
  supplementaryAmounts?: ReceiptVendorProfileSupplementaryAmount[]
}

interface ReceiptExtractionDetails {
  fields: ReceiptExtractedFields
  fieldProvenance: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>>
  fieldConfidence: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldConfidence>>
  ocrDetected: boolean
  ocrRawPayload?: string
  ocrParsedFields?: DeterministicDocumentOcrParsedFields
  ocrRecoveredFields: DeterministicDocumentSummaryFieldKey[]
  ocrConfirmedFields: DeterministicDocumentSummaryFieldKey[]
  extractionStages: DeterministicDocumentExtractionStageDebug[]
  vendorProfileKey: ReceiptVendorProfileKey
  vendorDetectionSignals: string[]
  forcePartialRecord: boolean
  receiptParsingDebug?: ReceiptParsingDebug
}

interface ReceiptSegmentationDebug {
  scanClassified: boolean
  segmentCount: number
  splitReason?: string
}

export class ReceiptDocumentParser {
  parse(input: ParseReceiptDocumentInput): ExtractedRecord[] {
    const segmentation = splitReceiptContentIntoCandidateSegments(input.content)
    const fallbackPurchaseDate = resolveFallbackReceiptPurchaseDate(input.content, input.extractedAt)
    const extractedRecords: ExtractedRecord[] = []

    for (let index = 0; index < segmentation.segments.length; index += 1) {
      const segment = segmentation.segments[index]!
      const segmentBinaryContentBase64 = segmentation.segments.length === 1 ? input.binaryContentBase64 : undefined
      const extraction = extractReceiptDocumentFields({
        content: segment.content,
        binaryContentBase64: segmentBinaryContentBase64,
        ocrOrVisionFallback: segmentation.segments.length === 1 ? input.ocrOrVisionFallback : undefined
      })
      const merchantOverride = resolveSegmentedReceiptMerchantOverride({
        fullContent: input.content,
        segmentContent: segment.content,
        merchant: extraction.fields.merchant
      })
      if (merchantOverride) {
        extraction.fields.merchant = merchantOverride
      }
      const summary = buildReceiptDocumentExtractionSummary(
        extraction,
        segmentBinaryContentBase64,
        {
          scanClassified: segmentation.scanClassified,
          segmentCount: segmentation.segments.length,
          splitReason: segmentation.splitReason
        }
      )
      const purchaseDate = summary.paymentDate ?? (segmentation.scanClassified ? fallbackPurchaseDate : undefined)
      const canCreateCompleteRecord = Boolean(
        purchaseDate
        && typeof summary.totalAmountMinor === 'number'
        && summary.totalCurrency
      )
      const canCreatePartialRecord = shouldCreatePartialReceiptRecord({
        summary,
        extraction,
        segmentCount: segmentation.segments.length,
        hasFallbackBinaryEvidence: Boolean(segmentBinaryContentBase64?.trim())
      })

      if (summary.finalStatus === 'failed' && !canCreatePartialRecord) {
        if (segmentation.segments.length === 1) {
          throw new Error(`Receipt document is missing required fields: ${summary.missingRequiredFields.join(', ')}`)
        }
        continue
      }

      if (!canCreateCompleteRecord && !canCreatePartialRecord) {
        continue
      }

      const vatBase = safeParseDocumentMoney(extraction.fields.vatBaseRaw, 'Receipt VAT base')
      const vatAmount = safeParseDocumentMoney(extraction.fields.vatRaw, 'Receipt VAT amount')
      const isPartialRecord = !canCreateCompleteRecord

      extractedRecords.push({
        id: `receipt-record-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'receipt-document',
        extractedAt: input.extractedAt,
        ...(extraction.fields.receiptNumber ? { rawReference: extraction.fields.receiptNumber } : {}),
        ...(typeof summary.totalAmountMinor === 'number' ? { amountMinor: summary.totalAmountMinor } : {}),
        ...(summary.totalCurrency ? { currency: summary.totalCurrency } : {}),
        ...(purchaseDate ? { occurredAt: purchaseDate } : {}),
        data: {
          sourceSystem: 'receipt',
          ...(extraction.fields.vendorProfileKey ? { vendorProfile: extraction.fields.vendorProfileKey } : {}),
          ...(extraction.fields.receiptNumber ? { receiptNumber: extraction.fields.receiptNumber } : {}),
          ...(extraction.fields.merchant ? { merchant: extraction.fields.merchant } : {}),
          ...(purchaseDate ? { purchaseDate } : {}),
          ...(typeof summary.totalAmountMinor === 'number' ? { amountMinor: summary.totalAmountMinor } : {}),
          ...(summary.totalCurrency ? { currency: summary.totalCurrency } : {}),
          ...(extraction.fields.paymentMethod ? { paymentMethod: extraction.fields.paymentMethod } : {}),
          ...(extraction.fields.category ? { category: extraction.fields.category } : {}),
          ...(extraction.fields.note ? { description: extraction.fields.note } : {}),
          ...(extraction.fields.merchantRegistrationId ? { merchantRegistrationId: extraction.fields.merchantRegistrationId } : {}),
          ...(extraction.fields.merchantTaxId ? { merchantTaxId: extraction.fields.merchantTaxId } : {}),
          ...(vatBase ? { vatBaseAmountMinor: vatBase.amountMinor, vatBaseCurrency: vatBase.currency } : {}),
          ...(vatAmount ? { vatAmountMinor: vatAmount.amountMinor, vatAmountCurrency: vatAmount.currency } : {}),
          ...(extraction.fields.supplementaryAmounts && extraction.fields.supplementaryAmounts.length > 0
            ? { supplementaryAmounts: extraction.fields.supplementaryAmounts }
            : {}),
          ...(isPartialRecord
            ? {
              debug: {
                finalStatus: summary.finalStatus,
                missingRequiredFields: summary.missingRequiredFields,
                partialRecordCreated: true,
                partialRecordDropped: false,
                vendorProfile: extraction.vendorProfileKey,
                vendorDetectionSignals: extraction.vendorDetectionSignals
              }
            }
            : {}),
          ...(segmentation.scanClassified ? { scanClassified: true } : {}),
          ...(segmentation.segments.length > 1
            ? {
              scanSegmentIndex: index + 1,
              scanSegmentCount: segmentation.segments.length,
              scanSegmentationReason: segmentation.splitReason ?? 'multi-receipt-segmentation'
            }
            : {})
        }
      })
    }

    if (segmentation.scanClassified && extractedRecords.length === 2) {
      const reorderedTotals = extractTopScanReceiptTotals(input.content)

      if (reorderedTotals.length >= 2) {
        for (let index = 0; index < 2; index += 1) {
          const candidate = reorderedTotals[index]
          const record = extractedRecords[index]
          if (!candidate || !record) {
            continue
          }
          record.amountMinor = candidate.amountMinor
          record.currency = candidate.currency
          if (record.data && typeof record.data === 'object') {
            const existingData = record.data as Record<string, unknown>
            existingData.amountMinor = candidate.amountMinor
            existingData.currency = candidate.currency
          }
        }
      }
    }

    return extractedRecords
  }
}

const defaultReceiptDocumentParser = new ReceiptDocumentParser()

export function parseReceiptDocument(input: ParseReceiptDocumentInput): ExtractedRecord[] {
  return defaultReceiptDocumentParser.parse(input)
}

export function inspectReceiptDocumentExtractionSummary(
  input: InspectReceiptDocumentExtractionSummaryInput
): DeterministicDocumentExtractionSummary {
  const normalizedInput = normalizeReceiptInspectionInput(input)
  const segmentation = splitReceiptContentIntoCandidateSegments(normalizedInput.content)
  const extraction = extractReceiptDocumentFields({
    content: segmentation.segments[0]?.content ?? normalizedInput.content,
    binaryContentBase64: segmentation.segments.length === 1 ? normalizedInput.binaryContentBase64 : undefined,
    ocrOrVisionFallback: segmentation.segments.length === 1 ? normalizedInput.ocrOrVisionFallback : undefined
  })

  return buildReceiptDocumentExtractionSummary(
    extraction,
    segmentation.segments.length === 1 ? normalizedInput.binaryContentBase64 : undefined,
    {
      scanClassified: segmentation.scanClassified,
      segmentCount: segmentation.segments.length,
      splitReason: segmentation.splitReason
    }
  )
}

function normalizeReceiptInspectionInput(
  input: InspectReceiptDocumentExtractionSummaryInput
): { content: string; binaryContentBase64?: string; ocrOrVisionFallback?: ParseReceiptDocumentInput['ocrOrVisionFallback'] } {
  return typeof input === 'string'
    ? { content: input }
    : input
}

function buildReceiptDocumentExtractionSummary(
  extraction: ReceiptExtractionDetails,
  binaryContentBase64?: string,
  segmentationDebug?: ReceiptSegmentationDebug
): DeterministicDocumentExtractionSummary {
  const extracted = extraction.fields
  const purchaseDate = safeNormalizeDocumentDate(extracted.purchaseDateRaw, 'Receipt purchase date')
  const total = safeParseDocumentMoney(extracted.totalRaw, 'Receipt total')
  const vatBase = safeParseDocumentMoney(extracted.vatBaseRaw, 'Receipt VAT base')
  const vatAmount = safeParseDocumentMoney(extracted.vatRaw, 'Receipt VAT amount')
  const missingRequiredFields = collectMissingReceiptSummaryFields(extracted)
  const hasMeaningfulFields = Boolean(
    extracted.receiptNumber
    || extracted.merchant
    || extracted.purchaseDateRaw
    || extracted.totalRaw
    || extracted.paymentMethod
    || extracted.category
    || extracted.note
  )
  const finalStatus = resolveDocumentFinalStatus({
    missingRequiredFields,
    hasMeaningfulFields,
    hasFallbackBinaryEvidence: Boolean(binaryContentBase64?.trim())
  })
  const confidence = finalStatus === 'parsed'
    ? 'strong'
    : finalStatus === 'needs_review'
      ? 'hint'
      : 'none'
  const extractionStages = [
    ...extraction.extractionStages,
    {
      stage: 'validation_and_confidence' as const,
      outcome: 'applied' as const,
      notes: [
        ...(segmentationDebug?.scanClassified ? ['scanClassified=true'] : []),
        ...(segmentationDebug && segmentationDebug.segmentCount > 1
          ? [`segmentedDocuments=${segmentationDebug.segmentCount}`, `segmentationReason=${segmentationDebug.splitReason ?? 'multi-receipt-segmentation'}`]
          : []),
        `finalStatus=${finalStatus}`,
        `requiredFieldsCheck=${missingRequiredFields.length === 0 ? 'passed' : 'failed'}`,
        `missing=${missingRequiredFields.length > 0 ? missingRequiredFields.join(',') : 'none'}`
      ]
    }
  ]

  return {
    documentKind: 'receipt',
    sourceSystem: 'receipt',
    documentType: 'receipt',
    ...(extracted.merchant ? { issuerOrCounterparty: extracted.merchant } : {}),
    ...(purchaseDate ? { paymentDate: purchaseDate } : {}),
    ...(total ? { totalAmountMinor: total.amountMinor, totalCurrency: total.currency } : {}),
    ...(vatBase ? { vatBaseAmountMinor: vatBase.amountMinor, vatBaseCurrency: vatBase.currency } : {}),
    ...(vatAmount ? { vatAmountMinor: vatAmount.amountMinor, vatCurrency: vatAmount.currency } : {}),
    ...(extracted.paymentMethod ? { paymentMethod: extracted.paymentMethod } : {}),
    ...(extracted.receiptNumber ? { referenceNumber: extracted.receiptNumber } : {}),
    confidence,
    finalStatus,
    requiredFieldsCheck: missingRequiredFields.length === 0 ? 'passed' : 'failed',
    missingRequiredFields,
    qrDetected: false,
    ocrDetected: extraction.ocrDetected,
    ...(extraction.ocrRawPayload ? { ocrRawPayload: extraction.ocrRawPayload } : {}),
    ...(extraction.ocrParsedFields ? { ocrParsedFields: extraction.ocrParsedFields } : {}),
    ...(Object.keys(extraction.fieldProvenance).length > 0 ? { fieldProvenance: extraction.fieldProvenance } : {}),
    ...(Object.keys(extraction.fieldConfidence).length > 0 ? { fieldConfidence: extraction.fieldConfidence } : {}),
    ...(extraction.ocrRecoveredFields.length > 0 ? { ocrRecoveredFields: extraction.ocrRecoveredFields } : {}),
    ...(extraction.ocrConfirmedFields.length > 0 ? { ocrConfirmedFields: extraction.ocrConfirmedFields } : {}),
    ...(extractionStages.length > 0 ? { extractionStages } : {}),
    ...(extraction.receiptParsingDebug ? { receiptParsingDebug: extraction.receiptParsingDebug } : {})
  }
}

function extractReceiptDocumentFields(input: {
  content: string
  binaryContentBase64?: string
  ocrOrVisionFallback?: ParseReceiptDocumentInput['ocrOrVisionFallback']
}): ReceiptExtractionDetails {
  const fields = parseLabeledDocumentText(input.content)
  const labeledTextFields: ReceiptExtractedFields = {
    receiptNumber: pickRequiredField(fields, FIELD_ALIASES.receiptNumber),
    merchant: pickRequiredField(fields, FIELD_ALIASES.merchant),
    purchaseDateRaw: pickRequiredField(fields, FIELD_ALIASES.purchaseDate),
    totalRaw: pickRequiredField(fields, FIELD_ALIASES.total),
    category: pickRequiredField(fields, FIELD_ALIASES.category),
    note: pickRequiredField(fields, FIELD_ALIASES.note) ?? pickRequiredField(fields, FIELD_ALIASES.category)
  }
  const scanHeuristicFields = extractScanLikeReceiptHeuristicFields(input.content)
  const textFields: ReceiptExtractedFields = {
    receiptNumber: labeledTextFields.receiptNumber ?? scanHeuristicFields.receiptNumber,
    merchant: labeledTextFields.merchant ?? scanHeuristicFields.merchant,
    purchaseDateRaw: labeledTextFields.purchaseDateRaw ?? scanHeuristicFields.purchaseDateRaw,
    totalRaw: labeledTextFields.totalRaw ?? scanHeuristicFields.totalRaw,
    paymentMethod: scanHeuristicFields.paymentMethod,
    category: labeledTextFields.category ?? scanHeuristicFields.category,
    note: labeledTextFields.note ?? scanHeuristicFields.note,
    vatBaseRaw: scanHeuristicFields.vatBaseRaw,
    vatRaw: scanHeuristicFields.vatRaw
  }
  const fieldProvenance: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>> = {}

  if (labeledTextFields.receiptNumber?.trim()) {
    fieldProvenance.referenceNumber = 'text'
  } else if (scanHeuristicFields.receiptNumber?.trim()) {
    fieldProvenance.referenceNumber = 'inferred'
  }
  if (labeledTextFields.merchant?.trim()) {
    fieldProvenance.issuerOrCounterparty = 'text'
  } else if (scanHeuristicFields.merchant?.trim()) {
    fieldProvenance.issuerOrCounterparty = 'inferred'
  }
  if (labeledTextFields.purchaseDateRaw?.trim()) {
    fieldProvenance.paymentDate = 'text'
  } else if (scanHeuristicFields.purchaseDateRaw?.trim()) {
    fieldProvenance.paymentDate = 'inferred'
  }
  if (labeledTextFields.totalRaw?.trim()) {
    fieldProvenance.totalAmount = 'text'
  } else if (scanHeuristicFields.totalRaw?.trim()) {
    fieldProvenance.totalAmount = 'inferred'
  }
  if (textFields.paymentMethod?.trim()) {
    fieldProvenance.paymentMethod = scanHeuristicFields.paymentMethod?.trim() ? 'inferred' : 'text'
  }
  if (scanHeuristicFields.vatBaseRaw?.trim()) {
    fieldProvenance.vatBaseAmount = 'inferred'
  }
  if (scanHeuristicFields.vatRaw?.trim()) {
    fieldProvenance.vatAmount = 'inferred'
  }

  const ocrExtraction = extractDocumentOcrOrVisionFallback({
    content: input.content,
    binaryContentBase64: input.binaryContentBase64,
    documentKind: 'receipt',
    prefetchedFallback: input.ocrOrVisionFallback
  })
  const ocrRawTextHeuristicFields = extractReceiptOcrRawTextFallbackFields(ocrExtraction.parsedFields?.rawText)
  const merged = mergeReceiptTextAndOcrFields(textFields, fieldProvenance, ocrExtraction, ocrRawTextHeuristicFields)
  const trustedOcrRawText = ocrExtraction.parsedFields?.rawText && shouldTrustReceiptOcrRawTextForGenericTotal(ocrExtraction.parsedFields.rawText)
    ? ocrExtraction.parsedFields.rawText
    : undefined
  const receiptEvidenceContent = input.content.trim().length > 0
    ? input.content
    : trustedOcrRawText ?? ''
  const vendorProfile = applyReceiptVendorProfile({
    content: receiptEvidenceContent,
    currentFields: merged.fields,
    ocrParsedFields: ocrExtraction.parsedFields
  })
  const vendorMergedFields = applyReceiptVatRecapFallback(
    applyReceiptVendorOverrides(merged.fields, vendorProfile),
    receiptEvidenceContent
  )
  const vendorFieldProvenance = { ...merged.fieldProvenance }

  if (vendorProfile?.merchant) {
    vendorFieldProvenance.issuerOrCounterparty = vendorFieldProvenance.issuerOrCounterparty ?? 'inferred'
  }
  if (vendorProfile?.purchaseDateRaw) {
    vendorFieldProvenance.paymentDate = vendorFieldProvenance.paymentDate ?? 'inferred'
  }
  if (vendorProfile?.totalRaw) {
    vendorFieldProvenance.totalAmount = vendorFieldProvenance.totalAmount ?? 'inferred'
  }
  if (vendorProfile?.paymentMethod) {
    vendorFieldProvenance.paymentMethod = vendorFieldProvenance.paymentMethod ?? 'inferred'
  }
  if (vendorProfile?.receiptNumber) {
    vendorFieldProvenance.referenceNumber = vendorFieldProvenance.referenceNumber ?? 'inferred'
  }
  if (vendorMergedFields.vatBaseRaw && !merged.fields.vatBaseRaw && !vendorProfile?.vatBaseRaw) {
    vendorFieldProvenance.vatBaseAmount = vendorFieldProvenance.vatBaseAmount ?? 'inferred'
  }
  if (vendorMergedFields.vatRaw && !merged.fields.vatRaw && !vendorProfile?.vatRaw) {
    vendorFieldProvenance.vatAmount = vendorFieldProvenance.vatAmount ?? 'inferred'
  }

  return {
    fields: vendorMergedFields,
    fieldProvenance: vendorFieldProvenance,
    fieldConfidence: buildReceiptFieldConfidenceMap(vendorMergedFields, vendorFieldProvenance),
    ocrDetected: ocrExtraction.detected,
    ocrRawPayload: ocrExtraction.rawPayload,
    ocrParsedFields: ocrExtraction.parsedFields,
    ocrRecoveredFields: merged.ocrRecoveredFields,
    ocrConfirmedFields: merged.ocrConfirmedFields,
    extractionStages: buildReceiptExtractionStages({
      textFields,
      ocrExtraction,
      ocrRecoveredFields: merged.ocrRecoveredFields,
      ocrConfirmedFields: merged.ocrConfirmedFields,
      scanHeuristicApplied: Boolean(
        scanHeuristicFields.receiptNumber
        || scanHeuristicFields.merchant
        || scanHeuristicFields.purchaseDateRaw
        || scanHeuristicFields.totalRaw
      ),
      vendorProfileKey: vendorProfile?.key,
      vendorDetectionSignals: vendorProfile?.detectionSignals
    }),
    vendorProfileKey: vendorProfile?.key ?? 'generic',
    vendorDetectionSignals: vendorProfile?.detectionSignals ?? [],
    forcePartialRecord: Boolean(vendorProfile?.forcePartialRecord),
    receiptParsingDebug: buildReceiptParsingDebug({
      content: input.content.trim().length > 0
        ? input.content
        : ocrExtraction.parsedFields?.rawText ?? '',
      genericFields: merged.fields,
      finalFields: vendorMergedFields,
      vendorProfile,
      vendorProfileKey: vendorProfile?.key ?? 'generic'
    })
  }
}

function applyReceiptVendorOverrides(
  fields: ReceiptExtractedFields,
  vendorProfile: ReceiptVendorProfileResult | undefined
): ReceiptExtractedFields {
  const mergedFields: ReceiptExtractedFields = {
    ...fields,
    ...(vendorProfile?.merchant ? { merchant: vendorProfile.merchant } : {}),
    ...(vendorProfile?.purchaseDateRaw ? { purchaseDateRaw: vendorProfile.purchaseDateRaw } : {}),
    ...(vendorProfile?.totalRaw ? { totalRaw: vendorProfile.totalRaw } : {}),
    ...(vendorProfile?.paymentMethod ? { paymentMethod: vendorProfile.paymentMethod } : {}),
    ...(vendorProfile?.receiptNumber ? { receiptNumber: vendorProfile.receiptNumber } : {}),
    ...(vendorProfile?.category ? { category: vendorProfile.category } : {}),
    ...(vendorProfile?.note ? { note: vendorProfile.note } : {}),
    ...(vendorProfile?.merchantRegistrationId ? { merchantRegistrationId: vendorProfile.merchantRegistrationId } : {}),
    ...(vendorProfile?.merchantTaxId ? { merchantTaxId: vendorProfile.merchantTaxId } : {}),
    ...(vendorProfile?.vatBaseRaw ? { vatBaseRaw: vendorProfile.vatBaseRaw } : {}),
    ...(vendorProfile?.vatRaw ? { vatRaw: vendorProfile.vatRaw } : {}),
    ...(vendorProfile?.supplementaryAmounts ? { supplementaryAmounts: vendorProfile.supplementaryAmounts } : {}),
    ...(vendorProfile ? { vendorProfileKey: vendorProfile.key } : {})
  }

  if (vendorProfile?.suppressGenericTotalRaw && !vendorProfile.totalRaw) {
    delete mergedFields.totalRaw
  }

  return mergedFields
}

function buildReceiptParsingDebug(input: {
  content: string
  genericFields: ReceiptExtractedFields
  finalFields: ReceiptExtractedFields
  vendorProfile: ReceiptVendorProfileResult | undefined
  vendorProfileKey: ReceiptVendorProfileKey
}): ReceiptParsingDebug {
  const vendorInspection = inspectReceiptVendorCandidates({
    content: input.content,
    vendorProfileKey: input.vendorProfileKey
  })
  const anchoredFinalTotalCandidate = vendorInspection.anchoredAmountCandidates[0]
  const genericAmountKey = normalizeComparableReceiptMoney(input.genericFields.totalRaw)
  const vendorAmountKey = normalizeComparableReceiptMoney(input.vendorProfile?.totalRaw)
  const finalAmountKey = normalizeComparableReceiptMoney(input.finalFields.totalRaw)
  const anchoredAmountKey = normalizeComparableReceiptMoney(anchoredFinalTotalCandidate?.raw)
  const genericDateKey = normalizeComparableReceiptDate(input.genericFields.purchaseDateRaw)
  const vendorDateKey = normalizeComparableReceiptDate(input.vendorProfile?.purchaseDateRaw)
  const finalDateKey = normalizeComparableReceiptDate(input.finalFields.purchaseDateRaw)
  const anchoredDateKey = normalizeComparableReceiptDate(vendorInspection.anchoredTimestampDateRaw)
  const anchoredFinalTotalMatched = Boolean(anchoredAmountKey && vendorAmountKey && anchoredAmountKey === vendorAmountKey)
  const anchoredFinalTotalOverwritten = Boolean(anchoredAmountKey && finalAmountKey && anchoredAmountKey !== finalAmountKey)
  const anchoredFinalTotalHadCandidates = vendorInspection.anchoredAmountCandidates.length > 0
  const anchoredFinalTotalRejected = anchoredFinalTotalHadCandidates && !anchoredFinalTotalMatched

  return {
    normalizedLines: vendorInspection.normalizedLines,
    reconstructedReceiptLines: vendorInspection.reconstructedReceiptLines,
    reconstructedFooterLines: vendorInspection.reconstructedFooterLines,
    footerWindowLines: vendorInspection.footerWindowLines,
    vendorProfileSelected: input.vendorProfileKey,
    amountCandidates: vendorInspection.amountCandidates,
    anchoredAmountCandidates: vendorInspection.anchoredAmountCandidates,
    anchoredSearchInputSource: vendorInspection.anchoredSearchInputSource,
    anchoredCandidateCountBeforeReconstruction: vendorInspection.anchoredCandidateCountBeforeReconstruction,
    anchoredCandidateCountAfterReconstruction: vendorInspection.anchoredCandidateCountAfterReconstruction,
    footerAnchorMatched: vendorInspection.footerAnchorMatched,
    finalTotalCandidateScope: vendorInspection.finalTotalCandidateScope,
    footerAmountCandidatesRaw: vendorInspection.footerAmountCandidatesRaw,
    footerAmountCandidatesNormalized: vendorInspection.footerAmountCandidatesNormalized,
    ...(vendorInspection.footerAmountWinnerRaw ? { footerAmountWinnerRaw: vendorInspection.footerAmountWinnerRaw } : {}),
    footerAmountWinnerReason: vendorInspection.footerAmountWinnerReason,
    footerAnchorRejectedLines: vendorInspection.footerAnchorRejectedLines,
    footerNormalizationSteps: vendorInspection.footerNormalizationSteps,
    rejectedHighScoreBodyCandidates: vendorInspection.rejectedHighScoreBodyCandidates,
    reconstructedAmountTokens: vendorInspection.reconstructedAmountTokens,
    ...(input.genericFields.totalRaw ? { genericInferredTotalRaw: input.genericFields.totalRaw } : {}),
    ...(input.vendorProfile?.totalRaw ? { vendorSelectedTotalRaw: input.vendorProfile.totalRaw } : {}),
    ...(input.finalFields.totalRaw ? { finalTotalRaw: input.finalFields.totalRaw } : {}),
    ...(input.genericFields.purchaseDateRaw ? { genericInferredDateRaw: input.genericFields.purchaseDateRaw } : {}),
    ...(input.vendorProfile?.purchaseDateRaw ? { vendorSelectedDateRaw: input.vendorProfile.purchaseDateRaw } : {}),
    ...(input.finalFields.purchaseDateRaw ? { finalDateRaw: input.finalFields.purchaseDateRaw } : {}),
    winningAmountSource: resolveReceiptWinningAmountSource({
      vendorProfileKey: input.vendorProfileKey,
      genericAmountKey,
      vendorAmountKey,
      finalAmountKey,
      anchoredAmountKey
    }),
    winningDateSource: resolveReceiptWinningDateSource({
      vendorProfileKey: input.vendorProfileKey,
      genericDateKey,
      vendorDateKey,
      finalDateKey,
      anchoredDateKey
    }),
    anchoredFinalTotalMatched,
    anchoredFinalTotalHadCandidates,
    anchoredFinalTotalRejected,
    anchoredFinalTotalOverwritten,
    anchoredFinalTotalReason: resolveAnchoredFinalTotalReason({
      vendorProfileKey: input.vendorProfileKey,
      hadAnchoredCandidates: anchoredFinalTotalHadCandidates,
      vendorSelectedTotalRaw: input.vendorProfile?.totalRaw,
      anchoredFinalTotalMatched,
      anchoredFinalTotalOverwritten
    })
  }
}

function resolveReceiptWinningAmountSource(input: {
  vendorProfileKey: ReceiptVendorProfileKey
  genericAmountKey?: string
  vendorAmountKey?: string
  finalAmountKey?: string
  anchoredAmountKey?: string
}): string {
  if (!input.finalAmountKey) {
    return 'no-total-selected'
  }

  if (input.anchoredAmountKey && input.finalAmountKey === input.anchoredAmountKey) {
    return 'vendor-profile-anchored-final-total'
  }

  if (input.vendorAmountKey && input.finalAmountKey === input.vendorAmountKey) {
    return input.vendorProfileKey === 'generic'
      ? 'generic-vendor-profile-total'
      : 'vendor-profile-ranked-total'
  }

  if (input.genericAmountKey && input.finalAmountKey === input.genericAmountKey) {
    return 'generic-text-ocr-total'
  }

  return 'unclassified-total-source'
}

function resolveReceiptWinningDateSource(input: {
  vendorProfileKey: ReceiptVendorProfileKey
  genericDateKey?: string
  vendorDateKey?: string
  finalDateKey?: string
  anchoredDateKey?: string
}): string {
  if (!input.finalDateKey) {
    return 'no-date-selected'
  }

  if (input.anchoredDateKey && input.finalDateKey === input.anchoredDateKey) {
    return 'vendor-profile-anchored-timestamp-date'
  }

  if (input.vendorDateKey && input.finalDateKey === input.vendorDateKey) {
    return input.vendorProfileKey === 'generic'
      ? 'generic-vendor-profile-date'
      : 'vendor-profile-date'
  }

  if (input.genericDateKey && input.finalDateKey === input.genericDateKey) {
    return 'generic-text-ocr-date'
  }

  return 'unclassified-date-source'
}

function resolveAnchoredFinalTotalReason(input: {
  vendorProfileKey: ReceiptVendorProfileKey
  hadAnchoredCandidates: boolean
  vendorSelectedTotalRaw?: string
  anchoredFinalTotalMatched: boolean
  anchoredFinalTotalOverwritten: boolean
}): string {
  if (input.vendorProfileKey === 'generic') {
    return 'no-vendor-profile'
  }

  if (!input.hadAnchoredCandidates) {
    return 'no-anchored-final-total-candidates'
  }

  if (!input.vendorSelectedTotalRaw) {
    return 'vendor-profile-returned-no-total'
  }

  if (input.anchoredFinalTotalOverwritten) {
    return 'anchored-final-total-overwritten-after-vendor-merge'
  }

  if (!input.anchoredFinalTotalMatched) {
    return `vendor-profile-selected-different-total:${input.vendorSelectedTotalRaw}`
  }

  return 'anchored-final-total-selected'
}

function mergeReceiptTextAndOcrFields(
  textFields: ReceiptExtractedFields,
  baseFieldProvenance: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>>,
  ocrExtraction: ReturnType<typeof extractDocumentOcrOrVisionFallback>,
  ocrRawTextHeuristicFields: Partial<ReceiptExtractedFields>
): {
  fields: ReceiptExtractedFields
  fieldProvenance: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>>
  ocrRecoveredFields: DeterministicDocumentSummaryFieldKey[]
  ocrConfirmedFields: DeterministicDocumentSummaryFieldKey[]
} {
  const mergedFields: ReceiptExtractedFields = { ...textFields }
  const fieldProvenance = { ...baseFieldProvenance }
  const ocrRecoveredFields: DeterministicDocumentSummaryFieldKey[] = []
  const ocrConfirmedFields: DeterministicDocumentSummaryFieldKey[] = []
  const fallbackProvenance = ocrExtraction.adapter === 'vision' ? 'vision' : 'ocr'

  mergeReceiptFallbackField({
    fieldKey: 'referenceNumber',
    currentValue: mergedFields.receiptNumber,
    fallbackValue: ocrExtraction.parsedFields?.referenceNumber ?? ocrRawTextHeuristicFields.receiptNumber,
    normalizeValue: normalizeReceiptReferenceValue,
    assign(value) {
      mergedFields.receiptNumber = value
    },
    fallbackProvenance,
    fieldProvenance,
    recoveredFields: ocrRecoveredFields,
    confirmedFields: ocrConfirmedFields
  })

  mergeReceiptFallbackField({
    fieldKey: 'issuerOrCounterparty',
    currentValue: mergedFields.merchant,
    fallbackValue: ocrExtraction.parsedFields?.issuerOrCounterparty ?? ocrRawTextHeuristicFields.merchant,
    normalizeValue: normalizeComparableReceiptText,
    assign(value) {
      mergedFields.merchant = value
    },
    fallbackProvenance,
    fieldProvenance,
    recoveredFields: ocrRecoveredFields,
    confirmedFields: ocrConfirmedFields
  })

  mergeReceiptFallbackField({
    fieldKey: 'paymentDate',
    currentValue: mergedFields.purchaseDateRaw,
    fallbackValue: ocrExtraction.parsedFields?.paymentDate
      ?? ocrExtraction.parsedFields?.issueDate
      ?? ocrRawTextHeuristicFields.purchaseDateRaw,
    normalizeValue: normalizeComparableReceiptDate,
    assign(value) {
      mergedFields.purchaseDateRaw = value
    },
    fallbackProvenance,
    fieldProvenance,
    recoveredFields: ocrRecoveredFields,
    confirmedFields: ocrConfirmedFields
  })

  mergeReceiptFallbackField({
    fieldKey: 'totalAmount',
    currentValue: mergedFields.totalRaw,
    fallbackValue: ocrExtraction.parsedFields?.totalAmount ?? ocrRawTextHeuristicFields.totalRaw,
    normalizeValue: normalizeComparableReceiptMoney,
    assign(value) {
      mergedFields.totalRaw = value
    },
    fallbackProvenance,
    fieldProvenance,
    recoveredFields: ocrRecoveredFields,
    confirmedFields: ocrConfirmedFields
  })

  mergeReceiptFallbackField({
    fieldKey: 'vatBaseAmount',
    currentValue: mergedFields.vatBaseRaw,
    fallbackValue: ocrExtraction.parsedFields?.vatBaseAmount ?? ocrRawTextHeuristicFields.vatBaseRaw,
    normalizeValue: normalizeComparableReceiptMoney,
    assign(value) {
      mergedFields.vatBaseRaw = value
    },
    fallbackProvenance,
    fieldProvenance,
    recoveredFields: ocrRecoveredFields,
    confirmedFields: ocrConfirmedFields
  })

  mergeReceiptFallbackField({
    fieldKey: 'vatAmount',
    currentValue: mergedFields.vatRaw,
    fallbackValue: ocrExtraction.parsedFields?.vatAmount ?? ocrRawTextHeuristicFields.vatRaw,
    normalizeValue: normalizeComparableReceiptMoney,
    assign(value) {
      mergedFields.vatRaw = value
    },
    fallbackProvenance,
    fieldProvenance,
    recoveredFields: ocrRecoveredFields,
    confirmedFields: ocrConfirmedFields
  })

  if (!mergedFields.note?.trim() && ocrExtraction.parsedFields?.note?.trim()) {
    mergedFields.note = ocrExtraction.parsedFields.note
  }

  if (!mergedFields.category?.trim() && ocrExtraction.parsedFields?.category?.trim()) {
    mergedFields.category = ocrExtraction.parsedFields.category
  }

  if (!mergedFields.paymentMethod?.trim() && ocrExtraction.parsedFields?.paymentMethod?.trim()) {
    mergedFields.paymentMethod = ocrExtraction.parsedFields.paymentMethod
    fieldProvenance.paymentMethod = fallbackProvenance
  } else if (!mergedFields.paymentMethod?.trim() && ocrRawTextHeuristicFields.paymentMethod?.trim()) {
    mergedFields.paymentMethod = ocrRawTextHeuristicFields.paymentMethod
    fieldProvenance.paymentMethod = fallbackProvenance
  }

  return {
    fields: mergedFields,
    fieldProvenance,
    ocrRecoveredFields,
    ocrConfirmedFields
  }
}

function extractReceiptOcrRawTextFallbackFields(rawText: string | undefined): Partial<ReceiptExtractedFields> {
  if (!rawText?.trim()) {
    return {}
  }

  const extracted = extractScanLikeReceiptHeuristicFields(rawText)

  if (!shouldTrustReceiptOcrRawTextForGenericTotal(rawText)) {
    delete extracted.totalRaw
  }

  return extracted
}

function shouldTrustReceiptOcrRawTextForGenericTotal(rawText: string): boolean {
  const normalized = normalizeReceiptScanStructuredContent(rawText).trim()

  if (!normalized) {
    return false
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(rawText)) {
    return false
  }

  const lines = normalized
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return false
  }

  const merchant = extractReceiptMerchantFromLines(lines)
  const purchaseDateRaw = extractReceiptDateFromLines(lines)
  const receiptNumber = extractReceiptReferenceFromLines(lines)
  const paymentMethod = extractReceiptPaymentMethod(lines)
  const hasAmount = /\d{1,6}(?:[ .]\d{3})*[.,]\d{2}\b/.test(normalized)
  const hasCurrency = /\b(czk|kč|eur|usd)\b/i.test(normalized)
  const hasTotalMarker = lines.some((line) => /\b(total|celkem|zaplaceno|částka|castka|k\s+platb[eě]|uhrazeno|prodej)\b/i.test(line))
  const printable = normalized.replace(/\s+/g, '')
  const suspiciousCharacters = printable.match(/[^\p{L}\p{N}.,:;+\-\/()&%@#*]/gu) ?? []
  const suspiciousRatio = printable.length > 0
    ? suspiciousCharacters.length / printable.length
    : 1

  return Boolean(
    suspiciousRatio <= 0.12
    && merchant
    && hasAmount
    && (purchaseDateRaw || receiptNumber)
    && (hasTotalMarker || paymentMethod || hasCurrency)
  )
}

function mergeReceiptFallbackField(input: {
  fieldKey: DeterministicDocumentSummaryFieldKey
  currentValue?: string
  fallbackValue?: string
  normalizeValue: (value: string | undefined) => string | undefined
  assign: (value: string | undefined) => void
  fallbackProvenance: DeterministicDocumentFieldProvenance
  fieldProvenance: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>>
  recoveredFields: DeterministicDocumentSummaryFieldKey[]
  confirmedFields: DeterministicDocumentSummaryFieldKey[]
}): void {
  const normalizedCurrent = input.normalizeValue(input.currentValue)
  const normalizedFallback = input.normalizeValue(input.fallbackValue)

  if (normalizedCurrent && normalizedFallback && normalizedCurrent === normalizedFallback) {
    if (!input.confirmedFields.includes(input.fieldKey)) {
      input.confirmedFields.push(input.fieldKey)
    }
    return
  }

  if (normalizedCurrent) {
    return
  }

  if (normalizedFallback) {
    input.assign(input.fallbackValue)
    input.fieldProvenance[input.fieldKey] = input.fallbackProvenance
    if (!input.recoveredFields.includes(input.fieldKey)) {
      input.recoveredFields.push(input.fieldKey)
    }
  }
}

function buildReceiptFieldConfidenceMap(
  fields: ReceiptExtractedFields,
  fieldProvenance: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>>
): Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldConfidence>> {
  return Object.fromEntries(
    ([
      ['referenceNumber', fields.receiptNumber],
      ['issuerOrCounterparty', fields.merchant],
      ['paymentDate', fields.purchaseDateRaw],
      ['totalAmount', fields.totalRaw],
      ['vatBaseAmount', fields.vatBaseRaw],
      ['vatAmount', fields.vatRaw],
      ['paymentMethod', fields.paymentMethod]
    ] as Array<[DeterministicDocumentSummaryFieldKey, string | undefined]>)
      .map(([fieldKey, value]) => [fieldKey, deriveFieldConfidence(fieldProvenance[fieldKey], Boolean(value?.trim()))])
      .filter((entry) => entry[1] !== 'none')
  ) as Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldConfidence>>
}

function buildReceiptExtractionStages(input: {
  textFields: ReceiptExtractedFields
  ocrExtraction: ReturnType<typeof extractDocumentOcrOrVisionFallback>
  ocrRecoveredFields: DeterministicDocumentSummaryFieldKey[]
  ocrConfirmedFields: DeterministicDocumentSummaryFieldKey[]
  scanHeuristicApplied?: boolean
  vendorProfileKey?: ReceiptVendorProfileKey
  vendorDetectionSignals?: string[]
}): DeterministicDocumentExtractionStageDebug[] {
  const textRecoveredFields: DeterministicDocumentSummaryFieldKey[] = []

  if (input.textFields.receiptNumber?.trim()) {
    textRecoveredFields.push('referenceNumber')
  }
  if (input.textFields.merchant?.trim()) {
    textRecoveredFields.push('issuerOrCounterparty')
  }
  if (input.textFields.purchaseDateRaw?.trim()) {
    textRecoveredFields.push('paymentDate')
  }
  if (input.textFields.totalRaw?.trim()) {
    textRecoveredFields.push('totalAmount')
  }
  if (input.textFields.vatBaseRaw?.trim()) {
    textRecoveredFields.push('vatBaseAmount')
  }
  if (input.textFields.vatRaw?.trim()) {
    textRecoveredFields.push('vatAmount')
  }
  if (input.textFields.paymentMethod?.trim()) {
    textRecoveredFields.push('paymentMethod')
  }

  return [
    {
      stage: 'text_layer_parse',
      outcome: textRecoveredFields.length > 0 ? 'applied' : 'skipped',
      adapter: 'text',
      recoveredFields: textRecoveredFields,
      notes: textRecoveredFields.length > 0
        ? [
          ...(input.scanHeuristicApplied ? ['scan-heuristic-fields-applied'] : []),
          ...(input.vendorProfileKey && input.vendorProfileKey !== 'generic' ? [`vendor-profile=${input.vendorProfileKey}`] : []),
          ...(input.vendorDetectionSignals && input.vendorDetectionSignals.length > 0
            ? [`vendor-signals=${input.vendorDetectionSignals.join('|')}`]
            : [])
        ]
        : ['no text-layer fields recovered']
    },
    {
      stage: 'qr_or_spd_fallback',
      outcome: 'not_available',
      adapter: 'qr',
      notes: ['receipt QR/SPD fallback not detected']
    },
    {
      stage: 'ocr_or_vision_fallback',
      outcome: input.ocrExtraction.detected ? 'applied' : 'not_available',
      adapter: input.ocrExtraction.adapter ?? 'ocr',
      recoveredFields: input.ocrRecoveredFields,
      confirmedFields: input.ocrConfirmedFields,
      notes: input.ocrExtraction.detected
        ? [input.ocrExtraction.rawPayload ?? 'ocr payload detected']
        : ['no ocr/vision fallback payload detected']
    }
  ]
}

function collectMissingReceiptSummaryFields(extracted: ReceiptExtractedFields): string[] {
  const missing: string[] = []

  if (!normalizeReceiptReferenceValue(extracted.receiptNumber)) {
    missing.push('referenceNumber')
  }

  if (!extracted.merchant?.trim()) {
    missing.push('issuerOrCounterparty')
  }

  if (!safeNormalizeDocumentDate(extracted.purchaseDateRaw, 'Receipt purchase date')) {
    missing.push('paymentDate')
  }

  if (!safeParseDocumentMoney(extracted.totalRaw, 'Receipt total')) {
    missing.push('totalAmount')
  }

  return missing
}

function shouldCreatePartialReceiptRecord(input: {
  summary: DeterministicDocumentExtractionSummary
  extraction: ReceiptExtractionDetails
  segmentCount: number
  hasFallbackBinaryEvidence: boolean
}): boolean {
  if (input.summary.finalStatus === 'failed') {
    return false
  }

  if (input.extraction.forcePartialRecord) {
    return true
  }

  if (input.segmentCount > 1) {
    return false
  }

  return Boolean(
    input.hasFallbackBinaryEvidence
    || input.extraction.fields.receiptNumber
    || input.extraction.fields.merchant
    || input.extraction.fields.purchaseDateRaw
    || input.extraction.fields.totalRaw
    || input.extraction.fields.paymentMethod
    || input.extraction.fields.category
    || input.extraction.fields.note
    || input.extraction.fields.vendorProfileKey && input.extraction.fields.vendorProfileKey !== 'generic'
  )
}

function normalizeReceiptReferenceValue(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined
  }

  const normalized = value.trim()

  if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/.test(normalized)) {
    return undefined
  }

  return normalized
}

function normalizeComparableReceiptText(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined
  }

  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeComparableReceiptDate(value: string | undefined): string | undefined {
  return safeNormalizeDocumentDate(value, 'Receipt comparable date')
}

function normalizeComparableReceiptMoney(value: string | undefined): string | undefined {
  const money = safeParseDocumentMoney(value, 'Receipt comparable amount')
  return money ? `${money.amountMinor}:${money.currency}` : undefined
}

function splitReceiptContentIntoCandidateSegments(content: string): {
  segments: Array<{ content: string }>
  scanClassified: boolean
  splitReason?: string
} {
  const normalized = normalizeReceiptScanStructuredContent(content).trim()
  if (!normalized) {
    return {
      segments: [{ content }],
      scanClassified: false
    }
  }

  const lines = normalized.split(/\r\n?|\n/)
  const candidateHeaderIndices: number[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim()
    if (isLikelyReceiptMerchantHeader(line)) {
      candidateHeaderIndices.push(index)
    }
  }

  const uniqueSortedHeaders = Array.from(new Set(candidateHeaderIndices)).sort((left, right) => left - right)
  if (uniqueSortedHeaders.length < 2) {
    return {
      segments: [{ content: normalized }],
      scanClassified: looksLikeScanReceiptText(normalized)
    }
  }

  const segments = uniqueSortedHeaders
    .map((start, index) => {
      const endExclusive = index + 1 < uniqueSortedHeaders.length
        ? uniqueSortedHeaders[index + 1]
        : lines.length
      const segmentLines = lines.slice(start, endExclusive).map((line) => line.trim()).filter(Boolean)
      return { content: segmentLines.join('\n') }
    })
    .filter((segment) => {
      const fields = extractScanLikeReceiptHeuristicFields(segment.content)
      return Boolean(fields.totalRaw || fields.purchaseDateRaw || fields.receiptNumber)
    })

  if (segments.length < 2) {
    return {
      segments: [{ content: normalized }],
      scanClassified: looksLikeScanReceiptText(normalized)
    }
  }

  return {
    segments,
    scanClassified: true,
    splitReason: 'multiple-merchant-total-blocks'
  }
}

function looksLikeScanReceiptText(content: string): boolean {
  const normalized = content.toLowerCase()
  return /(tesco|potraviny|lidl|bauhaus|locksystems|drogerie|datart|stvrzenka|daňový|danovy|účtenka|uctenka|fiskalni|fiskální|pokladna|hotovost|karta|celkem|k\s+platb[eě]|zaplacen[aá]\s+[cč]a?stka)/.test(normalized)
    || countDateMatches(content) > 0
}

function countDateMatches(content: string): number {
  const matches = content.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g)
  return Array.isArray(matches) ? matches.length : 0
}

function isLikelyReceiptMerchantHeader(line: string): boolean {
  const normalized = line.trim()
  if (!normalized || normalized.length < 3) {
    return false
  }

  if (/^(tesco|potraviny|datart|hp\s*tronic|albert|billa|lidl|kaufland|penny|globus|rossmann|dm|bauhaus|locksystems)\b/i.test(normalized)) {
    return true
  }

  if (/[:]/.test(normalized)) {
    return false
  }

  if (/\b(total|celkem|zaplaceno|dph|vat|hotovost|karta|datum|date|id\s*dokladu|visa|mastercard|maestro|pin\s*ok|prodej|payment|card|cislo|číslo|nazev|název|zbozi|zboží|cena|pocet|počet)\b/i.test(normalized)) {
    return false
  }

  if (/[0-9]/.test(normalized)) {
    return false
  }

  return /\s+/.test(normalized) && /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\p{L}\s.&,-]{4,}$/u.test(normalized)
}

function extractScanLikeReceiptHeuristicFields(content: string): Partial<ReceiptExtractedFields> {
  const lines = normalizeReceiptScanStructuredContent(content)
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {}
  }

  const merchant = extractReceiptMerchantFromLines(lines)
  const purchaseDateRaw = extractReceiptDateFromLines(lines)
  const totalRaw = extractReceiptTotalFromLines(lines)
  const receiptNumber = extractReceiptReferenceFromLines(lines)
  const paymentMethod = extractReceiptPaymentMethod(lines)
  const vatRecap = extractReceiptVatRecapFromLines(lines, totalRaw)

  return {
    ...(merchant ? { merchant } : {}),
    ...(purchaseDateRaw ? { purchaseDateRaw } : {}),
    ...(totalRaw ? { totalRaw } : {}),
    ...(receiptNumber ? { receiptNumber } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(vatRecap.vatBaseRaw ? { vatBaseRaw: vatRecap.vatBaseRaw } : {}),
    ...(vatRecap.vatRaw ? { vatRaw: vatRecap.vatRaw } : {})
  }
}

function applyReceiptVatRecapFallback(fields: ReceiptExtractedFields, content: string): ReceiptExtractedFields {
  const lines = normalizeReceiptScanStructuredContent(content)
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const vatRecap = extractReceiptVatRecapFromLines(lines, fields.totalRaw, fields.supplementaryAmounts)

  if (fields.vatBaseRaw?.trim() && fields.vatRaw?.trim() && isExistingReceiptVatRecapPlausible(fields)) {
    return fields
  }

  if (!vatRecap.vatBaseRaw && !vatRecap.vatRaw) {
    return fields
  }

  return {
    ...fields,
    ...(shouldReplaceReceiptTotalWithVatRecapGross(fields.totalRaw, vatRecap) && vatRecap.totalRaw
      ? { totalRaw: vatRecap.totalRaw }
      : {}),
    ...(vatRecap.vatBaseRaw ? { vatBaseRaw: vatRecap.vatBaseRaw } : fields.vatBaseRaw ? { vatBaseRaw: fields.vatBaseRaw } : {}),
    ...(vatRecap.vatRaw ? { vatRaw: vatRecap.vatRaw } : fields.vatRaw ? { vatRaw: fields.vatRaw } : {})
  }
}

function shouldReplaceReceiptTotalWithVatRecapGross(
  currentTotalRaw: string | undefined,
  vatRecap: { totalRaw?: string; vatRaw?: string }
): boolean {
  const recapTotal = safeParseDocumentMoney(vatRecap.totalRaw, 'Receipt VAT recap gross total')

  if (!recapTotal || recapTotal.amountMinor < 10_000) {
    return false
  }

  const currentTotal = safeParseDocumentMoney(currentTotalRaw, 'Receipt current total before VAT recap gross')
  if (!currentTotal) {
    return true
  }

  const vatAmount = safeParseDocumentMoney(vatRecap.vatRaw, 'Receipt VAT recap amount for gross guard')

  return Boolean(
    vatAmount
    && currentTotal.amountMinor < vatAmount.amountMinor
    && recapTotal.amountMinor > currentTotal.amountMinor
  )
}

function isExistingReceiptVatRecapPlausible(fields: ReceiptExtractedFields): boolean {
  const knownTotalMinor = resolveReceiptVatKnownTotalMinor(fields)
  const vatAmount = safeParseDocumentMoney(fields.vatRaw, 'Receipt existing VAT amount')

  if (!knownTotalMinor || !vatAmount) {
    return false
  }

  return Math.abs(vatAmount.amountMinor - calculateStandardCzechVatFromGrossMinor(knownTotalMinor)) <= 1
}

function resolveReceiptVatKnownTotalMinor(fields: ReceiptExtractedFields): number | undefined {
  const total = safeParseDocumentMoney(fields.totalRaw, 'Receipt known VAT total')

  if (total && total.amountMinor >= 10_000) {
    return total.amountMinor
  }

  return fields.supplementaryAmounts
    ?.find((amount) => amount.currency === 'CZK' && amount.amountMinor >= 10_000 && amount.amountMinor <= 1_000_000)
    ?.amountMinor
}

function extractReceiptVatRecapFromLines(
  lines: string[],
  totalRaw: string | undefined,
  supplementaryAmounts: ReceiptVendorProfileSupplementaryAmount[] = []
): { totalRaw?: string; vatBaseRaw?: string; vatRaw?: string } {
  const parsedTotal = safeParseDocumentMoney(totalRaw, 'Receipt VAT recap total')
  const supplementaryTotalAmounts = supplementaryAmounts
    .filter((amount) => amount.currency === 'CZK' && amount.amountMinor >= 10_000 && amount.amountMinor <= 1_000_000)
    .map((amount) => amount.amountMinor)
  const candidateWindows = collectReceiptVatRecapWindows(lines)

  for (const windowLines of candidateWindows) {
    const joinedWindow = windowLines.join(' ')
    const amountCandidates = collectReceiptVatRecapAmountCandidates(windowLines)
    const recapTotal = selectReceiptVatRecapTotalCandidate(
      amountCandidates,
      parsedTotal?.amountMinor,
      supplementaryTotalAmounts
    )
    const knownTotalMinor = recapTotal?.amountMinor ?? parsedTotal?.amountMinor

    if (!knownTotalMinor || knownTotalMinor <= 0) {
      continue
    }

    const vatSelection = selectReceiptVatRecapVatAndBase(amountCandidates, knownTotalMinor)
    const hasRateEvidence = hasReceiptVatRateEvidence(joinedWindow)

    if (!vatSelection && !hasRateEvidence) {
      continue
    }

    const vatAmountMinor = vatSelection?.vatAmountMinor ?? calculateStandardCzechVatFromGrossMinor(knownTotalMinor)
    const baseAmountMinor = vatSelection?.baseAmountMinor ?? knownTotalMinor - vatAmountMinor

    if (baseAmountMinor <= 0) {
      continue
    }

    return {
      totalRaw: recapTotal?.raw ?? formatReceiptCzkMinor(knownTotalMinor),
      vatBaseRaw: vatSelection?.hasExplicitBase || hasRateEvidence ? formatReceiptCzkMinor(baseAmountMinor) : undefined,
      vatRaw: vatSelection?.vatRaw ?? formatReceiptCzkMinor(vatAmountMinor)
    }
  }

  return {}
}

function selectReceiptVatRecapVatAndBase(
  candidates: Array<{ raw: string; amountMinor: number; line: string; lineIndex: number }>,
  knownTotalMinor: number
): { vatAmountMinor: number; baseAmountMinor: number; vatRaw: string; hasExplicitBase: boolean } | undefined {
  const expectedVatMinor = calculateStandardCzechVatFromGrossMinor(knownTotalMinor)
  const expectedVat = candidates.find((candidate) => Math.abs(candidate.amountMinor - expectedVatMinor) <= 1)

  if (expectedVat) {
    const baseAmountMinor = knownTotalMinor - expectedVat.amountMinor
    return {
      vatAmountMinor: expectedVat.amountMinor,
      baseAmountMinor,
      vatRaw: expectedVat.raw,
      hasExplicitBase: candidates.some((candidate) => Math.abs(candidate.amountMinor - baseAmountMinor) <= 1)
    }
  }

  const pairSelection = selectReceiptVatRecapExplicitPair(candidates, knownTotalMinor)
  if (pairSelection) {
    return pairSelection
  }

  return undefined
}

function selectReceiptVatRecapExplicitPair(
  candidates: Array<{ raw: string; amountMinor: number; line: string; lineIndex: number }>,
  knownTotalMinor: number
): { vatAmountMinor: number; baseAmountMinor: number; vatRaw: string; hasExplicitBase: boolean } | undefined {
  const candidateRows = [
    ...new Set(candidates.map((candidate) => candidate.lineIndex))
  ].map((lineIndex) => candidates.filter((candidate) => candidate.lineIndex === lineIndex))

  for (const row of candidateRows) {
    const rowSelection = selectReceiptVatRecapExplicitPairFromCandidates(row, knownTotalMinor)
    if (rowSelection) {
      return rowSelection
    }
  }

  return selectReceiptVatRecapExplicitPairFromCandidates(candidates, knownTotalMinor)
}

function selectReceiptVatRecapExplicitPairFromCandidates(
  candidates: Array<{ raw: string; amountMinor: number; line: string; lineIndex: number }>,
  knownTotalMinor: number
): { vatAmountMinor: number; baseAmountMinor: number; vatRaw: string; hasExplicitBase: boolean } | undefined {
  const grossCandidates = candidates
    .filter((candidate) => candidate.amountMinor >= 10_000 && candidate.amountMinor <= knownTotalMinor && knownTotalMinor - candidate.amountMinor <= 150)
    .sort((left, right) => right.amountMinor - left.amountMinor)

  for (const grossCandidate of grossCandidates) {
    const selection = selectReceiptVatBasePairForGross(candidates, grossCandidate.amountMinor)
    if (selection) {
      return selection
    }
  }

  return selectReceiptVatBasePairForGross(candidates, knownTotalMinor)
}

function selectReceiptVatBasePairForGross(
  candidates: Array<{ raw: string; amountMinor: number; line: string; lineIndex: number }>,
  grossAmountMinor: number
): { vatAmountMinor: number; baseAmountMinor: number; vatRaw: string; hasExplicitBase: boolean } | undefined {
  const vatCandidates = candidates
    .filter((candidate) => candidate.amountMinor > 0 && candidate.amountMinor <= Math.round(grossAmountMinor * 0.25))
    .sort((left, right) => right.amountMinor - left.amountMinor)

  for (const vatCandidate of vatCandidates) {
    const baseAmountMinor = grossAmountMinor - vatCandidate.amountMinor
    const explicitBase = candidates.find((candidate) => Math.abs(candidate.amountMinor - baseAmountMinor) <= 1)

    if (!explicitBase) {
      continue
    }

    return {
      vatAmountMinor: vatCandidate.amountMinor,
      baseAmountMinor: explicitBase.amountMinor,
      vatRaw: vatCandidate.raw,
      hasExplicitBase: true
    }
  }

  return undefined
}

function collectReceiptVatRecapWindows(lines: string[]): string[][] {
  const windows: string[][] = []

  for (const [index, line] of lines.entries()) {
    if (!isStrongReceiptVatAnchorLine(line)) {
      continue
    }

    const windowStart = Math.max(0, index - 3)
    const windowEnd = Math.min(lines.length, index + 7)
    const windowLines = lines.slice(windowStart, windowEnd)

    if (!isReceiptVatRecapWindow(windowLines)) {
      continue
    }

    windows.push(windowLines)
  }

  return windows
}

function isStrongReceiptVatAnchorLine(line: string): boolean {
  const normalized = normalizeReceiptVatRecapText(line)
  const compact = normalized.replace(/\s+/g, '')

  return /\b(dph|vat)\b/.test(normalized)
    || /(?:dph|dptj|dpri|dpfi|dpj|dpf)/.test(compact)
    || /saz/.test(compact)
}

function isReceiptVatRecapWindow(lines: string[]): boolean {
  const normalized = normalizeReceiptVatRecapText(lines.join(' '))
  const compact = normalized.replace(/\s+/g, '')
  const hasVatAnchor = /(?:dph|vat|dptj|dpri|dpfi|dpj|dpf)/.test(compact)
    || (/saz/.test(compact) && hasReceiptVatRateEvidence(normalized))
  const hasRecapStructure = /saz|zaklad|z[aá]klad|celkem|ce1kem|ilerkem|base|total/.test(normalized)

  return hasVatAnchor && (hasRecapStructure || hasReceiptVatRateEvidence(normalized))
}

function hasReceiptVatRateEvidence(value: string): boolean {
  const normalized = normalizeReceiptVatRecapText(value)
  const compact = normalized.replace(/\s+/g, '')

  return /(?:^|[^0-9])(21|2l|2i)(?:%|pct|procent|[^0-9]|$)/i.test(normalized)
    || /(?:ztx|=\??l|=\??1|=\??7l|=\??21)/i.test(compact)
}

function collectReceiptVatRecapAmountCandidates(lines: string[]): Array<{ raw: string; amountMinor: number; line: string; lineIndex: number }> {
  const candidates: Array<{ raw: string; amountMinor: number; line: string; lineIndex: number }> = []
  const amountPattern = /[0-9OolIi!]{1,6}(?:[ .][0-9OolIi!]{3})*[,.]\s*[0-9OolIi!]{2,3}/g

  for (const [lineIndex, line] of lines.entries()) {
    for (const match of line.matchAll(amountPattern)) {
      const rawToken = match[0]?.trim()
      const amountMinor = parseReceiptVatRecapAmountMinor(rawToken)

      if (!rawToken || amountMinor === undefined || amountMinor <= 0 || amountMinor > 10_000_000) {
        continue
      }

      candidates.push({
        raw: formatReceiptCzkMinor(amountMinor),
        amountMinor,
        line,
        lineIndex
      })
    }
  }

  return candidates.filter((candidate, index, allCandidates) =>
    allCandidates.findIndex((otherCandidate) => otherCandidate.amountMinor === candidate.amountMinor) === index
  )
}

function parseReceiptVatRecapAmountMinor(rawToken: string | undefined): number | undefined {
  if (!rawToken?.trim()) {
    return undefined
  }

  const normalized = rawToken
    .replace(/[Oo]/g, '0')
    .replace(/[Il!]/g, '1')
    .replace(/\s+/g, '')
    .trim()
  const match = normalized.match(/^([0-9]{1,6}(?:[.][0-9]{3})*)([,.])([0-9]{2})([0-9]*)$/)

  if (!match?.[1] || !match[3]) {
    return undefined
  }

  const major = match[1]
  const cents = match[3]

  try {
    return parseDocumentAmountMinor(`${major},${cents}`, 'Receipt VAT recap amount')
  } catch {
    return undefined
  }
}

function selectReceiptVatRecapTotalCandidate(
  candidates: Array<{ raw: string; amountMinor: number; line: string; lineIndex: number }>,
  parsedTotalAmountMinor: number | undefined,
  supplementaryTotalAmounts: number[]
): { raw: string; amountMinor: number } | undefined {
  for (const supplementaryTotalAmount of supplementaryTotalAmounts) {
    const matchingSupplementaryTotal = candidates.find((candidate) => Math.abs(candidate.amountMinor - supplementaryTotalAmount) <= 1)
    if (matchingSupplementaryTotal) {
      return matchingSupplementaryTotal
    }
  }

  if (parsedTotalAmountMinor && parsedTotalAmountMinor >= 10_000) {
    const matchingTotal = candidates.find((candidate) => Math.abs(candidate.amountMinor - parsedTotalAmountMinor) <= 1)
    if (matchingTotal) {
      return matchingTotal
    }

    return {
      raw: formatReceiptCzkMinor(parsedTotalAmountMinor),
      amountMinor: parsedTotalAmountMinor
    }
  }

  if (supplementaryTotalAmounts.length > 0) {
    const supplementaryTotalAmount = supplementaryTotalAmounts[0]
    if (supplementaryTotalAmount) {
      return {
        raw: formatReceiptCzkMinor(supplementaryTotalAmount),
        amountMinor: supplementaryTotalAmount
      }
    }
  }

  return candidates
    .filter((candidate) => candidate.amountMinor >= 10_000 && candidate.amountMinor <= 1_000_000)
    .map((candidate) => ({
      ...candidate,
      score: scoreReceiptVatRecapTotalCandidate(candidate)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (left.lineIndex !== right.lineIndex) {
        return left.lineIndex - right.lineIndex
      }

      return right.amountMinor - left.amountMinor
    })[0]
}

function scoreReceiptVatRecapTotalCandidate(candidate: { amountMinor: number; line: string }): number {
  const normalizedLine = normalizeReceiptVatRecapText(candidate.line)
  let score = 0

  if (/celkem|ce1kem|ilerkem|total/.test(normalizedLine)) {
    score += 70
  }
  if (/visa|karta|kartou|platba|prodej/.test(normalizedLine)) {
    score += 50
  }
  if (candidate.amountMinor > 500_000) {
    score -= 80
  }
  if (/\b(i[čc]o|di[čc]|uid|dic|tel|telefon)\b/.test(normalizedLine)) {
    score -= 120
  }

  return score
}

function calculateStandardCzechVatFromGrossMinor(totalAmountMinor: number): number {
  return Math.round(totalAmountMinor * 21 / 121)
}

function formatReceiptCzkMinor(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : ''
  const absolute = Math.abs(amountMinor)
  const major = Math.trunc(absolute / 100)
  const cents = String(absolute % 100).padStart(2, '0')

  return `${sign}${major},${cents} CZK`
}

function normalizeReceiptVatRecapText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[|]/g, 'l')
}

function extractReceiptMerchantFromLines(lines: string[]): string | undefined {
  const topLines = lines.slice(0, 8)
  const legalName = topLines.find((line) =>
    isLikelyReceiptMerchantHeader(line)
    && /\b(s\.?\s*r\.?\s*o\.?|k\.?\s*s\.?|a\.?\s*s\.?|stores|drogerie\s+markt)\b/i.test(line)
  )

  if (legalName) {
    return legalName
  }

  for (const line of topLines) {
    if (isLikelyReceiptMerchantHeader(line)) {
      return line
    }
  }
  return undefined
}

function resolveSegmentedReceiptMerchantOverride(input: {
  fullContent: string
  segmentContent: string
  merchant?: string
}): string | undefined {
  if (!input.merchant || !containsStrongTescoReceiptSignalBeforeSegment(input.fullContent, input.segmentContent)) {
    return undefined
  }

  if (containsStrongTescoReceiptSignal(input.segmentContent)) {
    return undefined
  }

  return isTescoStoreLocationMerchant(input.merchant) ? 'TESCO' : undefined
}

function containsStrongTescoReceiptSignal(content: string): boolean {
  const normalized = normalizeReceiptTextForMerchantOverride(content)
  return /\btesco\b/.test(normalized)
}

function containsStrongTescoReceiptSignalBeforeSegment(fullContent: string, segmentContent: string): boolean {
  const segmentFirstLine = segmentContent
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!segmentFirstLine) {
    return false
  }

  const normalizedFullContent = normalizeReceiptScanStructuredContent(fullContent)
  const segmentStartIndex = normalizedFullContent.indexOf(segmentFirstLine)
  if (segmentStartIndex === -1) {
    return false
  }

  return containsStrongTescoReceiptSignal(
    normalizedFullContent.slice(Math.max(0, segmentStartIndex - 600), segmentStartIndex)
  )
}

function isTescoStoreLocationMerchant(merchant: string): boolean {
  return /\b(hypermarket|hypennerket|hypemarket)\b/.test(normalizeReceiptTextForMerchantOverride(merchant))
}

function normalizeReceiptTextForMerchantOverride(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function extractReceiptDateFromLines(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/)
    if (!match?.[1]) {
      continue
    }

    const normalizedYear = match[1].replace(/(\d{1,2}[./-]\d{1,2}[./-])(\d{2})$/, '$120$2')
    if (safeNormalizeDocumentDate(normalizedYear, 'Receipt scan date')) {
      return normalizedYear
    }
  }
  return undefined
}

function extractReceiptTotalFromLines(lines: string[]): string | undefined {
  const amountCandidates: Array<{ amountMinor: number; raw: string; score: number; lineIndex: number; matchIndex: number }> = []

  for (const [lineIndex, line] of lines.entries()) {
    const lineScore = scoreReceiptTotalLine(line)
    if (lineScore <= -80) {
      continue
    }

    const normalizedLine = normalizeReceiptScanTotalLine(line)
    const matches = Array.from(normalizedLine.matchAll(/-?\d{1,6}(?:[ .]\d{3})*(?:[.,]\d{2})?/g))

    for (const [matchIndex, match] of matches.entries()) {
      const rawAmount = match[0]?.trim()
      if (!rawAmount) {
        continue
      }

      if (shouldRejectReceiptScanTotalCandidate(rawAmount, normalizedLine, match.index ?? 0, lineScore)) {
        continue
      }

      const normalized = rawAmount
        .replace(/\s+/g, '')
        .replace(/[A-Za-z]+$/g, '')
        .trim()

      if (!normalized || !/\d/.test(normalized)) {
        continue
      }

      const hasDecimal = /[.,]\d{2}$/.test(normalized)
      if (!hasDecimal && !hasReceiptScanTotalOrPaymentAnchor(normalizedLine)) {
        continue
      }

      const moneyCandidate = hasDecimal
        ? `${normalized} CZK`
        : `${normalized},00 CZK`
      const parsed = safeParseDocumentMoney(moneyCandidate, 'Receipt scan total')

      if (!parsed) {
        continue
      }

      if (parsed.amountMinor <= 0 || parsed.amountMinor > 10_000_000) {
        continue
      }

      amountCandidates.push({
        amountMinor: parsed.amountMinor,
        raw: moneyCandidate,
        score: lineScore + Math.min(3, String(parsed.amountMinor).length),
        lineIndex,
        matchIndex
      })
    }
  }

  if (amountCandidates.length === 0) {
    return undefined
  }

  amountCandidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    if (right.lineIndex !== left.lineIndex) {
      return right.lineIndex - left.lineIndex
    }

    if (right.amountMinor !== left.amountMinor) {
      return right.amountMinor - left.amountMinor
    }

    return left.matchIndex - right.matchIndex
  })

  return amountCandidates[0]?.raw
}

function extractReceiptReferenceFromLines(lines: string[]): string | undefined {
  const patterns = [
    /(?:stvrzenka\s*-?\s*(?:danovy|daňový)\s*doklad|daňový\s*doklad|danovy\s*doklad)\s*[:#-]?\s*([A-Z0-9/-]{4,})/iu,
    /(?:eet\s*[:#-]?\s*)?(?:pokladna\s*\/\s*doklad|id\s*dokladu|č(?:íslo)?\s*dokladu|cislo\s*dokladu|doklad\s*č?|doklad\s*c?|účtenka\s*č(?:íslo)?|uctenka\s*c(?:islo)?|receipt\s*(?:no|number))\s*[:#-]?\s*([A-Z0-9/-]{4,})/iu,
    /\b([0-9]{12,})\b/
  ]

  for (const line of lines) {
    if (/\b(i[čc]o|di[čc]|tax\s*id|tel|telefon|phone)\b/i.test(line)) {
      continue
    }

    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match?.[1]) {
        return match[1].trim()
      }
    }
  }

  return undefined
}

function scoreReceiptTotalLine(line: string): number {
  const normalized = normalizeReceiptTotalSignalText(line)
  let score = 0

  if (/\b(k\s*platbe|k\s*platbě|celkova\s+zaplacena\s+castka|celková\s+zaplacená\s+částka)\b/.test(normalized)) {
    score += 120
  }

  if (/\b(total|celkem|zaplaceno|castka|částka|uhrazeno)\b/.test(normalized)) {
    score += 95
  }

  if (/\b(prodej|karta|kartou|platebni\s+karta|platební\s+karta|visa|mastercard|maestro|platba|payment|card)\b/.test(normalized)) {
    score += 35
  }

  if (/\b(hotovost|cash)\b/.test(normalized)) {
    score += 8
  }

  if (/\b(vraceno|vráceno|returned|nazp[eě]t|zpet|zpět)\b/.test(normalized)) {
    score -= 160
  }

  if (/\b(dph|sazba|základ|zaklad|bez\s+dph|mezisoucet|mezisoučet|subtotal|sleva|discount|body|points|věrnost|vernost|bonus|obrat\s+netto|suma\s+dph)\b/.test(normalized)) {
    score -= 130
  }

  if (/\b(i[čc]o|di[čc]|dic|uid|tel|telefon|phone|psc|psč)\b/.test(normalized)) {
    score -= 120
  }

  if (/\b(cislo\s+nazev\s+zbozi|číslo\s+název\s+zboží|pocet|počet|mnozstvi|množství|ks|kus)\b/.test(normalized)) {
    score -= 120
  }

  return score
}

function normalizeReceiptScanTotalLine(line: string): string {
  return normalizeReceiptScanLine(line)
    .replace(/\b(KČ|Kč|KC|Kc)\b/g, 'CZK')
}

function normalizeReceiptTotalSignalText(line: string): string {
  return normalizeReceiptScanTotalLine(line)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\bc\s+e\s+l\s+k\s+e\s+m\b/g, 'celkem')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function hasReceiptScanTotalOrPaymentAnchor(line: string): boolean {
  const normalizedLine = normalizeReceiptTotalSignalText(line)

  return /\b(total|celkem|zaplaceno|castka|částka|uhrazeno|k\s*platbe|k\s*platbě|prodej|karta|kartou|visa|mastercard|maestro|platba|payment|card|hotovost|cash|czk)\b/.test(normalizedLine)
}

function shouldRejectReceiptScanTotalCandidate(
  rawAmount: string,
  line: string,
  matchIndex: number,
  lineScore: number
): boolean {
  const normalizedLine = normalizeReceiptTotalSignalText(line)
  const matchEnd = matchIndex + rawAmount.length
  const context = line.slice(Math.max(0, matchIndex - 8), Math.min(line.length, matchEnd + 8))

  if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(context) || /\d{1,2}:\d{2}(?::\d{2})?/.test(context)) {
    return true
  }

  if (/\b(i[čc]o|di[čc]|dic|uid|tel|telefon|phone|psc|psč)\b/.test(normalizedLine)) {
    return true
  }

  if (/\b(vraceno|vráceno|returned|nazp[eě]t|zpet|zpět)\b/.test(normalizedLine)) {
    return true
  }

  if (/\b(obrat\s+netto|suma\s+dph|zaklad\s+dph|základ\s+dph|dph\s*21|sazba\s+dph|bez\s+dph)\b/.test(normalizedLine)) {
    return true
  }

  if (/\b(hotovost|cash)\b/.test(normalizedLine) && !/\b(total|celkem|zaplaceno|castka|částka|uhrazeno|k\s*platbe|k\s*platbě)\b/.test(normalizedLine) && lineScore < 40) {
    return true
  }

  return false
}

function resolveFallbackReceiptPurchaseDate(content: string, extractedAt: string): string {
  const normalized = normalizeReceiptScanStructuredContent(content)
  const explicitDate = extractReceiptDateFromLines(normalized.split(/\r\n?|\n/).map((line) => line.trim()).filter(Boolean))

  if (explicitDate) {
    const normalizedDate = safeNormalizeDocumentDate(explicitDate, 'Receipt fallback date')
    if (normalizedDate) {
      return normalizedDate
    }
  }

  const compact = normalized.replace(/\s+/g, '')
  const compactDate = compact.match(/\b(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])\b/)
  if (compactDate) {
    const candidate = `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`
    const normalizedDate = safeNormalizeDocumentDate(candidate, 'Receipt compact fallback date')
    if (normalizedDate) {
      return normalizedDate
    }
  }

  return extractedAt.slice(0, 10)
}

function normalizeReceiptScanStructuredContent(content: string): string {
  return String(content || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeReceiptScanLine(line))
    .filter((line) => line.length > 0)
    .join('\n')
}

function normalizeReceiptScanLine(line: string): string {
  let normalized = line
    .replace(/[ \t]+/g, ' ')
    .trim()

  let previous = ''
  while (normalized !== previous) {
    previous = normalized
    normalized = normalized
      .replace(/\b(?:[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}]\b/gu, (match) => match.replace(/\s+/g, ''))
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  return normalized
}

function extractTopScanReceiptTotals(content: string): Array<{ amountMinor: number; currency: string }> {
  const lines = normalizeReceiptScanStructuredContent(content)
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const candidates: Array<{ amountMinor: number; currency: string; markerIndex: number; candidateLineIndex: number; score: number }> = []
  const totalMarkerPattern = /\b(celkem|celkel.?|karta|kartou|hotovost|platba|zaplaceno)\b/i
  const amountPattern = /-?\d{1,6}(?:[ .]\d{3})*[.,]\d{2}/g

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (!totalMarkerPattern.test(line)) {
      continue
    }

    const windowLines = lines.slice(index, index + 8)
    const windowAmounts = windowLines
      .flatMap((windowLine, windowOffset) => Array.from(windowLine.matchAll(amountPattern)).map((match) => ({
        raw: match[0],
        line: windowLine,
        candidateLineIndex: index + windowOffset,
        distanceFromMarker: windowOffset
      })))
      .map((entry) => ({
        ...entry,
        parsed: entry.raw ? safeParseDocumentMoney(`${entry.raw} CZK`, 'Receipt scan top totals') : undefined
      }))
      .filter((entry): entry is typeof entry & { parsed: NonNullable<typeof entry.parsed> } => Boolean(entry.parsed && entry.parsed.amountMinor >= 30_000))
      .map((entry) => ({
        amountMinor: entry.parsed.amountMinor,
        currency: entry.parsed.currency,
        markerIndex: index,
        candidateLineIndex: entry.candidateLineIndex,
        score: scoreReceiptTotalLine(entry.line) - entry.distanceFromMarker * 2
      }))

    if (windowAmounts.length === 0) {
      continue
    }

    const topWindowAmount = windowAmounts.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (left.candidateLineIndex !== right.candidateLineIndex) {
        return left.candidateLineIndex - right.candidateLineIndex
      }

      return right.amountMinor - left.amountMinor
    })[0]!
    candidates.push(topWindowAmount)
  }

  if (candidates.length === 0) {
    return []
  }

  const unique = new Map<string, { amountMinor: number; currency: string; markerIndex: number }>()
  for (const candidate of candidates) {
    const key = `${candidate.amountMinor}:${candidate.currency}`
    if (!unique.has(key)) {
      unique.set(key, {
        amountMinor: candidate.amountMinor,
        currency: candidate.currency,
        markerIndex: candidate.markerIndex
      })
    }
  }

  return Array.from(unique.values())
    .sort((left, right) => left.markerIndex - right.markerIndex)
    .slice(0, 2)
    .map((candidate) => ({
      amountMinor: candidate.amountMinor,
      currency: candidate.currency
    }))
}

function extractReceiptPaymentMethod(lines: string[]): string | undefined {
  for (const line of lines) {
    if (/\b(hotovost|cash)\b/i.test(line)) {
      return 'Platba hotově'
    }
    if (/\b(karta|card|visa|mastercard)\b/i.test(line)) {
      return 'Platba kartou'
    }
  }
  return undefined
}

function safeNormalizeDocumentDate(value: string | undefined, fieldName: string): string | undefined {
  if (!value?.trim()) {
    return undefined
  }

  try {
    return normalizeDocumentDate(value, fieldName)
  } catch {
    return undefined
  }
}

function safeParseDocumentMoney(
  value: string | undefined,
  fieldName: string
): { amountMinor: number; currency: string } | undefined {
  if (!value?.trim()) {
    return undefined
  }

  try {
    return parseDocumentMoney(value, fieldName)
  } catch {
    return undefined
  }
}
