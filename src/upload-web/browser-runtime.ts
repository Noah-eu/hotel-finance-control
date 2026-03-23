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
      const uploadedFileContent = await readUploadedFileContent(file)

      return {
        name: file.name,
        content: uploadedFileContent.content,
        uploadedAt: input.generatedAt,
        binaryContentBase64: uploadedFileContent.binaryContentBase64
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
}> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    return {
      content: decodeUploadedTextBytes(bytes),
      binaryContentBase64: arrayBufferToBase64(buffer)
    }
  }

  if (typeof file.text === 'function') {
    return {
      content: await file.text()
    }
  }

  return {
    content: ''
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

function buildBrowserRuntimeRunId(month?: string): string {
  const suffix = month && month.trim() ? month.trim() : 'local'
  return `browser-runtime-upload-${suffix}`
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
