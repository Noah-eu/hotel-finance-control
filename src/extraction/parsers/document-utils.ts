import type { CurrencyCode } from '../../domain'

const MONEY_WITH_SPACE_CURRENCY = /^(?<amount>[\d\s.,-]+)\s+(?<currency>[A-Z]{3}|KČ|Kc|€|\$)$/i
const MONEY_WITH_SYMBOL_PREFIX = /^(?<currency>CZK|EUR|USD|KČ|Kc|€|\$)\s*(?<amount>[\d\s.,-]+)$/i

export function parseLabeledDocumentText(content: string): Record<string, string> {
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
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

  const dayFirstDotShortYear = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(normalized)
  if (dayFirstDotShortYear) {
    const [, day, month, year] = dayFirstDotShortYear
    return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dayFirstSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized)
  if (dayFirstSlash) {
    const [, day, month, year] = dayFirstSlash
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dayFirstSlashShortYear = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(normalized)
  if (dayFirstSlashShortYear) {
    const [, day, month, year] = dayFirstSlashShortYear
    return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const czechMonth = /^(\d{1,2})\.\s*([a-zá-ž]+)\s+(\d{4})$/iu.exec(normalized)
  if (czechMonth) {
    const [, day, monthName, year] = czechMonth
    const month = czechMonthNumber(monthName)
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`
    }
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

  const currency = normalizeDocumentCurrency(match.groups.currency)
  const amountMinor = parseDocumentAmountMinor(match.groups.amount, fieldName)

  return {
    amountMinor,
    currency
  }
}

export function parseDocumentAmountMinor(value: string, fieldName: string): number {
  const normalized = value.trim().replace(/\s+/g, '')

  if (/^-?\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10) * 100
  }

  const withoutLocaleThousands = normalized.includes(',')
    ? normalized.replace(/\./g, '')
    : normalized
  const tolerant = withoutLocaleThousands.replace(',', '.')
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

function normalizeDocumentCurrency(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase()

  if (normalized === 'KČ' || normalized === 'KC') {
    return 'CZK'
  }

  if (normalized === '€') {
    return 'EUR'
  }

  if (normalized === '$') {
    return 'USD'
  }

  return normalized as CurrencyCode
}

function czechMonthNumber(value: string): string | undefined {
  const normalized = value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const months: Record<string, string> = {
    ledna: '01',
    unor: '02',
    unora: '02',
    brezen: '03',
    brezna: '03',
    duben: '04',
    dubna: '04',
    kveten: '05',
    kvetna: '05',
    cerven: '06',
    cervna: '06',
    cervenec: '07',
    cervence: '07',
    srpen: '08',
    srpna: '08',
    zari: '09',
    rijen: '10',
    rijna: '10',
    listopad: '11',
    listopadu: '11',
    prosinec: '12',
    prosince: '12'
  }

  return months[normalized]
}
