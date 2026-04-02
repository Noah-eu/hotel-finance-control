import type {
  UploadedMonthlyFile,
  UploadedMonthlyFileCapabilityAssessment,
  UploadedMonthlyFileCapabilityDocumentHint,
  UploadedMonthlyFileDecisionConfidence,
  UploadedMonthlyFileIngestionBranch
} from './contracts'
import {
  detectInvoiceDocumentKeywordHits,
  detectBookingPayoutStatementSignals,
  inspectInvoiceDocumentExtractionSummary,
  inspectReceiptDocumentExtractionSummary,
  looksLikeRaiffeisenbankGpcStatement
} from '../extraction'

interface UploadedMonthlyFileCapabilityInput {
  fileName: string
  content: string
  binaryContentBase64?: string
  contentFormat?: UploadedMonthlyFile['contentFormat']
  sourceDescriptor?: UploadedMonthlyFile['sourceDescriptor']
  ingestError?: string
}

export function detectUploadedMonthlyFileCapability(
  input: UploadedMonthlyFileCapabilityInput
): UploadedMonthlyFileCapabilityAssessment {
  const fileName = input.fileName.trim().toLowerCase()
  const mimeType = input.sourceDescriptor?.mimeType?.toLowerCase()
  const extraction = input.sourceDescriptor?.browserTextExtraction
  const trimmedContent = input.content.trim()
  const headerLine = trimmedContent.split(/\r?\n/, 1)[0] ?? ''
  const headerFields = headerLine
    .split(/[;,]/)
    .map((field) => field.trim())
    .filter((field) => field.length > 0)
  const sourceDescriptorCapability = input.sourceDescriptor?.capability
  const documentHints = detectUploadedMonthlyFileDocumentHints({
    fileName,
    content: trimmedContent,
    detectedSignatures: extraction?.detectedSignatures ?? []
  })

  if (sourceDescriptorCapability) {
    return sourceDescriptorCapability
  }

  if (input.contentFormat === 'binary-workbook' || fileName.endsWith('.xlsx')) {
    return buildCapability(
      'structured_tabular',
      'structured_workbook',
      documentHints,
      'strong',
      ['binary-workbook-upload']
    )
  }

  if (looksLikePdf(input)) {
    if (trimmedContent.length > 0) {
      return buildCapability(
        'pdf_text_layer',
        'text_pdf',
        documentHints,
        'strong',
        [
          'pdf-upload',
          'text-layer-extracted',
          ...(extraction?.detectedSignatures ?? []),
          ...buildDocumentHintEvidence(documentHints)
        ]
      )
    }

    if (isPdfImageOnlyError(input.ingestError)) {
      return buildCapability(
        'pdf_image_only',
        'image_pdf',
        documentHints,
        'strong',
        ['pdf-upload', 'text-layer-missing', ...buildDocumentHintEvidence(documentHints)]
      )
    }

    if (isPdfTextExtractionUnavailableError(input.ingestError)) {
      return buildCapability(
        'pdf_text_layer',
        'text_pdf',
        documentHints,
        'hint',
        ['pdf-upload', 'text-extraction-unavailable', ...buildDocumentHintEvidence(documentHints)]
      )
    }

    return buildCapability('unknown', 'unknown_document', documentHints, 'hint', [
      'pdf-upload',
      ...buildDocumentHintEvidence(documentHints)
    ])
  }

  if (looksLikeImageUpload(fileName, mimeType)) {
    const recognizedImageDocument = documentHints.length > 0
    const expenseLikeName = looksExpenseLikeDocumentName(fileName)

    return buildCapability(
      'image_receipt_like',
      'image_document',
      documentHints,
      recognizedImageDocument || expenseLikeName ? 'hint' : 'none',
      recognizedImageDocument || expenseLikeName
        ? ['image-upload', 'expense-document-name', ...buildDocumentHintEvidence(documentHints)]
        : ['image-upload']
    )
  }

  if (input.contentFormat === 'binary' || mimeType === 'application/octet-stream') {
    return buildCapability('unsupported_binary', 'unsupported_binary', documentHints, 'strong', [
      'binary-upload',
      ...buildDocumentHintEvidence(documentHints)
    ])
  }

  if (looksLikeRaiffeisenbankGpcStatement(trimmedContent, fileName)) {
    return buildCapability(
      'structured_tabular',
      'structured_csv',
      documentHints,
      'strong',
      ['fixed-width-gpc-shape', ...buildDocumentHintEvidence(documentHints)]
    )
  }

  if (looksLikeStructuredTabularContent(headerFields, trimmedContent)) {
    return buildCapability(
      'structured_tabular',
      'structured_csv',
      documentHints,
      'strong',
      [
        'delimited-header',
        ...(headerFields.length > 0 ? ['header-fields-present'] : [])
      ]
    )
  }

  if (trimmedContent.length > 0 && documentHints.length > 0) {
    return buildCapability('text_document', 'text_document', documentHints, 'hint', [
      'text-document-hints',
      ...buildDocumentHintEvidence(documentHints)
    ])
  }

  if (trimmedContent.length > 0 && looksExpenseLikeDocumentName(fileName)) {
    return buildCapability('text_document', 'text_document', documentHints, 'hint', [
      'text-document-name',
      ...buildDocumentHintEvidence(documentHints)
    ])
  }

  if (trimmedContent.length > 0 && /[:]/.test(trimmedContent)) {
    return buildCapability('text_document', 'text_document', documentHints, 'hint', [
      'labeled-text-content',
      ...buildDocumentHintEvidence(documentHints)
    ])
  }

  return buildCapability('unknown', 'unknown_document', documentHints, 'none', [
    ...buildDocumentHintEvidence(documentHints)
  ])
}

export function resolveUploadedMonthlyFileIngestionBranch(
  capability: UploadedMonthlyFileCapabilityAssessment
): UploadedMonthlyFileIngestionBranch {
  switch (capability.transportProfile) {
    case 'structured_csv':
    case 'structured_workbook':
      return 'structured-parser'
    case 'text_pdf':
      return 'text-pdf-parser'
    case 'text_document':
      return 'text-document-parser'
    case 'image_pdf':
    case 'image_document':
      return 'ocr-required'
    case 'unsupported_binary':
    case 'unknown_document':
    default:
      return 'unsupported'
  }
}

function buildCapability(
  profile: UploadedMonthlyFileCapabilityAssessment['profile'],
  transportProfile: UploadedMonthlyFileCapabilityAssessment['transportProfile'],
  documentHints: UploadedMonthlyFileCapabilityAssessment['documentHints'],
  confidence: UploadedMonthlyFileDecisionConfidence,
  evidence: string[]
): UploadedMonthlyFileCapabilityAssessment {
  return {
    profile,
    transportProfile,
    documentHints,
    confidence,
    evidence
  }
}

function detectUploadedMonthlyFileDocumentHints(input: {
  fileName: string
  content: string
  detectedSignatures: string[]
}): UploadedMonthlyFileCapabilityDocumentHint[] {
  const hints = new Set<UploadedMonthlyFileCapabilityDocumentHint>()
  const normalizedFileName = input.fileName.toLowerCase()
  const invoiceSummary = input.content.length > 0 ? inspectInvoiceDocumentExtractionSummary(input.content) : undefined
  const invoiceKeywordHits = input.content.length > 0 ? detectInvoiceDocumentKeywordHits(input.content) : []
  const receiptSummary = input.content.length > 0 ? inspectReceiptDocumentExtractionSummary(input.content) : undefined
  const bookingSignals = input.content.length > 0 ? detectBookingPayoutStatementSignals(input.content) : undefined

  if (
    normalizedFileName.includes('invoice')
    || normalizedFileName.includes('faktura')
    || invoiceSummary?.confidence === 'strong'
    || invoiceKeywordHits.length >= 3
  ) {
    hints.add('invoice_like')
  }

  if (
    normalizedFileName.includes('receipt')
    || normalizedFileName.includes('uctenka')
    || normalizedFileName.includes('účtenka')
    || receiptSummary?.confidence === 'strong'
    || looksLikeReceiptDocumentText(input.content)
  ) {
    hints.add('receipt_like')
  }

  if (
    input.detectedSignatures.includes('booking-branding')
    || input.detectedSignatures.includes('booking-payout-statement-wording')
    || (bookingSignals?.hasBookingBranding && bookingSignals?.hasStatementWording)
    || looksLikeBookingPayoutStatementFileName(normalizedFileName)
  ) {
    hints.add('payout_statement_like')
  }

  return Array.from(hints)
}

function buildDocumentHintEvidence(
  documentHints: UploadedMonthlyFileCapabilityDocumentHint[]
): string[] {
  return documentHints.map((hint) => `document-hint:${hint}`)
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

function looksLikePdf(input: UploadedMonthlyFileCapabilityInput): boolean {
  return input.contentFormat === 'pdf-text'
    || input.sourceDescriptor?.browserTextExtraction?.mode === 'pdf-text'
    || input.sourceDescriptor?.mimeType === 'application/pdf'
    || input.fileName.toLowerCase().endsWith('.pdf')
}

function looksLikeImageUpload(fileName: string, mimeType: string | undefined): boolean {
  return Boolean(
    mimeType?.startsWith('image/')
    || /\.(png|jpe?g|webp|gif|bmp|heic|heif|tiff?)$/i.test(fileName)
  )
}

function looksExpenseLikeDocumentName(fileName: string): boolean {
  return /(invoice|faktura|receipt|uctenka|účtenka|doklad|bill)/i.test(fileName)
}

function looksLikeBookingPayoutStatementFileName(normalizedFileName: string): boolean {
  return normalizedFileName.endsWith('.pdf')
    && normalizedFileName.includes('booking')
    && /(payout|payment|statement|summary|overview|vykaz|prehled|přehled|souhrn)/i.test(normalizedFileName)
}

function looksLikeStructuredTabularContent(headerFields: string[], content: string): boolean {
  if (headerFields.length >= 3 && /[;,]/.test(content.split(/\r?\n/, 1)[0] ?? '')) {
    return true
  }

  const normalizedHeader = headerFields.join('|')

  return /(datum|date|amount|castka|částka|currency|mena|měna|reference|reservation|guest|payout|bookedat)/i.test(normalizedHeader)
}

function isPdfImageOnlyError(errorMessage: string | undefined): boolean {
  return String(errorMessage ?? '').includes('neobsahuje deterministicky čitelnou textovou vrstvu')
}

function isPdfTextExtractionUnavailableError(errorMessage: string | undefined): boolean {
  return String(errorMessage ?? '').includes('nepodporuje deterministickou dekompresi textového PDF streamu')
}
