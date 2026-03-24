import type { BrowserRuntimeInputFile, BrowserRuntimeUploadState } from './index.js'
import { buildBrowserRuntimeUploadStateFromFiles } from './browser-runtime-state.js'

interface BufferLikeConstructor {
  alloc(size: number): Uint8Array
  from(value: ArrayBuffer | ArrayLike<number> | string, encoding?: 'base64'): Uint8Array
  concat(chunks: Array<ArrayLike<number>>, totalLength?: number): Uint8Array
  isBuffer(value: unknown): boolean
}

export interface BrowserRuntimeBridge {
  buildRuntimeState(input: {
    files: BrowserRuntimeInputFile[]
    month?: string
    generatedAt: string
  }): Promise<BrowserRuntimeUploadState>
}

export async function buildBrowserRuntimeStateFromSelectedFiles(input: {
  files: BrowserRuntimeInputFile[]
  month?: string
  generatedAt: string
}): Promise<BrowserRuntimeUploadState> {
  ensureBrowserCompatibleBuffer()

  const uploadedFiles = await Promise.all(
    input.files.map(async (file) => {
      try {
        const uploadedFileContent = await readUploadedFileContent(file)

        return {
          name: file.name,
          content: uploadedFileContent.content,
          uploadedAt: input.generatedAt,
          binaryContentBase64: uploadedFileContent.binaryContentBase64,
          contentFormat: uploadedFileContent.contentFormat
        }
      } catch (error) {
        return {
          name: file.name,
          content: '',
          uploadedAt: input.generatedAt,
          contentFormat: inferContentFormatFromFileName(file.name),
          ingestError: error instanceof Error ? error.message : String(error)
        }
      }
    })
  )

  return buildBrowserRuntimeUploadStateFromFiles({
    files: uploadedFiles,
    runId: buildBrowserRuntimeRunId(input.month),
    generatedAt: input.generatedAt
  })
}

export function createBrowserRuntime(): BrowserRuntimeBridge {
  return {
    buildRuntimeState(input) {
      return buildBrowserRuntimeStateFromSelectedFiles(input)
    }
  }
}

async function readUploadedFileContent(file: BrowserRuntimeInputFile): Promise<{
  content: string
  binaryContentBase64?: string
  contentFormat: 'text' | 'pdf-text' | 'binary-workbook' | 'binary'
}> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const binaryContentBase64 = arrayBufferToBase64(buffer)

    if (looksLikePdfUpload(file.name, bytes)) {
      const content = await extractPdfTextFromBytes(bytes)

      if (!content.trim()) {
        throw new Error(`Nepodařilo se deterministicky extrahovat text z PDF souboru ${file.name}.`)
      }

      return {
        content,
        binaryContentBase64,
        contentFormat: 'pdf-text'
      }
    }

    return {
      content: decodeUploadedTextBytes(bytes),
      binaryContentBase64,
      contentFormat: file.name.toLowerCase().endsWith('.xlsx') ? 'binary-workbook' : 'binary'
    }
  }

  if (typeof file.text === 'function') {
    return {
      content: await file.text(),
      contentFormat: inferContentFormatFromFileName(file.name)
    }
  }

  return {
    content: '',
    contentFormat: inferContentFormatFromFileName(file.name)
  }
}

function decodeUploadedTextBytes(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return ''
  }

  const attempted = [
    decodeBytes(bytes, 'utf-8'),
    decodeBytes(bytes, 'windows-1250'),
    decodeBytes(bytes, 'iso-8859-2')
  ].filter((value): value is string => typeof value === 'string')

  const exactCzechHeader = 'Referenční kód'
  const bestMatch = attempted.find((value) => value.includes(exactCzechHeader))
  if (bestMatch) {
    return bestMatch
  }

  const usable = attempted.find((value) => !value.includes('�'))
  return usable ?? attempted[0] ?? fallbackDecodeBytesAsLatin1(bytes)
}

function decodeBytes(bytes: Uint8Array, encoding: string): string | undefined {
  if (typeof TextDecoder !== 'function') {
    return undefined
  }

  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes)
  } catch {
    return undefined
  }
}

function fallbackDecodeBytesAsLatin1(bytes: Uint8Array): string {
  let text = ''

  for (const byte of bytes) {
    text += String.fromCharCode(byte)
  }

  return text
}

function looksLikePdfUpload(fileName: string, bytes: Uint8Array): boolean {
  return fileName.toLowerCase().endsWith('.pdf')
    || (bytes.length >= 4
      && bytes[0] === 0x25
      && bytes[1] === 0x50
      && bytes[2] === 0x44
      && bytes[3] === 0x46)
}

function inferContentFormatFromFileName(fileName: string): 'text' | 'pdf-text' | 'binary-workbook' | 'binary' {
  const normalized = fileName.toLowerCase()

  if (normalized.endsWith('.pdf')) {
    return 'pdf-text'
  }

  if (normalized.endsWith('.xlsx')) {
    return 'binary-workbook'
  }

  return 'text'
}

function buildBrowserRuntimeRunId(month?: string): string {
  const suffix = month && month.trim() ? month.trim() : 'local'
  return `browser-runtime-upload-${suffix}`
}

async function extractPdfTextFromBytes(bytes: Uint8Array): Promise<string> {
  const binary = fallbackDecodeBytesAsLatin1(bytes)
  const streamMatches = Array.from(binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g))
  const textChunks: string[] = []

  for (const match of streamMatches) {
    const streamContent = match[1]
    const streamStart = match.index ?? -1
    const headerSnippet = streamStart === -1
      ? ''
      : binary.slice(Math.max(0, streamStart - 200), streamStart)
    const streamBytes = Uint8Array.from((streamContent ?? '').split('').map((char) => char.charCodeAt(0)))
    const decodedStream = headerSnippet.includes('/FlateDecode')
      ? await inflatePdfStream(streamBytes)
      : fallbackDecodeBytesAsLatin1(streamBytes)

    textChunks.push(...extractPdfLiteralStrings(decodedStream))
  }

  if (textChunks.length === 0) {
    textChunks.push(...extractPdfLiteralStrings(binary))
  }

  return textChunks
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

async function inflatePdfStream(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream !== 'function') {
    return fallbackDecodeBytesAsLatin1(bytes)
  }

  try {
    const streamBytes = bytes.slice().buffer
    const stream = new Blob([streamBytes]).stream().pipeThrough(new DecompressionStream('deflate'))
    const buffer = await new Response(stream).arrayBuffer()
    return fallbackDecodeBytesAsLatin1(new Uint8Array(buffer))
  } catch {
    return fallbackDecodeBytesAsLatin1(bytes)
  }
}

function extractPdfLiteralStrings(content: string): string[] {
  const matches = [
    ...Array.from(content.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)).map((match) => match[0]),
    ...Array.from(content.matchAll(/\[(.*?)\]\s*TJ/gs)).map((match) => match[1] ?? '')
  ]

  return matches.flatMap((segment) =>
    Array.from(segment.matchAll(/\((?:\\.|[^\\()])*\)/g)).map((match) =>
      decodePdfLiteralString(match[0].slice(1, -1))
    )
  )
}

function decodePdfLiteralString(value: string): string {
  return value
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
}

function ensureBrowserCompatibleBuffer(): void {
  const globalScope = globalThis as typeof globalThis & { Buffer?: unknown }

  const existingBuffer = globalScope.Buffer as unknown as BufferLikeConstructor | undefined

  if (typeof existingBuffer?.alloc === 'function' && typeof existingBuffer?.from === 'function') {
    return
  }

  ; (globalScope as { Buffer?: unknown }).Buffer = createBrowserSafeBufferShim()
}

function createBrowserSafeBufferShim(): BufferLikeConstructor {
  return {
    alloc(size: number) {
      return new Uint8Array(size)
    },
    from(value: ArrayBuffer | ArrayLike<number> | string, encoding?: 'base64') {
      if (typeof value === 'string') {
        if (encoding === 'base64') {
          return base64ToUint8Array(value)
        }

        const bytes = new Uint8Array(value.length)
        for (let index = 0; index < value.length; index += 1) {
          bytes[index] = value.charCodeAt(index) & 0xff
        }
        return bytes
      }

      if (value instanceof ArrayBuffer) {
        return new Uint8Array(value)
      }

      return Uint8Array.from(value)
    },
    concat(chunks: Array<ArrayLike<number>>, totalLength?: number) {
      const normalized = chunks.map((chunk) => chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk))
      const size = totalLength ?? normalized.reduce((sum, chunk) => sum + chunk.length, 0)
      const merged = new Uint8Array(size)
      let offset = 0

      for (const chunk of normalized) {
        merged.set(chunk, offset)
        offset += chunk.length
      }

      return merged
    },
    isBuffer(value: unknown) {
      return value instanceof Uint8Array
    }
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  if (typeof btoa === 'function') {
    return btoa(binary)
  }

  throw new Error('Browser runtime base64 conversion requires btoa support.')
}

function base64ToUint8Array(value: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new Error('Browser runtime base64 decoding requires atob support.')
  }

  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
