import type { CurrencyCode } from '../../domain'

const MONEY_WITH_SPACE_CURRENCY = /^(?<amount>[\d\s.,-]+)\s+(?<currency>[A-Z]{3})$/i
const MONEY_WITH_SYMBOL_PREFIX = /^(?<currency>CZK|EUR|USD)\s+(?<amount>[\d\s.,-]+)$/i

export function parseLabeledDocumentText(content: string): Record<string, string> {
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .reduce<Record<string, string>>((accumulator, line) => {
      const separatorIndex = findSeparatorIndex(line)
      if (separatorIndex === -1) {
        return accumulator
      }

      const label = normalizeLabel(line.slice(0, separatorIndex))
      const value = line.slice(separatorIndex + 1).trim()
      accumulator[label] = value
      return accumulator
    }, {})
}

export function pickRequiredField(
  fields: Record<string, string>,
  aliases: string[],
  fallbackAliases: string[] = []
): string | undefined {
  for (const alias of [...aliases, ...fallbackAliases]) {
    const value = fields[normalizeLabel(alias)]
    if (value) {
      return value
    }
  }

  return undefined
}

export function normalizeDocumentDate(value: string, fieldName: string): string {
  const normalized = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const dayFirstDot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(normalized)
  if (dayFirstDot) {
    const [, day, month, year] = dayFirstDot
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dayFirstSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized)
  if (dayFirstSlash) {
    const [, day, month, year] = dayFirstSlash
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  throw new Error(`${fieldName} has unsupported date format: ${value}`)
}

export function parseDocumentMoney(value: string, fieldName: string): {
  amountMinor: number
  currency: CurrencyCode
} {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const match = normalized.match(MONEY_WITH_SPACE_CURRENCY) ?? normalized.match(MONEY_WITH_SYMBOL_PREFIX)

  if (!match?.groups) {
    throw new Error(`${fieldName} has unsupported money format: ${value}`)
  }

  const currency = match.groups.currency.toUpperCase()
  const amountMinor = parseDocumentAmountMinor(match.groups.amount, fieldName)

  return {
    amountMinor,
    currency
  }
}

export function parseDocumentAmountMinor(value: string, fieldName: string): number {
  const normalized = value.trim().replace(/\s+/g, '')

  if (/^-?\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10)
  }

  const tolerant = normalized.replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(tolerant)) {
    throw new Error(`${fieldName} has unsupported amount format: ${value}`)
  }

  return Math.round(Number.parseFloat(tolerant) * 100)
}

export function normalizeLabel(value: string): string {
  return value
    .trim()
    .replace(/[：]/g, ':')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function findSeparatorIndex(line: string): number {
  const colonIndex = line.indexOf(':')
  if (colonIndex !== -1) {
    return colonIndex
  }

  return line.indexOf('-')
}