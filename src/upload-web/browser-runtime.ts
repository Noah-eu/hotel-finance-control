import type { BrowserRuntimeInputFile, BrowserRuntimeProgressUpdate, BrowserRuntimeUploadState } from './index.js'
import { buildBrowserRuntimeUploadStateFromFilesProgressively } from './browser-runtime-state.js'
import { resolveRuntimeBuildInfo } from '../shared/build-provenance.js'
import type { UploadedMonthlyFile } from '../monthly-batch/contracts.js'
import type { PreviousMonthCarryoverSource } from '../reconciliation/contracts.js'
import { detectUploadedMonthlyFileCapability } from '../monthly-batch/capabilities.js'
import { detectBookingPayoutStatementSignals } from '../extraction/index.js'
import {
  buildBrowserWorkspaceExcelExport,
  type BrowserWorkspaceExcelExportArtifact,
  type MonthlyWorkspaceExportPreset
} from '../export/browser.js'

interface BufferLikeConstructor {
  alloc(size: number): Uint8Array
  from(value: ArrayBuffer | ArrayLike<number> | string, encoding?: 'base64'): Uint8Array
  concat(chunks: Array<ArrayLike<number>>, totalLength?: number): Uint8Array
  isBuffer(value: unknown): boolean
}

interface PdfIndirectObject {
  id: string
  dictionary: string
  rawStream?: string
}

interface PdfFontDecoder {
  codePointMap: Map<string, string>
  codeHexLengths: number[]
}

interface PdfTextExtractionContext {
  fontDecodersByResourceName: Map<string, PdfFontDecoder>
  fallbackFontDecoder?: PdfFontDecoder
}

interface PdfContentToken {
  type: 'name' | 'string' | 'hex' | 'array' | 'word'
  value: string
}

export interface BrowserRuntimeBridge {
  buildRuntimeState(input: {
    files: BrowserRuntimeInputFile[]
    month?: string
    generatedAt: string
    previousMonthCarryoverSource?: PreviousMonthCarryoverSource
    onProgress?: (progress: BrowserRuntimeProgressUpdate) => void
  }): Promise<BrowserRuntimeUploadState>
}

export function buildBrowserRuntimeWorkspaceExcelExport(input: {
  state: BrowserRuntimeUploadState
  preset: MonthlyWorkspaceExportPreset
}): BrowserWorkspaceExcelExportArtifact {
  return buildBrowserWorkspaceExcelExport(input)
}

export async function buildBrowserRuntimeStateFromSelectedFiles(input: {
  files: BrowserRuntimeInputFile[]
  month?: string
  generatedAt: string
  previousMonthCarryoverSource?: PreviousMonthCarryoverSource
  onProgress?: (progress: BrowserRuntimeProgressUpdate) => void
}): Promise<BrowserRuntimeUploadState> {
  ensureBrowserCompatibleBuffer()
  const uploadedFiles = await prepareBrowserRuntimeUploadedFilesFromSelectedFiles(input)

  return buildBrowserRuntimeUploadStateFromFilesProgressively({
    files: uploadedFiles,
    runId: buildBrowserRuntimeRunId(input.month),
    generatedAt: input.generatedAt,
    previousMonthCarryoverSource: input.previousMonthCarryoverSource,
    runtimeBuildInfo: resolveRuntimeBuildInfo({
      generatedAt: input.generatedAt,
      runtimeModuleVersion: resolveLoadedRuntimeModuleVersion(),
      fallbackBuildSource: 'browser-runtime'
    })
  }, {
    onProgress: input.onProgress
  })
}

function resolveLoadedRuntimeModuleVersion(): string {
  try {
    const moduleUrl = typeof import.meta !== 'undefined' ? import.meta.url : ''
    const normalizedUrl = String(moduleUrl || '')
    const fileName = normalizedUrl.split('/').pop() ?? normalizedUrl

    return fileName.replace(/\.js(?:\?.*)?$/, '') || 'browser-runtime'
  } catch {
    return 'browser-runtime'
  }
}

export function createBrowserRuntime(): BrowserRuntimeBridge {
  return {
    buildRuntimeState(input) {
      return buildBrowserRuntimeStateFromSelectedFiles(input)
    }
  }
}

export async function prepareBrowserRuntimeUploadedFilesFromSelectedFiles(input: {
  files: BrowserRuntimeInputFile[]
  generatedAt: string
  onProgress?: (progress: BrowserRuntimeProgressUpdate) => void
}): Promise<UploadedMonthlyFile[]> {
  ensureBrowserCompatibleBuffer()

  const uploadedFiles: UploadedMonthlyFile[] = []

  for (let index = 0; index < input.files.length; index += 1) {
    const file = input.files[index]!
    uploadedFiles.push(await prepareBrowserRuntimeUploadedFileFromSelectedFile(file, input.generatedAt))
    input.onProgress?.({
      stage: 'preparing-selected-files',
      totalFiles: input.files.length,
      completedFiles: index + 1,
      currentFileName: file.name,
      currentFileStatus: uploadedFiles[index]?.ingestError ? 'error' : 'supported'
    })

    if (index + 1 < input.files.length) {
      await yieldBrowserRuntimePreparationWork()
    }
  }

  return uploadedFiles
}

async function prepareBrowserRuntimeUploadedFileFromSelectedFile(
  file: BrowserRuntimeInputFile,
  generatedAt: string
): Promise<UploadedMonthlyFile> {
  try {
    const uploadedFileContent = await readUploadedFileContent(file)
    const sourceDescriptor = {
      mimeType: normalizeMimeType(file.type),
      browserTextExtraction: {
        mode: uploadedFileContent.contentFormat,
        status: 'extracted' as const,
        textPreview: uploadedFileContent.content.slice(0, 240),
        detectedSignatures: uploadedFileContent.detectedSignatures
      }
    }
    const capability = detectUploadedMonthlyFileCapability({
      fileName: file.name,
      content: uploadedFileContent.content,
      binaryContentBase64: uploadedFileContent.binaryContentBase64,
      contentFormat: uploadedFileContent.contentFormat,
      sourceDescriptor
    })

    return {
      name: file.name,
      content: uploadedFileContent.content,
      uploadedAt: generatedAt,
      binaryContentBase64: uploadedFileContent.binaryContentBase64,
      contentFormat: uploadedFileContent.contentFormat,
      sourceDescriptor: {
        ...sourceDescriptor,
        capability
      }
    }
  } catch (error) {
    const contentFormat = inferContentFormatFromFileName(file.name)
    const ingestError = error instanceof Error ? error.message : String(error)
    let binaryContentBase64: string | undefined

    if (typeof file.arrayBuffer === 'function') {
      try {
        binaryContentBase64 = arrayBufferToBase64(await file.arrayBuffer())
      } catch {
        binaryContentBase64 = undefined
      }
    }

    const sourceDescriptor = {
      mimeType: normalizeMimeType(file.type),
      browserTextExtraction: {
        mode: contentFormat,
        status: 'failed' as const,
        detectedSignatures: []
      }
    }
    const capability = detectUploadedMonthlyFileCapability({
      fileName: file.name,
      content: '',
      binaryContentBase64,
      contentFormat,
      sourceDescriptor,
      ingestError
    })

    return {
      name: file.name,
      content: '',
      uploadedAt: generatedAt,
      binaryContentBase64,
      contentFormat,
      sourceDescriptor: {
        ...sourceDescriptor,
        capability
      },
      ingestError
    }
  }
}

async function yieldBrowserRuntimePreparationWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function readUploadedFileContent(file: BrowserRuntimeInputFile): Promise<{
  content: string
  binaryContentBase64?: string
  contentFormat: 'text' | 'pdf-text' | 'binary-workbook' | 'binary'
  detectedSignatures: string[]
}> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const binaryContentBase64 = arrayBufferToBase64(buffer)

    if (looksLikePdfUpload(file.name, bytes)) {
      const content = await extractPdfTextFromBytes(bytes, file.name)

      return {
        content,
        binaryContentBase64,
        contentFormat: 'pdf-text',
        detectedSignatures: detectPdfTextSignatures(content)
      }
    }

    return {
      content: decodeUploadedTextBytes(bytes),
      binaryContentBase64,
      contentFormat: inferUploadedBytesContentFormat(file.name, normalizeMimeType(file.type)),
      detectedSignatures: []
    }
  }

  if (typeof file.text === 'function') {
    return {
      content: await file.text(),
      contentFormat: inferContentFormatFromFileName(file.name),
      detectedSignatures: []
    }
  }

  return {
    content: '',
    contentFormat: inferContentFormatFromFileName(file.name),
    detectedSignatures: []
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

function inferUploadedBytesContentFormat(
  fileName: string,
  mimeType: string | undefined
): 'text' | 'pdf-text' | 'binary-workbook' | 'binary' {
  const normalizedFileName = fileName.toLowerCase()
  const normalizedMime = mimeType?.toLowerCase()

  if (normalizedFileName.endsWith('.pdf') || normalizedMime === 'application/pdf') {
    return 'pdf-text'
  }

  if (normalizedFileName.endsWith('.xlsx')) {
    return 'binary-workbook'
  }

  if (
    normalizedMime?.startsWith('text/')
    || normalizedMime === 'application/csv'
    || normalizedMime === 'text/csv'
    || normalizedMime === 'application/vnd.ms-excel'
    || normalizedFileName.endsWith('.csv')
    || normalizedFileName.endsWith('.txt')
    || normalizedFileName.endsWith('.tsv')
  ) {
    return 'text'
  }

  return 'binary'
}

function buildBrowserRuntimeRunId(month?: string): string {
  const suffix = month && month.trim() ? month.trim() : 'local'
  return `browser-runtime-upload-${suffix}`
}

async function extractPdfTextFromBytes(bytes: Uint8Array, fileName: string): Promise<string> {
  const binary = fallbackDecodeBytesAsLatin1(bytes)
  const textExtractionContext = await buildPdfTextExtractionContext(binary)
  const streamMatches = Array.from(binary.matchAll(/stream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)endstream/g))
  const textChunks: string[] = []
  let sawCompressedStream = false
  let sawUnsupportedDecompression = false

  for (const match of streamMatches) {
    const streamContent = match[1]
    const streamStart = match.index ?? -1
    const headerSnippet = streamStart === -1
      ? ''
      : binary.slice(Math.max(0, streamStart - 200), streamStart)
    const streamBytes = Uint8Array.from((streamContent ?? '').split('').map((char) => char.charCodeAt(0)))
    const isFlateEncoded = headerSnippet.includes('/FlateDecode')
    sawCompressedStream ||= isFlateEncoded

    const decodedStream = isFlateEncoded
      ? await inflatePdfStream(streamBytes)
      : fallbackDecodeBytesAsLatin1(streamBytes)

    if (decodedStream === undefined) {
      sawUnsupportedDecompression = true
      continue
    }

    textChunks.push(...extractPdfTextStrings(decodedStream, textExtractionContext))
  }

  if (textChunks.length === 0) {
    textChunks.push(...extractPdfTextStrings(binary, textExtractionContext))
  }

  const normalizedText = textChunks
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')

  if (normalizedText) {
    return normalizedText
  }

  if (sawCompressedStream && sawUnsupportedDecompression) {
    throw new Error(`Browser runtime nepodporuje deterministickou dekompresi textového PDF streamu pro ${fileName}.`)
  }

  throw new Error(`PDF soubor ${fileName} neobsahuje deterministicky čitelnou textovou vrstvu.`)
}

async function inflatePdfStream(bytes: Uint8Array): Promise<string | undefined> {
  if (typeof DecompressionStream !== 'function') {
    return undefined
  }

  const inflatedWithDeflate = await inflatePdfStreamWithFormat(bytes, 'deflate')

  if (inflatedWithDeflate !== undefined) {
    return inflatedWithDeflate
  }

  const inflatedWithDeflateRaw = await inflatePdfStreamWithFormat(bytes, 'deflate-raw')

  if (inflatedWithDeflateRaw !== undefined) {
    return inflatedWithDeflateRaw
  }

  return fallbackDecodeBytesAsLatin1(bytes)
}

async function inflatePdfStreamWithFormat(
  bytes: Uint8Array,
  format: 'deflate' | 'deflate-raw'
): Promise<string | undefined> {
  try {
    const streamBytes = bytes.slice().buffer
    const stream = new Blob([streamBytes]).stream().pipeThrough(new DecompressionStream(format))
    const buffer = await new Response(stream).arrayBuffer()
    return fallbackDecodeBytesAsLatin1(new Uint8Array(buffer))
  } catch {
    return undefined
  }
}

async function buildPdfTextExtractionContext(binary: string): Promise<PdfTextExtractionContext> {
  const objects = parsePdfIndirectObjects(binary)
  const objectsById = new Map(objects.map((object) => [object.id, object]))
  const fontObjectIdsByResourceName = new Map<string, string>()

  for (const object of objects) {
    const fontBlock = extractNamedDictionaryBlock(object.dictionary, '/Font')

    if (!fontBlock) {
      continue
    }

    for (const match of fontBlock.matchAll(/\/([^\s/<>\[\]()%]+)\s+(\d+)\s+(\d+)\s+R/g)) {
      const resourceName = match[1]?.trim()
      const objectId = match[2] && match[3] ? `${match[2]} ${match[3]}` : undefined

      if (resourceName && objectId) {
        fontObjectIdsByResourceName.set(resourceName, objectId)
      }
    }
  }

  const fontDecodersByObjectId = new Map<string, PdfFontDecoder>()

  for (const object of objects) {
    const toUnicodeReference = extractIndirectObjectReference(object.dictionary, '/ToUnicode')

    if (!toUnicodeReference) {
      continue
    }

    const toUnicodeObject = objectsById.get(toUnicodeReference)
    const decodedToUnicodeStream = await decodePdfIndirectObjectStream(toUnicodeObject)

    if (!decodedToUnicodeStream) {
      continue
    }

    const codePointMap = parseToUnicodeCMap(decodedToUnicodeStream)

    if (codePointMap.size === 0) {
      continue
    }

    fontDecodersByObjectId.set(object.id, {
      codePointMap,
      codeHexLengths: Array.from(new Set(Array.from(codePointMap.keys()).map((value) => value.length))).sort((left, right) => right - left)
    })
  }

  const fontDecodersByResourceName = new Map<string, PdfFontDecoder>()

  for (const [resourceName, objectId] of fontObjectIdsByResourceName.entries()) {
    const fontDecoder = fontDecodersByObjectId.get(objectId)

    if (fontDecoder) {
      fontDecodersByResourceName.set(resourceName, fontDecoder)
    }
  }

  return {
    fontDecodersByResourceName,
    fallbackFontDecoder: fontDecodersByResourceName.size === 1
      ? Array.from(fontDecodersByResourceName.values())[0]
      : undefined
  }
}

function parsePdfIndirectObjects(binary: string): PdfIndirectObject[] {
  return Array.from(binary.matchAll(/(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g)).map((match) => {
    const objectBody = match[3] ?? ''
    const streamMatch = objectBody.match(/([\s\S]*?)stream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)endstream/)

    return {
      id: `${match[1]} ${match[2]}`,
      dictionary: (streamMatch?.[1] ?? objectBody).trim(),
      rawStream: streamMatch?.[2]
    }
  })
}

function extractNamedDictionaryBlock(content: string, key: string): string | undefined {
  const keyIndex = content.indexOf(key)

  if (keyIndex === -1) {
    return undefined
  }

  const dictionaryStart = content.indexOf('<<', keyIndex)

  if (dictionaryStart === -1) {
    return undefined
  }

  let depth = 0

  for (let index = dictionaryStart; index < content.length - 1; index += 1) {
    const pair = content.slice(index, index + 2)

    if (pair === '<<') {
      depth += 1
      index += 1
      continue
    }

    if (pair === '>>') {
      depth -= 1

      if (depth === 0) {
        return content.slice(dictionaryStart + 2, index).trim()
      }

      index += 1
    }
  }

  return undefined
}

function extractIndirectObjectReference(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`${escapeRegExp(key)}\\s+(\\d+)\\s+(\\d+)\\s+R`))

  if (!match?.[1] || !match[2]) {
    return undefined
  }

  return `${match[1]} ${match[2]}`
}

async function decodePdfIndirectObjectStream(object: PdfIndirectObject | undefined): Promise<string | undefined> {
  if (!object?.rawStream) {
    return undefined
  }

  const streamBytes = Uint8Array.from(object.rawStream.split('').map((char) => char.charCodeAt(0)))
  const isFlateEncoded = /\/FlateDecode\b/.test(object.dictionary)

  if (!isFlateEncoded) {
    return fallbackDecodeBytesAsLatin1(streamBytes)
  }

  return inflatePdfStream(streamBytes)
}

function parseToUnicodeCMap(content: string): Map<string, string> {
  const mappings = new Map<string, string>()

  for (const blockMatch of content.matchAll(/beginbfchar\s*([\s\S]*?)\s*endbfchar/g)) {
    for (const lineMatch of (blockMatch[1] ?? '').matchAll(/<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>/g)) {
      const sourceCode = lineMatch[1]?.toUpperCase()
      const unicodeValue = decodeToUnicodeHex(lineMatch[2] ?? '')

      if (sourceCode && unicodeValue) {
        mappings.set(sourceCode, unicodeValue)
      }
    }
  }

  for (const blockMatch of content.matchAll(/beginbfrange\s*([\s\S]*?)\s*endbfrange/g)) {
    for (const line of (blockMatch[1] ?? '').split(/\r?\n/)) {
      const normalizedLine = line.trim()

      if (!normalizedLine) {
        continue
      }

      const directRangeMatch = normalizedLine.match(/^<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>$/)

      if (directRangeMatch?.[1] && directRangeMatch[2] && directRangeMatch[3]) {
        addToUnicodeDirectRange(mappings, directRangeMatch[1], directRangeMatch[2], directRangeMatch[3])
        continue
      }

      const arrayRangeMatch = normalizedLine.match(/^<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>\s*\[(.*)\]$/)

      if (arrayRangeMatch?.[1] && arrayRangeMatch[2] && arrayRangeMatch[3] !== undefined) {
        addToUnicodeArrayRange(mappings, arrayRangeMatch[1], arrayRangeMatch[2], arrayRangeMatch[3])
      }
    }
  }

  return mappings
}

function addToUnicodeDirectRange(
  mappings: Map<string, string>,
  startHex: string,
  endHex: string,
  targetHex: string
) {
  const start = Number.parseInt(startHex, 16)
  const end = Number.parseInt(endHex, 16)
  let targetCodePoint = Number.parseInt(targetHex, 16)
  const sourceLength = startHex.length

  for (let code = start; code <= end; code += 1) {
    mappings.set(code.toString(16).toUpperCase().padStart(sourceLength, '0'), String.fromCodePoint(targetCodePoint))
    targetCodePoint += 1
  }
}

function addToUnicodeArrayRange(
  mappings: Map<string, string>,
  startHex: string,
  endHex: string,
  targetsExpression: string
) {
  const targets = Array.from(targetsExpression.matchAll(/<([\dA-Fa-f]+)>/g))
    .map((match) => decodeToUnicodeHex(match[1] ?? ''))
    .filter(Boolean)
  const start = Number.parseInt(startHex, 16)
  const end = Number.parseInt(endHex, 16)
  const sourceLength = startHex.length

  for (let offset = 0; start + offset <= end && offset < targets.length; offset += 1) {
    mappings.set((start + offset).toString(16).toUpperCase().padStart(sourceLength, '0'), targets[offset]!)
  }
}

function decodeToUnicodeHex(value: string): string {
  const normalized = value.replace(/\s+/g, '')

  if (!normalized) {
    return ''
  }

  const evenLengthValue = normalized.length % 2 === 0 ? normalized : `${normalized}0`
  const bytes = new Uint8Array(evenLengthValue.length / 2)

  for (let index = 0; index < evenLengthValue.length; index += 2) {
    bytes[index / 2] = Number.parseInt(evenLengthValue.slice(index, index + 2), 16)
  }

  if (bytes.length % 2 === 0 && bytes.length >= 2) {
    return decodeUtf16Bytes(bytes, 'be')
  }

  return decodePdfTextBytes(bytes)
}

function extractPdfTextStrings(content: string, context?: PdfTextExtractionContext): string[] {
  const tokens = tokenizePdfContent(content)
  const extracted: string[] = []
  const operands: PdfContentToken[] = []
  let currentFontDecoder: PdfFontDecoder | undefined = context?.fallbackFontDecoder

  for (const token of tokens) {
    if (token.type !== 'word') {
      operands.push(token)
      continue
    }

    if (looksLikePdfNumericToken(token.value)) {
      operands.push(token)
      continue
    }

    if (token.value === 'Tf') {
      const fontToken = [...operands].reverse().find((operand) => operand.type === 'name')
      currentFontDecoder = fontToken
        ? context?.fontDecodersByResourceName.get(fontToken.value) ?? context?.fallbackFontDecoder
        : context?.fallbackFontDecoder
      operands.length = 0
      continue
    }

    if (token.value === 'Tj' || token.value === '\'') {
      const textToken = [...operands].reverse().find((operand) => operand.type === 'string' || operand.type === 'hex')

      if (textToken) {
        extracted.push(decodePdfTextToken(textToken.value, currentFontDecoder))
      }

      operands.length = 0
      continue
    }

    if (token.value === '"') {
      const textToken = [...operands].reverse().find((operand) => operand.type === 'string' || operand.type === 'hex')

      if (textToken) {
        extracted.push(decodePdfTextToken(textToken.value, currentFontDecoder))
      }

      operands.length = 0
      continue
    }

    if (token.value === 'TJ') {
      const arrayToken = [...operands].reverse().find((operand) => operand.type === 'array')

      if (arrayToken) {
        extracted.push(...decodePdfTextArrayToken(arrayToken.value, currentFontDecoder))
      }

      operands.length = 0
      continue
    }

    operands.length = 0
  }

  return extracted.filter(Boolean)
}

function looksLikePdfNumericToken(value: string): boolean {
  return /^[-+]?(?:\d+|\d*\.\d+)$/.test(value)
}

function tokenizePdfContent(content: string): PdfContentToken[] {
  const tokens: PdfContentToken[] = []
  let index = 0

  while (index < content.length) {
    const character = content[index]

    if (!character) {
      break
    }

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (character === '%') {
      while (index < content.length && content[index] !== '\n' && content[index] !== '\r') {
        index += 1
      }
      continue
    }

    if (character === '(') {
      const nextIndex = findPdfLiteralStringEnd(content, index)
      tokens.push({ type: 'string', value: content.slice(index, nextIndex) })
      index = nextIndex
      continue
    }

    if (character === '[') {
      const nextIndex = findPdfArrayEnd(content, index)
      tokens.push({ type: 'array', value: content.slice(index, nextIndex) })
      index = nextIndex
      continue
    }

    if (character === '<' && content[index + 1] !== '<') {
      const nextIndex = findPdfHexStringEnd(content, index)
      tokens.push({ type: 'hex', value: content.slice(index, nextIndex) })
      index = nextIndex
      continue
    }

    if (character === '/') {
      let nextIndex = index + 1

      while (nextIndex < content.length && !isPdfDelimiter(content[nextIndex]!)) {
        nextIndex += 1
      }

      tokens.push({ type: 'name', value: content.slice(index + 1, nextIndex) })
      index = nextIndex
      continue
    }

    if (character === '\'' || character === '"') {
      tokens.push({ type: 'word', value: character })
      index += 1
      continue
    }

    let nextIndex = index + 1

    while (nextIndex < content.length && !isPdfDelimiter(content[nextIndex]!)) {
      nextIndex += 1
    }

    tokens.push({ type: 'word', value: content.slice(index, nextIndex) })
    index = nextIndex
  }

  return tokens
}

function findPdfLiteralStringEnd(content: string, startIndex: number): number {
  let index = startIndex + 1
  let depth = 1

  while (index < content.length) {
    const character = content[index]

    if (character === '\\') {
      index += 2
      continue
    }

    if (character === '(') {
      depth += 1
      index += 1
      continue
    }

    if (character === ')') {
      depth -= 1
      index += 1

      if (depth === 0) {
        return index
      }

      continue
    }

    index += 1
  }

  return content.length
}

function findPdfArrayEnd(content: string, startIndex: number): number {
  let index = startIndex + 1
  let depth = 1

  while (index < content.length) {
    const character = content[index]

    if (character === '(') {
      index = findPdfLiteralStringEnd(content, index)
      continue
    }

    if (character === '<' && content[index + 1] !== '<') {
      index = findPdfHexStringEnd(content, index)
      continue
    }

    if (character === '[') {
      depth += 1
      index += 1
      continue
    }

    if (character === ']') {
      depth -= 1
      index += 1

      if (depth === 0) {
        return index
      }

      continue
    }

    index += 1
  }

  return content.length
}

function findPdfHexStringEnd(content: string, startIndex: number): number {
  let index = startIndex + 1

  while (index < content.length && content[index] !== '>') {
    index += 1
  }

  return Math.min(index + 1, content.length)
}

function isPdfDelimiter(value: string): boolean {
  return /\s/.test(value) || '[]<>()/%'.includes(value)
}

function decodePdfTextToken(value: string, fontDecoder?: PdfFontDecoder): string {
  if (!value) {
    return ''
  }

  if (value.startsWith('(') && value.endsWith(')')) {
    return decodePdfLiteralString(value.slice(1, -1), fontDecoder)
  }

  if (value.startsWith('<') && value.endsWith('>')) {
    return decodePdfHexString(value.slice(1, -1), fontDecoder)
  }

  return ''
}

function decodePdfTextArrayToken(value: string, fontDecoder?: PdfFontDecoder): string[] {
  const fragments = Array.from(value.matchAll(/\((?:\\.|[^\\()])*\)|<[\da-fA-F\s]+>/g)).map((match) =>
    decodePdfTextToken(match[0] ?? '', fontDecoder)
  ).filter(Boolean)
  const joined = fragments.join('')

  return joined ? [joined] : []
}

function decodePdfLiteralString(value: string, fontDecoder?: PdfFontDecoder): string {
  return decodePdfTextBytes(decodePdfLiteralStringBytes(value), fontDecoder)
}

function decodePdfLiteralStringBytes(value: string): Uint8Array {
  const bytes: number[] = []

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (character !== '\\') {
      bytes.push(character.charCodeAt(0) & 0xff)
      continue
    }

    const nextCharacter = value[index + 1]

    if (!nextCharacter) {
      break
    }

    if (/[0-7]/.test(nextCharacter)) {
      const octalValue = value.slice(index + 1, index + 4).match(/^[0-7]{1,3}/)?.[0]

      if (octalValue) {
        bytes.push(Number.parseInt(octalValue, 8))
        index += octalValue.length
        continue
      }
    }

    switch (nextCharacter) {
      case 'n':
        bytes.push('\n'.charCodeAt(0))
        break
      case 'r':
        bytes.push('\r'.charCodeAt(0))
        break
      case 't':
        bytes.push('\t'.charCodeAt(0))
        break
      case 'b':
        bytes.push('\b'.charCodeAt(0))
        break
      case 'f':
        bytes.push('\f'.charCodeAt(0))
        break
      case '\\':
      case '(':
      case ')':
        bytes.push(nextCharacter.charCodeAt(0) & 0xff)
        break
      case '\n':
        break
      case '\r':
        if (value[index + 2] === '\n') {
          index += 1
        }
        break
      default:
        bytes.push(nextCharacter.charCodeAt(0) & 0xff)
        break
    }

    index += 1
  }

  return Uint8Array.from(bytes)
}

function decodePdfHexString(value: string, fontDecoder?: PdfFontDecoder): string {
  const normalized = value.replace(/\s+/g, '')

  if (!normalized) {
    return ''
  }

  const evenLengthValue = normalized.length % 2 === 0 ? normalized : `${normalized}0`
  const bytes = new Uint8Array(evenLengthValue.length / 2)

  for (let index = 0; index < evenLengthValue.length; index += 2) {
    bytes[index / 2] = Number.parseInt(evenLengthValue.slice(index, index + 2), 16)
  }

  return decodePdfTextBytes(bytes, fontDecoder)
}

function decodePdfTextBytes(bytes: Uint8Array, fontDecoder?: PdfFontDecoder): string {
  if (bytes.length === 0) {
    return ''
  }

  if (fontDecoder) {
    const decodedWithFontMap = decodePdfBytesWithFontMap(bytes, fontDecoder)

    if (decodedWithFontMap) {
      return decodedWithFontMap
    }
  }

  if (bytes.length >= 2) {
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return decodeUtf16Bytes(bytes.subarray(2), 'be')
    }

    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return decodeUtf16Bytes(bytes.subarray(2), 'le')
    }
  }

  const inferredUtf16 = inferUtf16Endianness(bytes)

  if (inferredUtf16) {
    return decodeUtf16Bytes(bytes, inferredUtf16)
  }

  const utf8 = decodeBytes(bytes, 'utf-8')
  if (utf8 && !utf8.includes('�')) {
    return utf8
  }

  return fallbackDecodeBytesAsLatin1(bytes)
}

function decodePdfBytesWithFontMap(bytes: Uint8Array, fontDecoder: PdfFontDecoder): string {
  const hexValue = Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join('')

  if (!hexValue) {
    return ''
  }

  let decoded = ''
  let index = 0
  let mappedCharacters = 0

  while (index < hexValue.length) {
    let matched = false

    for (const codeHexLength of fontDecoder.codeHexLengths) {
      const candidate = hexValue.slice(index, index + codeHexLength)
      const mappedCharacter = fontDecoder.codePointMap.get(candidate)

      if (!mappedCharacter) {
        continue
      }

      decoded += mappedCharacter
      index += codeHexLength
      mappedCharacters += 1
      matched = true
      break
    }

    if (matched) {
      continue
    }

    const fallbackByte = Number.parseInt(hexValue.slice(index, index + 2), 16)

    if (!Number.isNaN(fallbackByte)) {
      decoded += String.fromCharCode(fallbackByte)
      index += 2
      continue
    }

    index += 1
  }

  return mappedCharacters > 0 ? decoded : ''
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function inferUtf16Endianness(bytes: Uint8Array): 'be' | 'le' | undefined {
  if (bytes.length < 4 || bytes.length % 2 !== 0) {
    return undefined
  }

  let zeroEvenCount = 0
  let zeroOddCount = 0

  for (let index = 0; index < bytes.length; index += 2) {
    if (bytes[index] === 0) {
      zeroEvenCount += 1
    }

    if (bytes[index + 1] === 0) {
      zeroOddCount += 1
    }
  }

  const pairCount = bytes.length / 2

  if (zeroEvenCount >= Math.ceil(pairCount * 0.4) && zeroOddCount < zeroEvenCount) {
    return 'be'
  }

  if (zeroOddCount >= Math.ceil(pairCount * 0.4) && zeroEvenCount < zeroOddCount) {
    return 'le'
  }

  return undefined
}

function decodeUtf16Bytes(bytes: Uint8Array, endianness: 'be' | 'le'): string {
  let text = ''

  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const codeUnit = endianness === 'be'
      ? (bytes[index] << 8) | bytes[index + 1]
      : (bytes[index + 1] << 8) | bytes[index]

    text += String.fromCharCode(codeUnit)
  }

  return text
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

function normalizeMimeType(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : undefined
}

function detectPdfTextSignatures(content: string): string[] {
  const signatures = new Set<string>()
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  const bookingSignals = detectBookingPayoutStatementSignals(content)

  if (bookingSignals.hasBookingBranding) {
    signatures.add('booking-branding')
  }

  if (bookingSignals.hasStatementWording) {
    signatures.add('booking-payout-statement-wording')
  }

  if (bookingSignals.paymentId) {
    signatures.add('booking-payment-id')
  }

  if (bookingSignals.payoutDateRaw) {
    signatures.add('booking-payout-date')
  }

  if (bookingSignals.payoutTotalRaw) {
    signatures.add('booking-payout-total')
  }

  if (bookingSignals.ibanValue || /\biban\b/i.test(normalized) || /\bbank\s+account\b/i.test(normalized)) {
    signatures.add('iban-hint')
  }

  if (bookingSignals.reservationIds.length > 0 || /\bres-[a-z0-9-]+\b/i.test(normalized) || /\bincluded reservations\b/i.test(normalized)) {
    signatures.add('booking-reservation-reference')
  }

  return Array.from(signatures)
}
