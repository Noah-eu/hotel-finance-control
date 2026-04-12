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

export interface ParseReceiptDocumentInput extends DeterministicDocumentParserInput {}

export type InspectReceiptDocumentExtractionSummaryInput =
  | string
  | {
    content: string
    binaryContentBase64?: string
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
        binaryContentBase64: segmentBinaryContentBase64
      })
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
    binaryContentBase64: segmentation.segments.length === 1 ? normalizedInput.binaryContentBase64 : undefined
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
): { content: string; binaryContentBase64?: string } {
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
    note: labeledTextFields.note ?? scanHeuristicFields.note
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

  const ocrExtraction = extractDocumentOcrOrVisionFallback({
    content: input.content,
    binaryContentBase64: input.binaryContentBase64,
    documentKind: 'receipt'
  })
  const merged = mergeReceiptTextAndOcrFields(textFields, fieldProvenance, ocrExtraction)
  const vendorProfile = applyReceiptVendorProfile({
    content: input.content,
    currentFields: merged.fields,
    ocrParsedFields: ocrExtraction.parsedFields
  })
  const vendorMergedFields = applyReceiptVendorOverrides(merged.fields, vendorProfile)
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
      content: input.content,
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
  return {
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
    vendorProfileSelected: input.vendorProfileKey,
    amountCandidates: vendorInspection.amountCandidates,
    anchoredAmountCandidates: vendorInspection.anchoredAmountCandidates,
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
  ocrExtraction: ReturnType<typeof extractDocumentOcrOrVisionFallback>
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
    fallbackValue: ocrExtraction.parsedFields?.referenceNumber,
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
    fallbackValue: ocrExtraction.parsedFields?.issuerOrCounterparty,
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
    fallbackValue: ocrExtraction.parsedFields?.paymentDate ?? ocrExtraction.parsedFields?.issueDate,
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
    fallbackValue: ocrExtraction.parsedFields?.totalAmount,
    normalizeValue: normalizeComparableReceiptMoney,
    assign(value) {
      mergedFields.totalRaw = value
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
  }

  return {
    fields: mergedFields,
    fieldProvenance,
    ocrRecoveredFields,
    ocrConfirmedFields
  }
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
      return Boolean(fields.totalRaw || fields.purchaseDateRaw || fields.merchant)
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
  return /(tesco|potraviny|datart|účtenka|uctenka|fiskalni|fiskální|pokladna|hotovost|karta|celkem)/.test(normalized)
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

  if (/[:]/.test(normalized)) {
    return false
  }

  if (/\b(total|celkem|zaplaceno|dph|vat|hotovost|karta|datum|date|id\s*dokladu)\b/i.test(normalized)) {
    return false
  }

  if (/^(tesco|potraviny|datart|hp\s*tronic|albert|billa|lidl|kaufland|penny|globus|rossmann|dm)\b/i.test(normalized)) {
    return true
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

  return {
    ...(merchant ? { merchant } : {}),
    ...(purchaseDateRaw ? { purchaseDateRaw } : {}),
    ...(totalRaw ? { totalRaw } : {}),
    ...(receiptNumber ? { receiptNumber } : {}),
    ...(paymentMethod ? { paymentMethod } : {})
  }
}

function extractReceiptMerchantFromLines(lines: string[]): string | undefined {
  for (const line of lines.slice(0, 6)) {
    if (isLikelyReceiptMerchantHeader(line)) {
      return line
    }
  }
  return undefined
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
  const amountCandidates: Array<{ amountMinor: number; raw: string; score: number; lineIndex: number }> = []

  for (const [lineIndex, line] of lines.entries()) {
    const lineScore = scoreReceiptTotalLine(line)
    const matches = Array.from(line.matchAll(/-?\d{1,6}(?:[ .]\d{3})*(?:[.,]\d{2})?/g))

    for (const match of matches) {
      const rawAmount = match[0]?.trim()
      if (!rawAmount) {
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
        lineIndex
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

    return right.amountMinor - left.amountMinor
  })

  return amountCandidates[0]?.raw
}

function extractReceiptReferenceFromLines(lines: string[]): string | undefined {
  const patterns = [
    /(?:id\s*dokladu|č(?:íslo)?\s*dokladu|účtenka\s*č?|uctenka\s*c?)\s*[:#-]?\s*([A-Z0-9/-]{6,})/iu,
    /\b([0-9]{12,})\b/
  ]

  for (const line of lines) {
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
  let score = 0

  if (/\b(total|celkem|zaplaceno|částka|castka)\b/i.test(line)) {
    score += 6
  }

  if (/\b(karta|kartou|hotovost|platba|payment|cash)\b/i.test(line)) {
    score += 7
  }

  if (/\b(dph|sazba|základ|zaklad|mezisoucet|mezisoučet|subtotal|vraceno|sleva|discount|body|points|věrnost|vernost|bonus)\b/i.test(line)) {
    score -= 10
  }

  return score
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
