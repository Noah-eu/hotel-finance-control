type CanonicalHeaderMap = Record<string, string[]>

interface ParseDelimitedRowsOptions {
  canonicalHeaders?: CanonicalHeaderMap
}

export interface ParsedDelimitedContent {
  rawHeaderRow: string
  detectedDelimiter: string
  headers: string[]
  headerColumns: Array<{
    rawHeader: string
    normalizedHeader: string
  }>
  rows: Array<Record<string, string>>
}

export interface ParseAmountMinorOptions {
  integerIsMajorUnit?: boolean
}

export function getAccountIdFromFileName(fileName: string): string | undefined {
  const normalized = normalizeCell(fileName)
  const match = /(?:^|[^\d])(\d{6,10}\/\d{4}|\d{6,10})(?:[^\d]|$)/.exec(normalized)

  return match?.[1]
}

export class DeterministicParserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeterministicParserError'
  }
}

export function parseDelimitedRows(
  content: string,
  options: ParseDelimitedRowsOptions = {}
): Array<Record<string, string>> {
  return parseDelimitedContent(content, options).rows
}

export function parseDelimitedContent(
  content: string,
  options: ParseDelimitedRowsOptions = {}
): ParsedDelimitedContent {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return { rawHeaderRow: '', detectedDelimiter: ',', headers: [], headerColumns: [], rows: [] }
  }

  const delimiter = detectDelimiter(lines[0])
  const headerColumns = mapHeaders(splitDelimitedLine(lines[0], delimiter), options.canonicalHeaders)
  const headers = headerColumns.map((column) => column.normalizedHeader)

  const rows = lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line, delimiter)
    return headers.reduce<Record<string, string>>((accumulator, header, index) => {
      accumulator[header] = normalizeCell(values[index] ?? '')
      return accumulator
    }, {})
  })

  return { rawHeaderRow: lines[0], detectedDelimiter: delimiter, headers, headerColumns, rows }
}

export function findMissingHeaders(
  rows: Array<Record<string, string>>,
  requiredHeaders: string[]
): string[] {
  if (rows.length === 0) {
    return []
  }

  const headers = Object.keys(rows[0])
  return requiredHeaders.filter((header) => !headers.includes(header))
}

export function parseAmountMinor(value: string, fieldName: string, options: ParseAmountMinorOptions = {}): number {
  const normalized = normalizeCell(value)

  if (normalized.length === 0) {
    throw new DeterministicParserError(`${fieldName} is empty`)
  }

  if (/^-?\d+$/.test(normalized)) {
    const parsedInteger = Number.parseInt(normalized, 10)
    return options.integerIsMajorUnit ? parsedInteger * 100 : parsedInteger
  }

  const decimalCandidate = normalized.replace(/\s+/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(decimalCandidate)) {
    throw new DeterministicParserError(`${fieldName} has unsupported amount format: ${value}`)
  }

  return Math.round(Number.parseFloat(decimalCandidate) * 100)
}

export function isExplicitMinorAmountHeader(value: string): boolean {
  const normalized = normalizeHeaderKey(value)
  return normalized === 'amountminor'
}

export function parseIsoDate(value: string, fieldName: string): string {
  const normalized = normalizeCell(value)

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const dayFirstDateTimeMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(normalized)
  if (dayFirstDateTimeMatch) {
    const [, day, month, year, hour, minute] = dayFirstDateTimeMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00`
  }

  const dayFirstMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(normalized)
  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const timestampMatch = /^(\d{4}-\d{2}-\d{2})[ T].*$/.exec(normalized)
  if (timestampMatch) {
    return timestampMatch[1]
  }

  throw new DeterministicParserError(`${fieldName} has unsupported date format: ${value}`)
}

export function normalizeCell(value: string): string {
  return value.replace(/^\uFEFF/, '').trim()
}

export function normalizeHeaderCell(value: string): string {
  return normalizeCell(value).replace(/^"|"$/g, '')
}

function mapHeaders(
  rawHeaders: string[],
  canonicalHeaders?: CanonicalHeaderMap
): Array<{ rawHeader: string; normalizedHeader: string }> {
  if (!canonicalHeaders) {
    return rawHeaders.map((header) => ({
      rawHeader: normalizeHeaderCell(header),
      normalizedHeader: normalizeHeaderCell(header)
    }))
  }

  return rawHeaders.map((header) => {
    const rawHeader = normalizeHeaderCell(header)
    const normalizedHeader = normalizeHeaderKey(header)

    for (const [canonicalHeader, aliases] of Object.entries(canonicalHeaders)) {
      if (aliases.some((alias) => normalizeHeaderKey(alias) === normalizedHeader)) {
        return {
          rawHeader,
          normalizedHeader: canonicalHeader
        }
      }
    }

    return {
      rawHeader,
      normalizedHeader: rawHeader
    }
  })
}

function normalizeHeaderKey(value: string): string {
  return normalizeHeaderCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ _-]+/g, '')
}

function detectDelimiter(line: string): string {
  const commaCount = countDelimiterOutsideQuotes(line, ',')
  const semicolonCount = countDelimiterOutsideQuotes(line, ';')
  return semicolonCount > commaCount ? ';' : ','
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let insideQuotes = false

  for (const character of line) {
    if (character === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (!insideQuotes && character === delimiter) {
      count += 1
    }
  }

  return count
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = []
  let current = ''
  let index = 0
  let insideQuotes = false

  while (index < line.length) {
    const character = line[index]

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"'
        index += 2
        continue
      }

      insideQuotes = !insideQuotes
      index += 1
      continue
    }

    if (!insideQuotes && character === delimiter) {
      values.push(current)
      current = ''
      index += 1
      continue
    }

    current += character
    index += 1
  }

  values.push(current)
  return values.map((value) => normalizeCell(value))
}
