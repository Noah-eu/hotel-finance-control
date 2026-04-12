import type { DeterministicDocumentOcrParsedFields } from '../contracts'
import { normalizeDocumentDate, parseDocumentMoney } from './document-utils'

export type ReceiptVendorProfileKey = 'generic' | 'tesco' | 'potraviny' | 'dm' | 'handwritten_key'

export interface ReceiptVendorProfileSupplementaryAmount {
  raw: string
  currency: string
  amountMinor: number
  label: string
}

export interface ReceiptVendorProfileResult {
  key: ReceiptVendorProfileKey
  detectionSignals: string[]
  merchant?: string
  purchaseDateRaw?: string
  totalRaw?: string
  paymentMethod?: string
  receiptNumber?: string
  category?: string
  note?: string
  merchantRegistrationId?: string
  merchantTaxId?: string
  vatBaseRaw?: string
  vatRaw?: string
  supplementaryAmounts?: ReceiptVendorProfileSupplementaryAmount[]
  forcePartialRecord?: boolean
}

interface ReceiptMoneyCandidate {
  raw: string
  currency: string
  amountMinor: number
  line: string
  lineIndex: number
  matchIndex: number
}

interface ReceiptDateCandidate {
  raw: string
  normalizedDate: string
  lineIndex: number
  score: number
}

interface ReceiptVendorProfileInput {
  content: string
  currentFields: {
    merchant?: string
    purchaseDateRaw?: string
    totalRaw?: string
    paymentMethod?: string
    receiptNumber?: string
    category?: string
    note?: string
  }
  ocrParsedFields?: DeterministicDocumentOcrParsedFields
}

export function detectReceiptVendorSignals(input: string | { content: string; note?: string }): string[] {
  const content = typeof input === 'string' ? input : input.content
  const note = typeof input === 'string' ? '' : input.note ?? ''
  const normalized = normalizeReceiptVendorText([content, note].filter(Boolean).join('\n'))
  const signals: string[] = []

  if (containsTescoSignal(normalized)) {
    signals.push('vendor:tesco')
  }

  if (containsPotravinySignal(normalized)) {
    signals.push('vendor:potraviny')
  }

  if (containsDmSignal(normalized)) {
    signals.push('vendor:dm')
  }

  if (containsHandwrittenOrKeySignal(normalized)) {
    signals.push('profile:handwritten_key')
  }

  return signals
}

export function applyReceiptVendorProfile(input: ReceiptVendorProfileInput): ReceiptVendorProfileResult | undefined {
  const lines = splitReceiptLines(input.content)
  const note = input.currentFields.note ?? input.ocrParsedFields?.note
  const normalized = normalizeReceiptVendorText([input.content, note ?? ''].filter(Boolean).join('\n'))

  if (containsHandwrittenOrKeySignal(normalized)) {
    return buildHandwrittenKeyProfile(lines, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  if (containsDmSignal(normalized)) {
    return buildDmProfile(lines, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  if (containsTescoSignal(normalized)) {
    return buildNamedMerchantProfile('tesco', lines, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  if (containsPotravinySignal(normalized)) {
    return buildNamedMerchantProfile('potraviny', lines, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  return undefined
}

function buildNamedMerchantProfile(
  key: 'tesco' | 'potraviny',
  lines: string[],
  input: ReceiptVendorProfileInput,
  detectionSignals: string[]
): ReceiptVendorProfileResult {
  const merchant = lines.find((line) => key === 'tesco'
    ? /\btesco\b/i.test(line)
    : /\bpotraviny\b/i.test(line)
  ) ?? input.currentFields.merchant

  return {
    key,
    detectionSignals,
    ...(merchant ? { merchant } : {}),
    ...(findReceiptDateCandidate(lines) ? { purchaseDateRaw: findReceiptDateCandidate(lines) } : {}),
    ...(findPreferredCzkTotal(lines) ? { totalRaw: findPreferredCzkTotal(lines) } : {}),
    ...(findReceiptPaymentMethod(lines) ? { paymentMethod: findReceiptPaymentMethod(lines) } : {})
  }
}

function buildDmProfile(
  lines: string[],
  input: ReceiptVendorProfileInput,
  detectionSignals: string[]
): ReceiptVendorProfileResult {
  const primaryAmount = findDmPrimaryAmount(lines)
  const merchantRegistrationId = findReceiptRegistrationId(lines)
  const merchantTaxId = findReceiptTaxId(lines)
  const vatAmounts = findReceiptVatAmounts(lines)
  const paymentMethod = findDmPaymentMethod(lines) ?? input.currentFields.paymentMethod

  return {
    key: 'dm',
    detectionSignals,
    merchant: 'dm drogerie markt s.r.o.',
    ...(findReceiptDateCandidate(lines) ? { purchaseDateRaw: findReceiptDateCandidate(lines) } : {}),
    ...(primaryAmount ? { totalRaw: primaryAmount.raw } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(findReceiptReferenceCandidate(lines) ? { receiptNumber: findReceiptReferenceCandidate(lines) } : {}),
    ...(merchantRegistrationId ? { merchantRegistrationId } : {}),
    ...(merchantTaxId ? { merchantTaxId } : {}),
    ...(vatAmounts.vatBaseRaw ? { vatBaseRaw: vatAmounts.vatBaseRaw } : {}),
    ...(vatAmounts.vatRaw ? { vatRaw: vatAmounts.vatRaw } : {}),
    ...(primaryAmount?.supplementaryAmounts && primaryAmount.supplementaryAmounts.length > 0
      ? { supplementaryAmounts: primaryAmount.supplementaryAmounts }
      : {})
  }
}

function buildHandwrittenKeyProfile(
  lines: string[],
  input: ReceiptVendorProfileInput,
  detectionSignals: string[]
): ReceiptVendorProfileResult {
  const note = input.currentFields.note
    ?? input.ocrParsedFields?.note
    ?? lines.slice(0, 3).join(' / ')

  const category = /\b(klic|klice|key|keys|zamek|lock)\b/i.test(normalizeReceiptVendorText(note))
    ? 'key-related'
    : 'receipt-needs-review'

  return {
    key: 'handwritten_key',
    detectionSignals,
    ...(input.currentFields.merchant || input.ocrParsedFields?.issuerOrCounterparty
      ? { merchant: input.currentFields.merchant ?? input.ocrParsedFields?.issuerOrCounterparty }
      : {}),
    ...(findReceiptDateCandidate(lines) || input.currentFields.purchaseDateRaw || input.ocrParsedFields?.paymentDate || input.ocrParsedFields?.issueDate
      ? { purchaseDateRaw: findReceiptDateCandidate(lines) ?? input.currentFields.purchaseDateRaw ?? input.ocrParsedFields?.paymentDate ?? input.ocrParsedFields?.issueDate }
      : {}),
    ...(findPreferredCzkTotal(lines) || input.currentFields.totalRaw || input.ocrParsedFields?.totalAmount
      ? { totalRaw: findPreferredCzkTotal(lines) ?? input.currentFields.totalRaw ?? input.ocrParsedFields?.totalAmount }
      : {}),
    ...(findReceiptReferenceCandidate(lines) || input.currentFields.receiptNumber || input.ocrParsedFields?.referenceNumber
      ? { receiptNumber: findReceiptReferenceCandidate(lines) ?? input.currentFields.receiptNumber ?? input.ocrParsedFields?.referenceNumber }
      : {}),
    ...(note ? { note } : {}),
    ...(category ? { category } : {}),
    forcePartialRecord: true
  }
}

function findDmPrimaryAmount(lines: string[]): {
  raw: string
  supplementaryAmounts: ReceiptVendorProfileSupplementaryAmount[]
} | undefined {
  const candidates = collectReceiptAmountCandidates(lines).map((candidate) => ({
    ...candidate,
    score: scoreDmAmountCandidate(normalizeReceiptVendorText(candidate.line), candidate)
  }))

  if (candidates.length === 0) {
    return undefined
  }

  const czkCandidates = candidates.filter((candidate) => candidate.currency === 'CZK')
  const ranked = (czkCandidates.length > 0 ? czkCandidates : candidates)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (right.lineIndex !== left.lineIndex) {
        return right.lineIndex - left.lineIndex
      }

      if (right.matchIndex !== left.matchIndex) {
        return right.matchIndex - left.matchIndex
      }

      return right.amountMinor - left.amountMinor
    })

  const primary = ranked[0]
  if (!primary) {
    return undefined
  }

  const supplementaryAmounts = candidates
    .filter((candidate) => candidate !== primary)
    .map((candidate) => ({
      raw: candidate.raw,
      currency: candidate.currency,
      amountMinor: candidate.amountMinor,
      label: /eur/i.test(candidate.line) ? 'secondary-eur-total' : 'secondary-total'
    }))

  return {
    raw: primary.raw,
    supplementaryAmounts
  }
}

function scoreDmAmountCandidate(normalizedLine: string, candidate: ReceiptMoneyCandidate): number {
  let score = candidate.currency === 'CZK' ? 140 : 20

  if (/(celkem|kplatbe|zaplaceno|uhrazeno|visa|karta|card|mastercard)/.test(normalizedLine)) {
    score += 70
  }

  if (/(visa|karta|card|mastercard|maestro)/.test(normalizedLine)) {
    score += 45
  }

  if (/(dph|vat|zaklad|base|sleva|discount|mezisoucet|mezisou[cč]et|subtotal|body|points|ean|mnozstvi|množství|cena|ks\b|kus)/.test(normalizedLine)) {
    score -= 130
  }

  if (candidate.currency === 'EUR' || /\beur\b/.test(normalizedLine)) {
    score -= 90
  }

  score += Math.min(30, candidate.lineIndex * 5)
  score += candidate.matchIndex * 3

  return score
}

function findReceiptDateCandidate(lines: string[]): string | undefined {
  const candidates = collectReceiptDateCandidates(lines)

  if (candidates.length === 0) {
    return undefined
  }

  return candidates
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.lineIndex - right.lineIndex
    })[0]?.raw
}

function findPreferredCzkTotal(lines: string[]): string | undefined {
  const candidates = collectReceiptAmountCandidates(lines)
    .filter((candidate) => candidate.currency === 'CZK')
    .map((candidate) => ({
      ...candidate,
      score: scoreNamedMerchantAmountCandidate(normalizeReceiptVendorText(candidate.line), candidate)
    }))

  if (candidates.length === 0) {
    return undefined
  }

  return candidates
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (right.lineIndex !== left.lineIndex) {
        return right.lineIndex - left.lineIndex
      }

      if (right.matchIndex !== left.matchIndex) {
        return right.matchIndex - left.matchIndex
      }

      return right.amountMinor - left.amountMinor
    })[0]?.raw
}

function scoreNamedMerchantAmountCandidate(normalizedLine: string, candidate: ReceiptMoneyCandidate): number {
  let score = candidate.currency === 'CZK' ? 120 : 20

  if (/(celkem|kplatbe|zaplaceno|uhrazeno|platba)/.test(normalizedLine)) {
    score += 70
  }

  if (/(karta|kartou|visa|mastercard|maestro|hotovost|cash)/.test(normalizedLine)) {
    score += 40
  }

  if (/(mezisoucet|mezisou[cč]et|subtotal|zaklad|z[aá]klad|bez dph|bezdph|dph|vat|sleva|discount|body|points|vernost|věrnost|bonus)/.test(normalizedLine)) {
    score -= 110
  }

  if (candidate.currency === 'EUR' || /\beur\b/.test(normalizedLine)) {
    score -= 60
  }

  score += Math.min(24, candidate.lineIndex * 4)
  score += candidate.matchIndex * 2

  return score
}

function findReceiptPaymentMethod(lines: string[]): string | undefined {
  for (const line of lines) {
    if (/\b(visa\s*czk)\b/i.test(line)) {
      return 'VISA CZK'
    }
    if (/\bvisa\b/i.test(line)) {
      return 'VISA'
    }
    if (/\b(hotovost|cash)\b/i.test(line)) {
      return 'Platba hotove'
    }
    if (/\b(karta|kartou|card|mastercard)\b/i.test(line)) {
      return 'Platba kartou'
    }
  }

  return undefined
}

function findDmPaymentMethod(lines: string[]): string | undefined {
  for (const line of lines) {
    if (/\bvisa\s*czk\b/i.test(line)) {
      return 'VISA CZK'
    }
    if (/\bvisa\b/i.test(line)) {
      return 'VISA'
    }
  }

  return findReceiptPaymentMethod(lines)
}

function findReceiptReferenceCandidate(lines: string[]): string | undefined {
  const patterns = [
    /(?:id\s*dokladu|doklad\s*c\.?|uctenka\s*c\.?|receipt\s*(?:no|number))\s*[:#-]?\s*([A-Z0-9/-]{4,})/iu,
    /\b([0-9]{8,})\b/
  ]

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match?.[1]) {
        return match[1].trim()
      }
    }
  }

  return undefined
}

function findReceiptRegistrationId(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/\bi[čc]o\b\s*[: ]\s*([0-9]{6,10})/i)
    if (match?.[1]) {
      return match[1]
    }
  }

  return undefined
}

function findReceiptTaxId(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/\bdi[čc]\b\s*[: ]\s*([A-Z]{2}[A-Z0-9]{6,14})/i)
    if (match?.[1]) {
      return match[1].toUpperCase()
    }
  }

  return undefined
}

function findReceiptVatAmounts(lines: string[]): { vatBaseRaw?: string; vatRaw?: string } {
  for (const line of lines) {
    if (!/\b(dph|vat)\b/i.test(line)) {
      continue
    }

    const matches = collectReceiptMoneyMatches(line).filter((candidate) => candidate.currency === 'CZK')
    if (matches.length >= 2) {
      return {
        vatBaseRaw: matches[0]?.raw,
        vatRaw: matches[1]?.raw
      }
    }
  }

  return {}
}

function collectReceiptMoneyMatches(line: string): Array<{ raw: string; currency: string; amountMinor: number }> {
  const matches: Array<{ raw: string; currency: string; amountMinor: number }> = []
  const suffixPattern = /(-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2})\s*(CZK|KČ|KC|EUR|€)/gi
  const prefixPattern = /(CZK|KČ|KC|EUR|€)\s*(-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2})/gi

  for (const match of line.matchAll(suffixPattern)) {
    const raw = `${match[1]} ${normalizeReceiptCurrency(match[2] ?? '')}`
    const parsed = safeParseReceiptMoney(raw)
    if (parsed) {
      matches.push({ raw, currency: parsed.currency, amountMinor: parsed.amountMinor })
    }
  }

  for (const match of line.matchAll(prefixPattern)) {
    const raw = `${match[2]} ${normalizeReceiptCurrency(match[1] ?? '')}`
    const parsed = safeParseReceiptMoney(raw)
    if (parsed) {
      matches.push({ raw, currency: parsed.currency, amountMinor: parsed.amountMinor })
    }
  }

  return dedupeReceiptMoneyMatches(matches)
}

function collectReceiptAmountCandidates(lines: string[]): ReceiptMoneyCandidate[] {
  return lines.flatMap((line, lineIndex) =>
    collectReceiptMoneyMatches(line).map((candidate, matchIndex) => ({
      ...candidate,
      line,
      lineIndex,
      matchIndex
    }))
  )
}

function collectReceiptDateCandidates(lines: string[]): ReceiptDateCandidate[] {
  const candidates: ReceiptDateCandidate[] = []

  for (const [lineIndex, line] of lines.entries()) {
    const normalizedLine = normalizeReceiptVendorText(line)
    const scoredDates = [
      ...Array.from(line.matchAll(/\b(\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4}))(?:\s+\d{1,2}:\d{2})?\b/g)).map((match) => match[1]),
      ...Array.from(line.matchAll(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{2}|\d{4})\b/g)).map((match) => `${match[1]}.${match[2]}.${match[3]}`)
    ]

    for (const rawCandidate of scoredDates) {
      const normalizedRawCandidate = normalizeReceiptYear(rawCandidate)
      const normalizedDate = safeNormalizeReceiptDate(normalizedRawCandidate)

      if (!normalizedDate) {
        continue
      }

      let score = 0

      if (/(datum|date|nakup|n[aá]kup|purchase|prodej|transaction|transakce|uctenka|u[cč]tenka|doklad)/.test(normalizedLine)) {
        score += 60
      }

      if (/\b\d{1,2}:\d{2}\b/.test(line)) {
        score += 10
      }

      if (/(splatnost|due|vystaveni|issue|zdanitel|taxable|expirace|platnost|valid)/.test(normalizedLine)) {
        score -= 80
      }

      score += Math.max(0, 16 - lineIndex * 2)

      candidates.push({
        raw: normalizedRawCandidate,
        normalizedDate,
        lineIndex,
        score
      })
    }
  }

  return candidates
}

function dedupeReceiptMoneyMatches(matches: Array<{ raw: string; currency: string; amountMinor: number }>) {
  const byKey = new Map<string, { raw: string; currency: string; amountMinor: number }>()

  for (const match of matches) {
    const key = `${match.amountMinor}:${match.currency}`
    if (!byKey.has(key)) {
      byKey.set(key, match)
    }
  }

  return Array.from(byKey.values())
}

function normalizeReceiptCurrency(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'KČ' || normalized === 'KC') {
    return 'CZK'
  }
  if (normalized === '€') {
    return 'EUR'
  }
  return normalized
}

function splitReceiptLines(content: string): string[] {
  return String(content || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeReceiptVendorLine(line))
    .filter(Boolean)
}

function normalizeReceiptVendorLine(line: string): string {
  let normalized = line.replace(/[ \t]+/g, ' ').trim()
  let previous = ''

  while (normalized !== previous) {
    previous = normalized
    normalized = normalized
      .replace(/\b(?:[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}]\b/gu, (match) => match.replace(/\s+/g, ''))
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  return normalized
}

function containsTescoSignal(normalized: string): boolean {
  return /\btesco\b/.test(normalized)
}

function containsPotravinySignal(normalized: string): boolean {
  return /\bpotraviny\b/.test(normalized)
}

function containsDmSignal(normalized: string): boolean {
  return /\bdm\b/.test(normalized) || normalized.includes('dmdrogeriemarkt')
}

function containsHandwrittenOrKeySignal(normalized: string): boolean {
  return /(handwritten|rucnepsany|rucnepsana|rucnipismo|klic|klice|key|keys|zamek|lock)/.test(normalized)
}

function normalizeReceiptVendorText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeReceiptYear(value: string): string {
  return value.replace(/(\d{1,2}[./-]\d{1,2}[./-])(\d{2})$/, '$120$2')
}

function safeNormalizeReceiptDate(value: string): string | undefined {
  try {
    return normalizeDocumentDate(value, 'Receipt vendor profile date')
  } catch {
    return undefined
  }
}

function safeParseReceiptMoney(value: string): { amountMinor: number; currency: string } | undefined {
  try {
    return parseDocumentMoney(value, 'Receipt vendor profile amount')
  } catch {
    return undefined
  }
}