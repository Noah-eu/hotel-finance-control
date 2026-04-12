import type {
  DeterministicDocumentOcrParsedFields,
  ReceiptParsingAmountCandidateDebug
} from '../contracts'
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
  suppressGenericTotalRaw?: boolean
}

interface ReceiptMoneyCandidate {
  raw: string
  currency: string
  amountMinor: number
  line: string
  lineIndex: number
  matchIndex: number
}

interface ReceiptLineAmountCandidate extends ReceiptMoneyCandidate {
  hasExplicitCurrency: boolean
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

export interface ReceiptVendorCandidateInspection {
  normalizedLines: string[]
  reconstructedReceiptLines: string[]
  reconstructedFooterLines: string[]
  footerWindowLines: string[]
  amountCandidates: ReceiptParsingAmountCandidateDebug[]
  anchoredAmountCandidates: ReceiptParsingAmountCandidateDebug[]
  anchoredSearchInputSource: 'raw-normalized-lines' | 'reconstructed-footer-lines'
  anchoredCandidateCountBeforeReconstruction: number
  anchoredCandidateCountAfterReconstruction: number
  footerAnchorMatched: boolean
  finalTotalCandidateScope: 'footer-window' | 'reconstructed-lines' | 'generic-fallback'
  rejectedHighScoreBodyCandidates: ReceiptParsingAmountCandidateDebug[]
  reconstructedAmountTokens: string[]
  anchoredTimestampDateRaw?: string
}

interface ReceiptOcrPreNormalization {
  normalizedLines: string[]
  reconstructedReceiptLines: string[]
  reconstructedFooterLines: string[]
  footerWindowLines: string[]
  footerAnchorMatched: boolean
  reconstructedAmountTokens: string[]
}

interface ReceiptAnchoredCandidateSearchResult {
  candidates: ReceiptLineAmountCandidate[]
  searchInputSource: 'raw-normalized-lines' | 'reconstructed-footer-lines'
  rawCandidateCount: number
  reconstructedCandidateCount: number
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
  const preNormalized = preNormalizeReceiptOcrLines(input.content)
  const lines = preNormalized.normalizedLines
  const note = input.currentFields.note ?? input.ocrParsedFields?.note
  const normalized = normalizeReceiptVendorText([input.content, note ?? ''].filter(Boolean).join('\n'))

  if (containsHandwrittenOrKeySignal(normalized)) {
    return buildHandwrittenKeyProfile(preNormalized, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  if (containsDmSignal(normalized)) {
    return buildDmProfile(preNormalized, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  if (containsTescoSignal(normalized)) {
    return buildNamedMerchantProfile('tesco', preNormalized, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  if (containsPotravinySignal(normalized)) {
    return buildNamedMerchantProfile('potraviny', preNormalized, input, detectReceiptVendorSignals({ content: input.content, note }))
  }

  return undefined
}

export function inspectReceiptVendorCandidates(input: {
  content: string
  vendorProfileKey: ReceiptVendorProfileKey
}): ReceiptVendorCandidateInspection {
  const preNormalized = preNormalizeReceiptOcrLines(input.content)
  const normalizedLines = preNormalized.normalizedLines

  if (input.vendorProfileKey === 'dm') {
    const anchoredSearch = collectAnchoredReceiptAmountCandidatesWithReconstruction(preNormalized, {
      paymentAnchorPattern: /\b(visa|mastercard|maestro|karta|card)\b/,
      totalAnchorPattern: /\b(celkem|total|k platbe|zaplaceno|uhrazeno)\b/,
      rejectPattern: /\b(body|points|dph|vat|zaklad|base|sleva|discount|mezisoucet|subtotal|bonus|ean|mnozstvi|cena|ks|kus)\b/,
      preferredCurrency: 'CZK'
    })
    const amountCandidates = collectReceiptDebugAmountCandidates(preNormalized.reconstructedReceiptLines).map((candidate) => ({
      ...toReceiptParsingAmountCandidateDebug(candidate, 'vendor-ranked-candidate'),
      score: scoreDmAmountCandidate(normalizeReceiptVendorText(candidate.line), candidate)
    }))
    const rejectedHighScoreBodyCandidates = collectRejectedHighScoreBodyCandidates({
      candidates: amountCandidates,
      footerLines: preNormalized.reconstructedFooterLines,
      vendorProfileKey: 'dm'
    })
    const anchoredAmountCandidates = anchoredSearch.candidates
      .map((candidate) => toReceiptParsingAmountCandidateDebug(candidate, 'vendor-anchored-final-total'))

    return {
      normalizedLines,
      reconstructedReceiptLines: preNormalized.reconstructedReceiptLines,
      reconstructedFooterLines: preNormalized.reconstructedFooterLines,
      footerWindowLines: preNormalized.footerWindowLines,
      amountCandidates,
      anchoredAmountCandidates,
      anchoredSearchInputSource: anchoredSearch.searchInputSource,
      anchoredCandidateCountBeforeReconstruction: anchoredSearch.rawCandidateCount,
      anchoredCandidateCountAfterReconstruction: anchoredSearch.reconstructedCandidateCount,
      footerAnchorMatched: preNormalized.footerAnchorMatched,
      finalTotalCandidateScope: anchoredAmountCandidates.length > 0 ? 'footer-window' : 'generic-fallback',
      rejectedHighScoreBodyCandidates,
      reconstructedAmountTokens: preNormalized.reconstructedAmountTokens,
      anchoredTimestampDateRaw: findAnchoredReceiptTimestampDate(preNormalized.reconstructedReceiptLines)
        ?? findAnchoredReceiptTimestampDate(normalizedLines)
    }
  }

  if (input.vendorProfileKey === 'tesco') {
    const anchoredSearch = collectAnchoredReceiptAmountCandidatesWithReconstruction(preNormalized, {
      paymentAnchorPattern: /\b(platebni karta|platba karta|kartou|visa|mastercard|maestro|hotovost|cash|pin ok|prodej)\b/,
      totalAnchorPattern: /\b(celkem|k celkem|total|k platbe|zaplaceno|uhrazeno)\b/,
      rejectPattern: /\b(mezisoucet|subtotal|sleva|discount|clubcard|body|points|uspora|vernost|bonus)\b/,
      preferredCurrency: 'CZK'
    })
    const amountCandidates = collectReceiptDebugAmountCandidates(preNormalized.reconstructedReceiptLines)
      .filter((candidate) => candidate.currency === 'CZK')
      .map((candidate) => ({
        ...toReceiptParsingAmountCandidateDebug(candidate, 'vendor-ranked-candidate'),
        score: scoreNamedMerchantAmountCandidate(normalizeReceiptVendorText(candidate.line), candidate)
      }))
    const rejectedHighScoreBodyCandidates = collectRejectedHighScoreBodyCandidates({
      candidates: amountCandidates,
      footerLines: preNormalized.reconstructedFooterLines,
      vendorProfileKey: 'tesco'
    })
    const anchoredAmountCandidates = anchoredSearch.candidates
      .map((candidate) => toReceiptParsingAmountCandidateDebug(candidate, 'vendor-anchored-final-total'))

    return {
      normalizedLines,
      reconstructedReceiptLines: preNormalized.reconstructedReceiptLines,
      reconstructedFooterLines: preNormalized.reconstructedFooterLines,
      footerWindowLines: preNormalized.footerWindowLines,
      amountCandidates,
      anchoredAmountCandidates,
      anchoredSearchInputSource: anchoredSearch.searchInputSource,
      anchoredCandidateCountBeforeReconstruction: anchoredSearch.rawCandidateCount,
      anchoredCandidateCountAfterReconstruction: anchoredSearch.reconstructedCandidateCount,
      footerAnchorMatched: preNormalized.footerAnchorMatched,
      finalTotalCandidateScope: anchoredAmountCandidates.length > 0 ? 'footer-window' : 'generic-fallback',
      rejectedHighScoreBodyCandidates,
      reconstructedAmountTokens: preNormalized.reconstructedAmountTokens,
      anchoredTimestampDateRaw: findAnchoredReceiptTimestampDate(preNormalized.reconstructedReceiptLines)
        ?? findAnchoredReceiptTimestampDate(normalizedLines)
    }
  }

  if (input.vendorProfileKey === 'potraviny') {
    return {
      normalizedLines,
      reconstructedReceiptLines: preNormalized.reconstructedReceiptLines,
      reconstructedFooterLines: preNormalized.reconstructedFooterLines,
      footerWindowLines: preNormalized.footerWindowLines,
      amountCandidates: collectReceiptDebugAmountCandidates(preNormalized.reconstructedReceiptLines)
        .filter((candidate) => candidate.currency === 'CZK')
        .map((candidate) => ({
          ...toReceiptParsingAmountCandidateDebug(candidate, 'vendor-ranked-candidate'),
          score: scoreNamedMerchantAmountCandidate(normalizeReceiptVendorText(candidate.line), candidate)
        })),
      anchoredAmountCandidates: [],
      anchoredSearchInputSource: 'raw-normalized-lines',
      anchoredCandidateCountBeforeReconstruction: 0,
      anchoredCandidateCountAfterReconstruction: 0,
      footerAnchorMatched: preNormalized.footerAnchorMatched,
      finalTotalCandidateScope: 'reconstructed-lines',
      rejectedHighScoreBodyCandidates: [],
      reconstructedAmountTokens: preNormalized.reconstructedAmountTokens
    }
  }

  return {
    normalizedLines,
    reconstructedReceiptLines: preNormalized.reconstructedReceiptLines,
    reconstructedFooterLines: preNormalized.reconstructedFooterLines,
    footerWindowLines: preNormalized.footerWindowLines,
    amountCandidates: [],
    anchoredAmountCandidates: [],
    anchoredSearchInputSource: 'raw-normalized-lines',
    anchoredCandidateCountBeforeReconstruction: 0,
    anchoredCandidateCountAfterReconstruction: 0,
    footerAnchorMatched: preNormalized.footerAnchorMatched,
    finalTotalCandidateScope: 'generic-fallback',
    rejectedHighScoreBodyCandidates: [],
    reconstructedAmountTokens: preNormalized.reconstructedAmountTokens
  }
}

function buildNamedMerchantProfile(
  key: 'tesco' | 'potraviny',
  preNormalized: ReceiptOcrPreNormalization,
  input: ReceiptVendorProfileInput,
  detectionSignals: string[]
): ReceiptVendorProfileResult {
  const lines = preNormalized.normalizedLines
  const candidateLines = preNormalized.reconstructedReceiptLines
  const purchaseDateRaw = key === 'tesco'
    ? findAnchoredReceiptTimestampDate(candidateLines) ?? findAnchoredReceiptTimestampDate(lines) ?? findReceiptDateCandidate(candidateLines) ?? findReceiptDateCandidate(lines)
    : findReceiptDateCandidate(candidateLines) ?? findReceiptDateCandidate(lines)
  const totalRaw = key === 'tesco'
    ? findTescoPrimaryAmountRaw(preNormalized)
    : findPreferredCzkTotal(candidateLines) ?? findPreferredCzkTotal(lines)
  const merchant = candidateLines.find((line) => key === 'tesco'
    ? /\btesco\b/i.test(line)
    : /\bpotraviny\b/i.test(line)
  ) ?? lines.find((line) => key === 'tesco'
    ? /\btesco\b/i.test(line)
    : /\bpotraviny\b/i.test(line)
  ) ?? input.currentFields.merchant
  const paymentMethod = findReceiptPaymentMethod(preNormalized.reconstructedFooterLines)
    ?? findReceiptPaymentMethod(candidateLines)
    ?? findReceiptPaymentMethod(lines)

  return {
    key,
    detectionSignals,
    ...(merchant ? { merchant } : {}),
    ...(purchaseDateRaw ? { purchaseDateRaw } : {}),
    ...(totalRaw ? { totalRaw } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(key === 'tesco' ? { suppressGenericTotalRaw: true } : {})
  }
}

function buildDmProfile(
  preNormalized: ReceiptOcrPreNormalization,
  input: ReceiptVendorProfileInput,
  detectionSignals: string[]
): ReceiptVendorProfileResult {
  const lines = preNormalized.normalizedLines
  const candidateLines = preNormalized.reconstructedReceiptLines
  const primaryAmount = findDmPrimaryAmount(preNormalized)
  const purchaseDateRaw = findAnchoredReceiptTimestampDate(candidateLines)
    ?? findAnchoredReceiptTimestampDate(lines)
    ?? findReceiptDateCandidate(candidateLines)
    ?? findReceiptDateCandidate(lines)
  const merchantRegistrationId = findReceiptRegistrationId(candidateLines) ?? findReceiptRegistrationId(lines)
  const merchantTaxId = findReceiptTaxId(candidateLines) ?? findReceiptTaxId(lines)
  const candidateVatAmounts = findReceiptVatAmounts(candidateLines)
  const vatAmounts = candidateVatAmounts.vatBaseRaw || candidateVatAmounts.vatRaw
    ? candidateVatAmounts
    : findReceiptVatAmounts(lines)
  const paymentMethod = findDmPaymentMethod(preNormalized.reconstructedFooterLines)
    ?? findDmPaymentMethod(candidateLines)
    ?? findDmPaymentMethod(lines)
    ?? input.currentFields.paymentMethod

  return {
    key: 'dm',
    detectionSignals,
    merchant: 'dm drogerie markt s.r.o.',
    ...(purchaseDateRaw ? { purchaseDateRaw } : {}),
    ...(primaryAmount ? { totalRaw: primaryAmount.raw } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(findReceiptReferenceCandidate(candidateLines) || findReceiptReferenceCandidate(lines)
      ? { receiptNumber: findReceiptReferenceCandidate(candidateLines) ?? findReceiptReferenceCandidate(lines) }
      : {}),
    ...(merchantRegistrationId ? { merchantRegistrationId } : {}),
    ...(merchantTaxId ? { merchantTaxId } : {}),
    ...(vatAmounts.vatBaseRaw ? { vatBaseRaw: vatAmounts.vatBaseRaw } : {}),
    ...(vatAmounts.vatRaw ? { vatRaw: vatAmounts.vatRaw } : {}),
    ...(primaryAmount?.supplementaryAmounts && primaryAmount.supplementaryAmounts.length > 0
      ? { supplementaryAmounts: primaryAmount.supplementaryAmounts }
      : {}),
    suppressGenericTotalRaw: true
  }
}

function buildHandwrittenKeyProfile(
  preNormalized: ReceiptOcrPreNormalization,
  input: ReceiptVendorProfileInput,
  detectionSignals: string[]
): ReceiptVendorProfileResult {
  const lines = preNormalized.reconstructedReceiptLines
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

function findDmPrimaryAmount(preNormalized: ReceiptOcrPreNormalization): {
  raw: string
  supplementaryAmounts: ReceiptVendorProfileSupplementaryAmount[]
} | undefined {
  const totalAnchorPattern = /\b(celkem|total|k platbe|zaplaceno|uhrazeno)\b/
  const rejectPattern = /\b(body|points|dph|vat|zaklad|base|sleva|discount|mezisoucet|subtotal|bonus|ean|mnozstvi|cena|ks|kus)\b/
  const anchoredSearch = collectAnchoredReceiptAmountCandidatesWithReconstruction(preNormalized, {
    paymentAnchorPattern: /\b(visa|mastercard|maestro|karta|card)\b/,
    totalAnchorPattern,
    rejectPattern,
    preferredCurrency: 'CZK'
  })
  const anchoredCandidate = anchoredSearch.candidates[0]

  if (anchoredCandidate) {
    const anchoredResult = buildPrimaryAmountResultFromAnchoredCandidate(anchoredCandidate)

    if (anchoredResult.supplementaryAmounts.length > 0) {
      return anchoredResult
    }

    const anchoredTotalSearch = collectAnchoredReceiptAmountCandidatesWithReconstruction(preNormalized, {
      paymentAnchorPattern: /$^/,
      totalAnchorPattern,
      rejectPattern,
      preferredCurrency: 'CZK'
    })
    const anchoredTotalCandidate = anchoredTotalSearch.candidates[0]

    if (!anchoredTotalCandidate || anchoredTotalCandidate.line === anchoredCandidate.line) {
      return anchoredResult
    }

    return {
      raw: anchoredResult.raw,
      supplementaryAmounts: buildSupplementaryAmountsFromLine(anchoredTotalCandidate.line, anchoredTotalCandidate.lineIndex, anchoredResult.raw, anchoredCandidate.currency)
    }
  }

  const candidates = collectReceiptAmountCandidates(preNormalized.reconstructedReceiptLines).map((candidate) => ({
    ...candidate,
    score: scoreDmAmountCandidate(normalizeReceiptVendorText(candidate.line), candidate)
  }))

  return undefined
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

  if (isLikelyReceiptBodyItemLine(normalizedLine)) {
    score -= 160
  }

  if (candidate.currency === 'EUR' || /\beur\b/.test(normalizedLine)) {
    score -= 90
  }

  score += Math.min(30, candidate.lineIndex * 5)
  score += candidate.matchIndex * 3

  return score
}

function findTescoPrimaryAmountRaw(preNormalized: ReceiptOcrPreNormalization): string | undefined {
  return collectAnchoredReceiptAmountCandidatesWithReconstruction(preNormalized, {
    paymentAnchorPattern: /\b(platebni karta|platba karta|kartou|visa|mastercard|maestro|hotovost|cash|pin ok|prodej)\b/,
    totalAnchorPattern: /\b(celkem|k celkem|total|k platbe|zaplaceno|uhrazeno)\b/,
    rejectPattern: /\b(mezisoucet|subtotal|sleva|discount|clubcard|body|points|uspora|vernost|bonus)\b/,
    preferredCurrency: 'CZK'
  }).candidates[0]?.raw
}

function findAnchoredReceiptTimestampDate(lines: string[]): string | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    const normalizedLine = normalizeReceiptVendorText(line)

    if (!/(datum|date|nakup|purchase|prodej|transaction|transakce|uctenka|doklad)/.test(normalizedLine)) {
      continue
    }

    if (!/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(line)) {
      continue
    }

    const date = extractNormalizedReceiptDateFromLine(line)
    if (date) {
      return date
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    const normalizedLine = normalizeReceiptVendorText(line)

    if (!/(datum|date|nakup|purchase|prodej|transaction|transakce|uctenka|doklad)/.test(normalizedLine)) {
      continue
    }

    const date = extractNormalizedReceiptDateFromLine(line)
    if (date) {
      return date
    }
  }

  return undefined
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

  if (isLikelyReceiptBodyItemLine(normalizedLine)) {
    score -= 170
  }

  if (candidate.currency === 'EUR' || /\beur\b/.test(normalizedLine)) {
    score -= 60
  }

  score += Math.min(24, candidate.lineIndex * 4)
  score += candidate.matchIndex * 2

  return score
}

function findAnchoredReceiptAmount(
  lines: string[],
  options: {
    paymentAnchorPattern: RegExp
    totalAnchorPattern: RegExp
    rejectPattern: RegExp
    preferredCurrency: string
  }
): ReceiptLineAmountCandidate | undefined {
  return collectAnchoredReceiptAmountCandidates(lines, options)[0]
}

function collectAnchoredReceiptAmountCandidatesWithReconstruction(
  preNormalized: ReceiptOcrPreNormalization,
  options: {
    paymentAnchorPattern: RegExp
    totalAnchorPattern: RegExp
    rejectPattern: RegExp
    preferredCurrency: string
  }
): ReceiptAnchoredCandidateSearchResult {
  const rawCandidates = collectAnchoredReceiptAmountCandidates(preNormalized.normalizedLines, options)
  const reconstructedCandidates = collectAnchoredReceiptAmountCandidates(preNormalized.reconstructedFooterLines, options)

  if (reconstructedCandidates.length > 0) {
    return {
      candidates: reconstructedCandidates,
      searchInputSource: 'reconstructed-footer-lines',
      rawCandidateCount: rawCandidates.length,
      reconstructedCandidateCount: reconstructedCandidates.length
    }
  }

  return {
    candidates: rawCandidates,
    searchInputSource: 'raw-normalized-lines',
    rawCandidateCount: rawCandidates.length,
    reconstructedCandidateCount: reconstructedCandidates.length
  }
}

function collectAnchoredReceiptAmountCandidates(
  lines: string[],
  options: {
    paymentAnchorPattern: RegExp
    totalAnchorPattern: RegExp
    rejectPattern: RegExp
    preferredCurrency: string
  }
): ReceiptLineAmountCandidate[] {
  const candidates: ReceiptLineAmountCandidate[] = []

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    const normalizedLine = normalizeReceiptVendorText(line)

    if (!options.paymentAnchorPattern.test(normalizedLine)) {
      continue
    }

    const candidate = selectPreferredAnchoredLineAmount(line, index, options.preferredCurrency)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    const normalizedLine = normalizeReceiptVendorText(line)

    if (!options.totalAnchorPattern.test(normalizedLine) || options.rejectPattern.test(normalizedLine)) {
      continue
    }

    const candidate = selectPreferredAnchoredLineAmount(line, index, options.preferredCurrency)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  return candidates
}

function selectPreferredAnchoredLineAmount(
  line: string,
  lineIndex: number,
  preferredCurrency: string
): ReceiptLineAmountCandidate | undefined {
  const candidates = collectReceiptLineAmountCandidates(line, lineIndex)
  if (candidates.length === 0) {
    return undefined
  }

  const preferredExplicit = candidates.filter((candidate) => candidate.currency === preferredCurrency && candidate.hasExplicitCurrency)
  if (preferredExplicit.length > 0) {
    return preferredExplicit[preferredExplicit.length - 1]
  }

  const preferredBare = candidates.filter((candidate) => candidate.currency === preferredCurrency)
  if (preferredBare.length > 0) {
    return preferredBare[preferredBare.length - 1]
  }

  return candidates[candidates.length - 1]
}

function buildPrimaryAmountResultFromAnchoredCandidate(candidate: ReceiptLineAmountCandidate): {
  raw: string
  supplementaryAmounts: ReceiptVendorProfileSupplementaryAmount[]
} {
  const supplementaryAmounts = buildSupplementaryAmountsFromLine(
    candidate.line,
    candidate.lineIndex,
    candidate.raw,
    candidate.currency
  )

  return {
    raw: candidate.raw,
    supplementaryAmounts
  }
}

function buildSupplementaryAmountsFromLine(
  line: string,
  lineIndex: number,
  primaryRaw: string,
  primaryCurrency: string
): ReceiptVendorProfileSupplementaryAmount[] {
  return collectReceiptLineAmountCandidates(line, lineIndex)
    .filter((lineCandidate) => lineCandidate.raw !== primaryRaw || lineCandidate.currency !== primaryCurrency)
    .map((lineCandidate) => ({
      raw: lineCandidate.raw,
      currency: lineCandidate.currency,
      amountMinor: lineCandidate.amountMinor,
      label: lineCandidate.currency === 'EUR' ? 'secondary-eur-total' : 'secondary-total'
    }))
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
  const candidateLines = mergeUniqueReceiptLines([line, normalizeReceiptOcrAmountLine(line)])

  for (const candidateLine of candidateLines) {
    for (const match of candidateLine.matchAll(suffixPattern)) {
      const raw = `${match[1]} ${normalizeReceiptCurrency(match[2] ?? '')}`
      if (shouldRejectReceiptMoneyMatch(raw, candidateLine)) {
        continue
      }
      const parsed = safeParseReceiptMoney(raw)
      if (parsed) {
        matches.push({ raw, currency: parsed.currency, amountMinor: parsed.amountMinor })
      }
    }

    for (const match of candidateLine.matchAll(prefixPattern)) {
      const raw = `${match[2]} ${normalizeReceiptCurrency(match[1] ?? '')}`
      if (shouldRejectReceiptMoneyMatch(raw, candidateLine)) {
        continue
      }
      const parsed = safeParseReceiptMoney(raw)
      if (parsed) {
        matches.push({ raw, currency: parsed.currency, amountMinor: parsed.amountMinor })
      }
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

function collectReceiptLineAmountCandidates(line: string, lineIndex: number): ReceiptLineAmountCandidate[] {
  const explicitCandidates = collectReceiptMoneyMatches(line).map((candidate, matchIndex) => ({
    ...candidate,
    line,
    lineIndex,
    matchIndex,
    hasExplicitCurrency: true
  }))
  const bareCandidates: ReceiptLineAmountCandidate[] = []
  const bareAmountPattern = /-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2}\b/g

  for (const [matchIndex, match] of Array.from(line.matchAll(bareAmountPattern)).entries()) {
    const rawAmount = match[0]?.trim()
    if (!rawAmount) {
      continue
    }

    const parsed = safeParseReceiptMoney(`${rawAmount} CZK`)
    if (!parsed) {
      continue
    }

    if (shouldRejectReceiptMoneyMatch(`${rawAmount} CZK`, line)) {
      continue
    }

    if (explicitCandidates.some((candidate) => candidate.amountMinor === parsed.amountMinor && candidate.currency === parsed.currency)) {
      continue
    }

    bareCandidates.push({
      raw: `${rawAmount} CZK`,
      currency: parsed.currency,
      amountMinor: parsed.amountMinor,
      line,
      lineIndex,
      matchIndex: explicitCandidates.length + matchIndex,
      hasExplicitCurrency: false
    })
  }

  return [...explicitCandidates, ...bareCandidates]
}

function collectReceiptDebugAmountCandidates(lines: string[]): ReceiptMoneyCandidate[] {
  return lines.flatMap((line, lineIndex) =>
    collectReceiptLineAmountCandidates(line, lineIndex).map((candidate) => ({
      raw: candidate.raw,
      currency: candidate.currency,
      amountMinor: candidate.amountMinor,
      line: candidate.line,
      lineIndex: candidate.lineIndex,
      matchIndex: candidate.matchIndex
    }))
  )
}

function preNormalizeReceiptOcrLines(content: string): ReceiptOcrPreNormalization {
  const normalizedLines = splitReceiptLines(content)
  const reconstructedReceiptLines = mergeUniqueReceiptLines([
    ...normalizedLines,
    ...reconstructReceiptOcrLineClusters(normalizedLines)
  ])
  const footerWindow = buildReceiptFooterWindow(normalizedLines)
  const reconstructedFooterLines = footerWindow.reconstructedFooterLines

  return {
    normalizedLines,
    reconstructedReceiptLines,
    reconstructedFooterLines,
    footerWindowLines: footerWindow.footerWindowLines,
    footerAnchorMatched: footerWindow.footerAnchorMatched,
    reconstructedAmountTokens: footerWindow.reconstructedAmountTokens
  }
}

function buildReceiptFooterWindow(lines: string[]): {
  footerWindowLines: string[]
  reconstructedFooterLines: string[]
  footerAnchorMatched: boolean
  reconstructedAmountTokens: string[]
} {
  const strongAnchorIndices = collectReceiptFooterAnchorIndices(lines, 'strong')
  const weakAnchorIndices = collectReceiptFooterAnchorIndices(lines, 'weak')
  const anchorIndices = strongAnchorIndices.length > 0
    ? strongAnchorIndices
    : weakAnchorIndices

  if (anchorIndices.length === 0) {
    return {
      footerWindowLines: [],
      reconstructedFooterLines: [],
      footerAnchorMatched: false,
      reconstructedAmountTokens: []
    }
  }

  const firstAnchorIndex = Math.min(...anchorIndices)
  const footerWindowLines = lines.slice(Math.max(0, firstAnchorIndex - 1))
  const reconstructedFooterLines = reconstructReceiptFooterPaymentArea(footerWindowLines)
  const reconstructedAmountTokens = collectReconstructedAmountTokens(reconstructedFooterLines)

  return {
    footerWindowLines,
    reconstructedFooterLines,
    footerAnchorMatched: true,
    reconstructedAmountTokens
  }
}

function reconstructReceiptOcrLineClusters(lines: string[]): string[] {
  return collectReceiptReconstructedWindows(lines, {
    maxWindowSize: 5,
    accept(window, joinedLine) {
      return window.every((line) => isMergeableReceiptClusterLine(line))
        && (
          containsReceiptDateOrTime(joinedLine)
          || containsReceiptAmountOrCurrency(joinedLine)
          || containsReceiptFooterAnchor(joinedLine)
        )
    }
  })
}

function reconstructReceiptFooterPaymentArea(lines: string[]): string[] {
  const footerWindows = collectReceiptReconstructedWindows(lines, {
    maxWindowSize: 5,
    accept(window, joinedLine) {
      return window.every((line) => isMergeableReceiptClusterLine(line))
        && containsReceiptFooterAnchor(joinedLine)
        && containsReceiptNumericAmount(joinedLine)
    }
  })
  const rawFooterLines = lines.filter((line) =>
    containsReceiptFooterAnchor(line) && containsReceiptNumericAmount(line)
  )

  return mergeUniqueReceiptLines([
    ...rawFooterLines,
    ...footerWindows
  ])
}

function collectReceiptReconstructedWindows(
  lines: string[],
  options: {
    maxWindowSize: number
    accept: (window: string[], joinedLine: string) => boolean
  }
): string[] {
  const windows: string[] = []

  for (let startIndex = 0; startIndex < lines.length; startIndex += 1) {
    for (let windowSize = 2; windowSize <= options.maxWindowSize; windowSize += 1) {
      const window = lines.slice(startIndex, startIndex + windowSize)

      if (window.length !== windowSize) {
        continue
      }

      const joinedLine = joinReceiptFragmentWindow(window)

      if (!joinedLine || joinedLine.length > 96) {
        continue
      }

      if (options.accept(window, joinedLine)) {
        windows.push(joinedLine)
      }
    }
  }

  return mergeUniqueReceiptLines(windows)
}

function joinReceiptFragmentWindow(window: string[]): string {
  return normalizeReceiptVendorLine(normalizeReceiptOcrAmountLine(window.join(' ')))
}

function mergeUniqueReceiptLines(lines: string[]): string[] {
  return Array.from(new Set(lines.map((line) => normalizeReceiptVendorLine(line)).filter(Boolean)))
}

function collectReceiptFooterAnchorIndices(lines: string[], strength: 'strong' | 'weak'): number[] {
  return lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => {
      const normalizedLine = normalizeReceiptVendorText(line)
      if (strength === 'strong') {
        return /\b(celkem|k celkem|platebni|platba|kartou|karta|visa|mastercard|hotovost|pin ok|czk)\b/.test(normalizedLine)
          && index >= Math.max(0, Math.floor(lines.length / 3))
      }

      return /\b(prodej)\b/.test(normalizedLine)
        && index >= Math.max(0, lines.length - 8)
    })
    .map(({ index }) => index)
}

function isMergeableReceiptClusterLine(line: string): boolean {
  return line.length <= 24
    || containsReceiptFooterAnchor(line)
    || containsReceiptDateOrTime(line)
    || containsReceiptAmountOrCurrency(line)
    || /\b(datum|date|prodeje|purchase|nakup|n[aá]kup|transakce|transaction|uctenka|doklad|visa|mastercard|maestro|platebni|platba|hotovost|cash|card|payment|celkem|zaplaceno|uhrazeno|czk|eur)\b/i.test(line)
}

function containsReceiptFooterAnchor(line: string): boolean {
  return /\b(celkem|k celkem|platebni|platba|kartou|karta|visa|mastercard|maestro|czk|kč|kc|hotovost|cash|card|payment|pin ok|prodej|zaplaceno|uhrazeno)\b/i.test(normalizeReceiptVendorText(line))
}

function containsReceiptDateOrTime(line: string): boolean {
  return /\b\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})\b/.test(line)
    || /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(line)
}

function containsReceiptAmountOrCurrency(line: string): boolean {
  return /\b(CZK|KČ|KC|EUR|€)\b/i.test(line)
    || /\b-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2}\b/.test(line)
}

function containsReceiptNumericAmount(line: string): boolean {
  return /\b-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2}\b/.test(line)
}

function collectReconstructedAmountTokens(lines: string[]): string[] {
  const tokens = lines.flatMap((line) => {
    const normalizedLine = normalizeReceiptOcrAmountLine(line)
    return Array.from(normalizedLine.matchAll(/\b-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2}\b/g)).map((match) => match[0] ?? '')
  }).filter(Boolean)

  return Array.from(new Set(tokens))
}

function normalizeReceiptOcrAmountLine(line: string): string {
  return line
    .replace(/fi/gi, '8')
    .replace(/[?]/g, '7')
    .replace(/([,.]\s*)(?:il|li|ll|ii|i1|1i|l1|1l)\b/gi, '$10')
    .replace(/\b(?:il|li|ll|ii|i1|1i|l1|1l)\b/gi, '10')
    .replace(/([0-9])[oO](?=[0-9.,])/g, '$10')
    .replace(/([,.]\s*7)[iIlL](?=\b)/g, '$10')
    .replace(/(?<=\d)[bB](?=[\d,.])/g, '8')
}

function isLikelyReceiptBodyItemLine(normalizedLine: string): boolean {
  return /\b(persil|item|qty|mnozstvi|množství|ks|kus|banany|banany|gel|sprchovy|sprchový|clubcard)\b/.test(normalizedLine)
}

function collectRejectedHighScoreBodyCandidates(input: {
  candidates: ReceiptParsingAmountCandidateDebug[]
  footerLines: string[]
  vendorProfileKey: 'tesco' | 'dm'
}): ReceiptParsingAmountCandidateDebug[] {
  const footerLineSet = new Set(input.footerLines)
  const bodyCandidates = input.candidates
    .filter((candidate) => !footerLineSet.has(candidate.line))
    .filter((candidate) => isLikelyReceiptBodyItemLine(normalizeReceiptVendorText(candidate.line)))
  if (bodyCandidates.length === 0) {
    return []
  }

  const maxBodyScore = Math.max(...bodyCandidates.map((candidate) => candidate.score ?? Number.NEGATIVE_INFINITY))
  const threshold = Math.max(
    input.vendorProfileKey === 'tesco' ? -60 : -40,
    maxBodyScore - 40
  )

  return dedupeRejectedBodyCandidates(bodyCandidates)
    .filter((candidate) => (candidate.score ?? Number.NEGATIVE_INFINITY) >= threshold)
    .sort((left, right) => {
      if ((right.score ?? 0) !== (left.score ?? 0)) {
        return (right.score ?? 0) - (left.score ?? 0)
      }

      return left.line.length - right.line.length
    })
    .slice(0, 5)
}

function dedupeRejectedBodyCandidates(candidates: ReceiptParsingAmountCandidateDebug[]): ReceiptParsingAmountCandidateDebug[] {
  const byAmount = new Map<string, ReceiptParsingAmountCandidateDebug>()

  for (const candidate of candidates) {
    const key = `${candidate.raw}:${candidate.amountMinor}:${candidate.currency}`
    const existing = byAmount.get(key)

    if (!existing) {
      byAmount.set(key, candidate)
      continue
    }

    const existingScore = existing.score ?? Number.NEGATIVE_INFINITY
    const candidateScore = candidate.score ?? Number.NEGATIVE_INFINITY
    if (candidateScore > existingScore || (candidateScore === existingScore && candidate.line.length < existing.line.length)) {
      byAmount.set(key, candidate)
    }
  }

  return Array.from(byAmount.values())
}

function shouldRejectReceiptMoneyMatch(raw: string, line: string): boolean {
  const normalizedLine = normalizeReceiptVendorText(line)
  if (!/(datum|date|nakup|n[aá]kup|purchase|prodej|transaction|transakce)/.test(normalizedLine)) {
    return false
  }

  const dateLikePrefixes = Array.from(line.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/g)).flatMap((match) => {
    const day = match[1] ?? ''
    const month = match[2] ?? ''
    return day && month ? [`${day}.${month}`, `${day},${month}`] : []
  })
  const normalizedRaw = raw.replace(/\s+(CZK|EUR)$/i, '').trim()

  return dateLikePrefixes.includes(normalizedRaw)
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

function extractNormalizedReceiptDateFromLine(line: string): string | undefined {
  const dateMatches = [
    ...Array.from(line.matchAll(/\b(\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4}))\b/g)).map((match) => match[1]),
    ...Array.from(line.matchAll(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{2}|\d{4})\b/g)).map((match) => `${match[1]}.${match[2]}.${match[3]}`)
  ]

  for (const rawCandidate of dateMatches) {
    const normalizedRawCandidate = normalizeReceiptYear(rawCandidate)
    const normalizedDate = safeNormalizeReceiptDate(normalizedRawCandidate)

    if (normalizedDate) {
      return normalizedRawCandidate
    }
  }

  return undefined
}

function toReceiptParsingAmountCandidateDebug(
  candidate: ReceiptMoneyCandidate,
  source: string
): ReceiptParsingAmountCandidateDebug {
  return {
    lineIndex: candidate.lineIndex,
    matchIndex: candidate.matchIndex,
    line: candidate.line,
    raw: candidate.raw,
    currency: candidate.currency,
    amountMinor: candidate.amountMinor,
    source
  }
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