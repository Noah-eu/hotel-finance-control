import type {
  UploadedMonthlyFile,
  UploadedMonthlyFileCapabilityAssessment,
  UploadedMonthlyFileDecisionConfidence,
  UploadedMonthlyFileIngestionBranch
} from './contracts'

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

  if (sourceDescriptorCapability) {
    return sourceDescriptorCapability
  }

  if (input.contentFormat === 'binary-workbook' || fileName.endsWith('.xlsx')) {
    return buildCapability('structured_tabular', 'strong', ['binary-workbook-upload'])
  }

  if (looksLikePdf(input)) {
    if (trimmedContent.length > 0) {
      return buildCapability('pdf_text_layer', 'strong', [
        'pdf-upload',
        'text-layer-extracted',
        ...(extraction?.detectedSignatures ?? [])
      ])
    }

    if (isPdfImageOnlyError(input.ingestError)) {
      return buildCapability('pdf_image_only', 'strong', ['pdf-upload', 'text-layer-missing'])
    }

    if (isPdfTextExtractionUnavailableError(input.ingestError)) {
      return buildCapability('pdf_text_layer', 'hint', ['pdf-upload', 'text-extraction-unavailable'])
    }

    return buildCapability('unknown', 'hint', ['pdf-upload'])
  }

  if (looksLikeImageUpload(fileName, mimeType)) {
    const receiptLike = looksExpenseLikeDocumentName(fileName)

    return buildCapability(
      'image_receipt_like',
      receiptLike ? 'hint' : 'none',
      receiptLike
        ? ['image-upload', 'expense-document-name']
        : ['image-upload']
    )
  }

  if (input.contentFormat === 'binary' || mimeType === 'application/octet-stream') {
    return buildCapability('unsupported_binary', 'strong', ['binary-upload'])
  }

  if (looksLikeStructuredTabularContent(headerFields, trimmedContent)) {
    return buildCapability('structured_tabular', 'strong', [
      'delimited-header',
      ...(headerFields.length > 0 ? ['header-fields-present'] : [])
    ])
  }

  if (trimmedContent.length > 0 && looksExpenseLikeDocumentName(fileName)) {
    return buildCapability('text_document', 'hint', ['text-document-name'])
  }

  if (trimmedContent.length > 0 && /[:]/.test(trimmedContent)) {
    return buildCapability('text_document', 'hint', ['labeled-text-content'])
  }

  return buildCapability('unknown', 'none', [])
}

export function resolveUploadedMonthlyFileIngestionBranch(
  capability: UploadedMonthlyFileCapabilityAssessment
): UploadedMonthlyFileIngestionBranch {
  switch (capability.profile) {
    case 'structured_tabular':
      return 'structured-parser'
    case 'text_document':
      return 'text-document-parser'
    case 'pdf_text_layer':
      return 'text-pdf-parser'
    case 'pdf_image_only':
    case 'image_receipt_like':
      return 'ocr-required'
    case 'unsupported_binary':
    case 'unknown':
    default:
      return 'unsupported'
  }
}

function buildCapability(
  profile: UploadedMonthlyFileCapabilityAssessment['profile'],
  confidence: UploadedMonthlyFileDecisionConfidence,
  evidence: string[]
): UploadedMonthlyFileCapabilityAssessment {
  return {
    profile,
    confidence,
    evidence
  }
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
