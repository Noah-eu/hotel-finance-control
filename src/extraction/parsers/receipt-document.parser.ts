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

export class ReceiptDocumentParser {
  parse(input: ParseReceiptDocumentInput): ExtractedRecord[] {
    const extraction = extractReceiptDocumentFields({
      content: input.content,
      binaryContentBase64: input.binaryContentBase64
    })
    const summary = buildReceiptDocumentExtractionSummary(extraction, input.binaryContentBase64)
    const purchaseDate = summary.paymentDate

    if (summary.finalStatus === 'failed') {
      throw new Error(`Receipt document is missing required fields: ${summary.missingRequiredFields.join(', ')}`)
    }

    if (!purchaseDate || typeof summary.totalAmountMinor !== 'number' || !summary.totalCurrency) {
      return []
    }

    return [
      {
        id: 'receipt-record-1',
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
          ...(extraction.fields.category ? { category: extraction.fields.category } : {}),
          ...(extraction.fields.note ? { description: extraction.fields.note } : {})
        }
      }
    ]
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
  const extraction = extractReceiptDocumentFields(normalizedInput)

  return buildReceiptDocumentExtractionSummary(extraction, normalizedInput.binaryContentBase64)
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
  binaryContentBase64?: string
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
  const textFields: ReceiptExtractedFields = {
    receiptNumber: pickRequiredField(fields, FIELD_ALIASES.receiptNumber),
    merchant: pickRequiredField(fields, FIELD_ALIASES.merchant),
    purchaseDateRaw: pickRequiredField(fields, FIELD_ALIASES.purchaseDate),
    totalRaw: pickRequiredField(fields, FIELD_ALIASES.total),
    category: pickRequiredField(fields, FIELD_ALIASES.category),
    note: pickRequiredField(fields, FIELD_ALIASES.note) ?? pickRequiredField(fields, FIELD_ALIASES.category)
  }
  const fieldProvenance: Partial<Record<DeterministicDocumentSummaryFieldKey, DeterministicDocumentFieldProvenance>> = {}

  if (textFields.receiptNumber?.trim()) {
    fieldProvenance.referenceNumber = 'text'
  }
  if (textFields.merchant?.trim()) {
    fieldProvenance.issuerOrCounterparty = 'text'
  }
  if (textFields.purchaseDateRaw?.trim()) {
    fieldProvenance.paymentDate = 'text'
  }
  if (textFields.totalRaw?.trim()) {
    fieldProvenance.totalAmount = 'text'
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
      ocrConfirmedFields: merged.ocrConfirmedFields
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
      ['totalAmount', fields.totalRaw]
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

  return [
    {
      stage: 'text_layer_parse',
      outcome: textRecoveredFields.length > 0 ? 'applied' : 'skipped',
      adapter: 'text',
      recoveredFields: textRecoveredFields,
      notes: textRecoveredFields.length > 0 ? undefined : ['no text-layer fields recovered']
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
