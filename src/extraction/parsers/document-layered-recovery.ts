import type {
  DeterministicDocumentFieldConfidence,
  DeterministicDocumentFieldProvenance,
  DeterministicDocumentFinalStatus,
  DeterministicDocumentOcrOrVisionFallbackPayload,
  DeterministicDocumentOcrParsedFields
} from '../contracts'

export interface DocumentOcrOrVisionFallbackResult {
  detected: boolean
  adapter?: 'ocr' | 'vision'
  rawPayload?: string
  parsedFields?: DeterministicDocumentOcrParsedFields
}

interface ParsedOcrStubPayload {
  documentKind?: 'invoice' | 'receipt'
  adapter: 'ocr' | 'vision'
  fields: DeterministicDocumentOcrParsedFields
}

const HIDDEN_PAYLOAD_MARKERS = [
  { prefix: 'HFC_OCR_STUB:', adapter: 'ocr' as const },
  { prefix: 'HFC_VISION_STUB:', adapter: 'vision' as const }
]

export function decodeBase64ToLatin1(value: string): string | undefined {
  try {
    if (typeof atob === 'function') {
      return atob(value)
    }
  } catch {
    // Fall through to Buffer for Node-based tests.
  }

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('latin1')
    }
  } catch {
    return undefined
  }

  return undefined
}

function decodeBase64ToUtf8(value: string): string | undefined {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8')
    }
  } catch {
    // Fall back to browser decoder below.
  }

  try {
    if (typeof atob === 'function' && typeof TextDecoder === 'function') {
      const binary = atob(value)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }
  } catch {
    return undefined
  }

  return undefined
}

export function extractDocumentOcrOrVisionFallback(input: {
  content: string
  binaryContentBase64?: string
  documentKind: 'invoice' | 'receipt'
  prefetchedFallback?: DeterministicDocumentOcrOrVisionFallbackPayload
}): DocumentOcrOrVisionFallbackResult {
  if (input.prefetchedFallback?.parsedFields) {
    return {
      detected: true,
      adapter: input.prefetchedFallback.adapter,
      rawPayload: input.prefetchedFallback.rawPayload,
      parsedFields: input.prefetchedFallback.parsedFields
    }
  }

  const sources = [
    input.content,
    input.binaryContentBase64 ? decodeBase64ToLatin1(input.binaryContentBase64) : undefined
  ]

  for (const source of sources) {
    if (!source) {
      continue
    }

    for (const marker of HIDDEN_PAYLOAD_MARKERS) {
      const encodedPayload = extractHiddenPayloadCandidate(source, marker.prefix)

      if (!encodedPayload) {
        continue
      }

      const parsedPayload = parseOcrStubPayload(encodedPayload, marker.adapter)

      if (!parsedPayload || (parsedPayload.documentKind && parsedPayload.documentKind !== input.documentKind)) {
        continue
      }

      return {
        detected: true,
        adapter: parsedPayload.adapter,
        rawPayload: encodedPayload,
        parsedFields: parsedPayload.fields
      }
    }
  }

  return {
    detected: false
  }
}

export function resolveDocumentFinalStatus(input: {
  missingRequiredFields: string[]
  hasMeaningfulFields: boolean
  hasFallbackBinaryEvidence: boolean
}): DeterministicDocumentFinalStatus {
  if (input.missingRequiredFields.length === 0 && input.hasMeaningfulFields) {
    return 'parsed'
  }

  if (input.hasMeaningfulFields || input.hasFallbackBinaryEvidence) {
    return 'needs_review'
  }

  return 'failed'
}

export function deriveFieldConfidence(
  provenance: DeterministicDocumentFieldProvenance | undefined,
  hasValue: boolean
): DeterministicDocumentFieldConfidence {
  if (!hasValue) {
    return 'none'
  }

  switch (provenance) {
    case 'text':
    case 'text+qr-confirmed':
      return 'strong'
    case 'qr':
    case 'ocr':
    case 'vision':
    case 'inferred':
      return 'hint'
    default:
      return 'hint'
  }
}

function extractHiddenPayloadCandidate(source: string, prefix: string): string | undefined {
  const normalizedSource = source.replace(/\u0000/g, '')
  const markerIndex = normalizedSource.indexOf(prefix)

  if (markerIndex === -1) {
    return undefined
  }

  const tail = normalizedSource.slice(markerIndex + prefix.length)
  const match = tail.match(/^[A-Za-z0-9+/=]+/)

  return match?.[0]
}

function parseOcrStubPayload(
  encodedPayload: string,
  adapter: 'ocr' | 'vision'
): ParsedOcrStubPayload | undefined {
  try {
    const decodedPayload = decodeBase64ToUtf8(encodedPayload)

    if (!decodedPayload) {
      return undefined
    }

    const parsed = JSON.parse(decodedPayload) as Record<string, unknown>

    if ('fields' in parsed && parsed.fields && typeof parsed.fields === 'object') {
      return {
        documentKind: parsed.documentKind === 'invoice' || parsed.documentKind === 'receipt'
          ? parsed.documentKind
          : undefined,
        adapter: parsed.adapter === 'vision' ? 'vision' : adapter,
        fields: parsed.fields as DeterministicDocumentOcrParsedFields
      }
    }

    return {
      adapter,
      fields: parsed as DeterministicDocumentOcrParsedFields
    }
  } catch {
    return undefined
  }
}
