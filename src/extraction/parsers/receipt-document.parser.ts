import type { ExtractedRecord } from '../../domain'
import type {
  DeterministicDocumentExtractionStageDebug,
  DeterministicDocumentFieldConfidence,
  DeterministicDocumentFieldProvenance,
  DeterministicDocumentOcrParsedFields,
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
}

interface ReceiptSegmentationDebug {
  scanClassified: boolean
  segmentCount: number
  splitReason?: string
}

export class ReceiptDocumentParser {
  parse(input: ParseReceiptDocumentInput): ExtractedRecord[] {
    const segmentation = splitReceiptContentIntoCandidateSegments(input.content)
    const extractedRecords: ExtractedRecord[] = []

    for (let index = 0; index < segmentation.segments.length; index += 1) {
      const segment = segmentation.segments[index]!
      const extraction = extractReceiptDocumentFields({
        content: segment.content,
        binaryContentBase64: segmentation.segments.length === 1 ? input.binaryContentBase64 : undefined
      })
      const summary = buildReceiptDocumentExtractionSummary(
        extraction,
        segmentation.segments.length === 1 ? input.binaryContentBase64 : undefined,
        {
          scanClassified: segmentation.scanClassified,
          segmentCount: segmentation.segments.length,
          splitReason: segmentation.splitReason
        }
      )
      const purchaseDate = summary.paymentDate

      if (summary.finalStatus === 'failed') {
        if (segmentation.segments.length === 1) {
          throw new Error(`Receipt document is missing required fields: ${summary.missingRequiredFields.join(', ')}`)
        }
        continue
      }

      if (!purchaseDate || typeof summary.totalAmountMinor !== 'number' || !summary.totalCurrency) {
        continue
      }

      extractedRecords.push({
        id: `receipt-record-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'receipt-document',
        extractedAt: input.extractedAt,
        ...(extraction.fields.receiptNumber ? { rawReference: extraction.fields.receiptNumber } : {}),
        amountMinor: summary.totalAmountMinor,
        currency: summary.totalCurrency,
        occurredAt: purchaseDate,
        data: {
          sourceSystem: 'receipt',
          ...(extraction.fields.receiptNumber ? { receiptNumber: extraction.fields.receiptNumber } : {}),
          ...(extraction.fields.merchant ? { merchant: extraction.fields.merchant } : {}),
          purchaseDate,
          amountMinor: summary.totalAmountMinor,
          currency: summary.totalCurrency,
          ...(extraction.fields.paymentMethod ? { paymentMethod: extraction.fields.paymentMethod } : {}),
          ...(extraction.fields.category ? { category: extraction.fields.category } : {}),
          ...(extraction.fields.note ? { description: extraction.fields.note } : {}),
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
    ...(extractionStages.length > 0 ? { extractionStages } : {})
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

  return {
    fields: merged.fields,
    fieldProvenance: merged.fieldProvenance,
    fieldConfidence: buildReceiptFieldConfidenceMap(merged.fields, merged.fieldProvenance),
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
      )
    })
  }
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
        ? (input.scanHeuristicApplied ? ['scan-heuristic-fields-applied'] : undefined)
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
  const normalized = String(content || '').replace(/\u0000/g, '').trim()
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

  return /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\p{L}\s.&,-]{4,}$/u.test(normalized)
}

function extractScanLikeReceiptHeuristicFields(content: string): Partial<ReceiptExtractedFields> {
  const lines = String(content || '')
    .replace(/\u0000/g, '')
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
  const totalLines = lines.filter((line) => /\b(total|celkem|zaplaceno|částka|castka)\b/i.test(line))

  for (const line of [...totalLines, ...lines]) {
    const withCurrency = line.match(/(-?\d[\d\s.,]*\d)\s*(CZK|KČ|Kc|EUR|€)\b/i)
    if (withCurrency?.[0] && safeParseDocumentMoney(withCurrency[0], 'Receipt scan total')) {
      return withCurrency[0]
    }

    const bareAmount = line.match(/(-?\d[\d\s.,]*[.,]\d{2})\b/)
    if (!bareAmount?.[1]) {
      continue
    }
    const candidate = `${bareAmount[1]} CZK`
    if (safeParseDocumentMoney(candidate, 'Receipt scan total')) {
      return candidate
    }

    const wholeUnits = line.match(/(-?\d{1,3}(?:[ .]\d{3})+|-?\d{3,})\b/)
    if (!wholeUnits?.[1]) {
      continue
    }
    const normalized = wholeUnits[1].replace(/[ .]/g, '')
    try {
      const amountMinor = parseDocumentAmountMinor(normalized, 'Receipt scan total units')
      if (Number.isFinite(amountMinor) && amountMinor > 0) {
        return `${wholeUnits[1]} CZK`
      }
    } catch {
      continue
    }
  }

  return undefined
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
