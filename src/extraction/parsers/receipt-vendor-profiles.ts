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
  anchoredSearchInputSource: 'raw-normalized-lines' | 'footer-window-lines' | 'reconstructed-footer-lines'
  anchoredCandidateCountBeforeReconstruction: number
  anchoredCandidateCountAfterReconstruction: number
  footerAnchorMatched: boolean
  finalTotalCandidateScope: 'footer-window' | 'reconstructed-lines' | 'generic-fallback'
  footerAmountCandidatesRaw: string[]
  footerAmountCandidatesNormalized: ReceiptParsingAmountCandidateDebug[]
  footerAmountWinnerRaw?: string
  footerAmountWinnerReason: string
  footerAnchorRejectedLines: string[]
  footerNormalizationSteps: string[]
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
  footerAmountCandidateLinesRaw: string[]
  footerAnchorRejectedLines: string[]
  footerNormalizationSteps: string[]
}

interface ReceiptAnchoredCandidateSearchResult {
  candidates: ReceiptLineAmountCandidate[]
  searchInputSource: 'raw-normalized-lines' | 'footer-window-lines' | 'reconstructed-footer-lines'
  rawCandidateCount: number
  reconstructedCandidateCount: number
  footerAmountCandidatesRaw: string[]
  footerAmountCandidatesNormalized: ReceiptLineAmountCandidate[]
  footerAmountWinnerRaw?: string
  footerAmountWinnerReason: string
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
      footerAmountCandidatesRaw: anchoredSearch.footerAmountCandidatesRaw,
      footerAmountCandidatesNormalized: anchoredSearch.footerAmountCandidatesNormalized
        .map((candidate) => toReceiptParsingAmountCandidateDebug(candidate, 'footer-normalized-candidate')),
      ...(anchoredSearch.footerAmountWinnerRaw ? { footerAmountWinnerRaw: anchoredSearch.footerAmountWinnerRaw } : {}),
      footerAmountWinnerReason: anchoredSearch.footerAmountWinnerReason,
      footerAnchorRejectedLines: preNormalized.footerAnchorRejectedLines,
      footerNormalizationSteps: preNormalized.footerNormalizationSteps,
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
      footerAmountCandidatesRaw: anchoredSearch.footerAmountCandidatesRaw,
      footerAmountCandidatesNormalized: anchoredSearch.footerAmountCandidatesNormalized
        .map((candidate) => toReceiptParsingAmountCandidateDebug(candidate, 'footer-normalized-candidate')),
      ...(anchoredSearch.footerAmountWinnerRaw ? { footerAmountWinnerRaw: anchoredSearch.footerAmountWinnerRaw } : {}),
      footerAmountWinnerReason: anchoredSearch.footerAmountWinnerReason,
      footerAnchorRejectedLines: preNormalized.footerAnchorRejectedLines,
      footerNormalizationSteps: preNormalized.footerNormalizationSteps,
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
      footerAmountCandidatesRaw: preNormalized.footerAmountCandidateLinesRaw,
      footerAmountCandidatesNormalized: [],
      footerAmountWinnerReason: preNormalized.footerAnchorMatched
        ? 'footer-anchor-without-amount-candidate'
        : 'no-footer-anchor',
      footerAnchorRejectedLines: preNormalized.footerAnchorRejectedLines,
      footerNormalizationSteps: preNormalized.footerNormalizationSteps,
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
    footerAmountCandidatesRaw: preNormalized.footerAmountCandidateLinesRaw,
    footerAmountCandidatesNormalized: [],
    footerAmountWinnerReason: preNormalized.footerAnchorMatched
      ? 'footer-anchor-without-amount-candidate'
      : 'no-footer-anchor',
    footerAnchorRejectedLines: preNormalized.footerAnchorRejectedLines,
    footerNormalizationSteps: preNormalized.footerNormalizationSteps,
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
    const footerSupplementaryAmounts = collectDmSupplementaryAmounts(
      preNormalized,
      anchoredResult.raw,
      anchoredCandidate.currency
    )

    if (footerSupplementaryAmounts.length > 0) {
      return {
        raw: anchoredResult.raw,
        supplementaryAmounts: footerSupplementaryAmounts
      }
    }

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

function collectDmSupplementaryAmounts(
  preNormalized: ReceiptOcrPreNormalization,
  primaryRaw: string,
  primaryCurrency: string
): ReceiptVendorProfileSupplementaryAmount[] {
  const footerLines = mergeUniqueReceiptLines([
    ...preNormalized.reconstructedFooterLines,
    ...preNormalized.footerWindowLines
  ])

  for (const [lineIndex, line] of footerLines.entries()) {
    const lineCandidates = collectReceiptFooterLineAmountCandidates(line, lineIndex)
    const hasPrimaryAmount = lineCandidates.some((candidate) => candidate.raw === primaryRaw && candidate.currency === primaryCurrency)

    if (!hasPrimaryAmount) {
      continue
    }

    const supplementaryAmounts = buildSupplementaryAmountsFromLine(line, lineIndex, primaryRaw, primaryCurrency)
      .filter((candidate, candidateIndex, allCandidates) =>
        allCandidates.findIndex((otherCandidate) =>
          otherCandidate.raw === candidate.raw
          && otherCandidate.currency === candidate.currency
          && otherCandidate.amountMinor === candidate.amountMinor
        ) === candidateIndex
      )

    if (supplementaryAmounts.length > 0) {
      return supplementaryAmounts
    }
  }

  return []
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
  const normalizedFooterCandidates = collectFooterAmountCandidates(preNormalized)

  if (preNormalized.footerWindowLines.length === 0) {
    return {
      candidates: [],
      searchInputSource: 'footer-window-lines',
      rawCandidateCount: 0,
      reconstructedCandidateCount: 0,
      footerAmountCandidatesRaw: [],
      footerAmountCandidatesNormalized: normalizedFooterCandidates,
      footerAmountWinnerReason: 'no-footer-anchor'
    }
  }

  const rawCandidates = collectAnchoredReceiptAmountCandidates(preNormalized.footerWindowLines, options, collectReceiptFooterLineAmountCandidates)
  const reconstructedCandidates = collectAnchoredReceiptAmountCandidates(preNormalized.reconstructedFooterLines, options, collectReceiptFooterLineAmountCandidates)

  if (reconstructedCandidates.length > 0) {
    return {
      candidates: reconstructedCandidates,
      searchInputSource: 'reconstructed-footer-lines',
      rawCandidateCount: rawCandidates.length,
      reconstructedCandidateCount: reconstructedCandidates.length,
      footerAmountCandidatesRaw: preNormalized.footerAmountCandidateLinesRaw,
      footerAmountCandidatesNormalized: normalizedFooterCandidates,
      footerAmountWinnerRaw: reconstructedCandidates[0]?.raw,
      footerAmountWinnerReason: 'selected-reconstructed-footer-candidate'
    }
  }

  if (rawCandidates.length > 0) {
    return {
      candidates: rawCandidates,
      searchInputSource: 'footer-window-lines',
      rawCandidateCount: rawCandidates.length,
      reconstructedCandidateCount: reconstructedCandidates.length,
      footerAmountCandidatesRaw: preNormalized.footerAmountCandidateLinesRaw,
      footerAmountCandidatesNormalized: normalizedFooterCandidates,
      footerAmountWinnerRaw: rawCandidates[0]?.raw,
      footerAmountWinnerReason: 'selected-footer-window-candidate'
    }
  }

  return {
    candidates: [],
    searchInputSource: 'footer-window-lines',
    rawCandidateCount: rawCandidates.length,
    reconstructedCandidateCount: reconstructedCandidates.length,
    footerAmountCandidatesRaw: preNormalized.footerAmountCandidateLinesRaw,
    footerAmountCandidatesNormalized: normalizedFooterCandidates,
    footerAmountWinnerReason: 'footer-anchor-without-amount-candidate'
  }
}

function collectFooterAmountCandidates(preNormalized: ReceiptOcrPreNormalization): ReceiptLineAmountCandidate[] {
  const candidateLines = mergeUniqueReceiptLines([
    ...preNormalized.footerAmountCandidateLinesRaw,
    ...preNormalized.reconstructedFooterLines,
    ...preNormalized.footerWindowLines
  ])

  return dedupeReceiptLineAmountCandidates(
    candidateLines.flatMap((line, lineIndex) => collectReceiptFooterLineAmountCandidates(line, lineIndex))
  )
}

function collectAnchoredReceiptAmountCandidates(
  lines: string[],
  options: {
    paymentAnchorPattern: RegExp
    totalAnchorPattern: RegExp
    rejectPattern: RegExp
    preferredCurrency: string
  },
  candidateCollector: (line: string, lineIndex: number) => ReceiptLineAmountCandidate[] = collectReceiptLineAmountCandidates
): ReceiptLineAmountCandidate[] {
  const candidates: ReceiptLineAmountCandidate[] = []

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    const normalizedLine = normalizeReceiptVendorText(line)
    const footerSignalText = normalizeReceiptFooterSignalText(line)

    if (!options.paymentAnchorPattern.test(normalizedLine) && !containsReceiptPaymentAnchorSignal(footerSignalText)) {
      continue
    }

    const candidate = selectPreferredAnchoredLineAmount(line, index, options.preferredCurrency, candidateCollector)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!
    const normalizedLine = normalizeReceiptVendorText(line)
    const footerSignalText = normalizeReceiptFooterSignalText(line)

    if ((!options.totalAnchorPattern.test(normalizedLine) && !containsReceiptTotalAnchorSignal(footerSignalText)) || options.rejectPattern.test(normalizedLine)) {
      continue
    }

    const candidate = selectPreferredAnchoredLineAmount(line, index, options.preferredCurrency, candidateCollector)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  return candidates
}

function selectPreferredAnchoredLineAmount(
  line: string,
  lineIndex: number,
  preferredCurrency: string,
  candidateCollector: (line: string, lineIndex: number) => ReceiptLineAmountCandidate[] = collectReceiptLineAmountCandidates
): ReceiptLineAmountCandidate | undefined {
  const candidates = candidateCollector(line, lineIndex)
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
  const lineCandidates = hasAnyReceiptFooterSignal(line)
    ? collectReceiptFooterLineAmountCandidates(line, lineIndex)
    : collectReceiptLineAmountCandidates(line, lineIndex)

  return lineCandidates
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
    const signalText = normalizeReceiptFooterSignalText(line)

    if (containsReceiptVisaSignal(signalText) && containsReceiptCurrencySignal(signalText)) {
      return 'VISA CZK'
    }
    if (containsReceiptVisaSignal(signalText)) {
      return 'VISA'
    }
    if (/\b(hotovost|cash)\b/i.test(line)) {
      return 'Platba hotove'
    }
    if (containsReceiptCardSignal(signalText)) {
      return 'Platba kartou'
    }
  }

  return undefined
}

function findDmPaymentMethod(lines: string[]): string | undefined {
  for (const line of lines) {
    const signalText = normalizeReceiptFooterSignalText(line)

    if (containsReceiptVisaSignal(signalText) && containsReceiptCurrencySignal(signalText)) {
      return 'VISA CZK'
    }
    if (containsReceiptVisaSignal(signalText)) {
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

function collectReceiptFooterLineAmountCandidates(line: string, lineIndex: number): ReceiptLineAmountCandidate[] {
  return collectReceiptLineAmountCandidatesFromCandidateLines(
    mergeUniqueReceiptLines([
      line,
      normalizeReceiptOcrAmountLine(line),
      normalizeReceiptFooterAmountLine(line),
      normalizeReceiptFooterAmountLine(normalizeReceiptOcrAmountLine(line))
    ]),
    lineIndex
  )
}

function collectReceiptLineAmountCandidatesFromCandidateLines(
  candidateLines: string[],
  lineIndex: number
): ReceiptLineAmountCandidate[] {
  const explicitCandidates: ReceiptLineAmountCandidate[] = []
  const bareCandidates: ReceiptLineAmountCandidate[] = []
  const bareAmountPattern = /-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2}\b/g

  for (const [variantIndex, candidateLine] of candidateLines.entries()) {
    for (const [matchIndex, candidate] of collectReceiptMoneyMatches(candidateLine).entries()) {
      explicitCandidates.push({
        ...candidate,
        line: candidateLine,
        lineIndex,
        matchIndex: variantIndex * 10 + matchIndex,
        hasExplicitCurrency: true
      })
    }

    for (const [matchIndex, match] of Array.from(candidateLine.matchAll(bareAmountPattern)).entries()) {
      const rawAmount = match[0]?.trim()
      if (!rawAmount) {
        continue
      }

      const parsed = safeParseReceiptMoney(`${rawAmount} CZK`)
      if (!parsed) {
        continue
      }

      if (shouldRejectReceiptMoneyMatch(`${rawAmount} CZK`, candidateLine)) {
        continue
      }

      if (explicitCandidates.some((candidate) =>
        candidate.line === candidateLine
        && candidate.amountMinor === parsed.amountMinor
        && candidate.currency === parsed.currency
      )) {
        continue
      }

      bareCandidates.push({
        raw: `${rawAmount} CZK`,
        currency: parsed.currency,
        amountMinor: parsed.amountMinor,
        line: candidateLine,
        lineIndex,
        matchIndex: variantIndex * 10 + explicitCandidates.length + matchIndex,
        hasExplicitCurrency: false
      })
    }
  }

  return dedupeReceiptLineAmountCandidates([...explicitCandidates, ...bareCandidates])
}

function dedupeReceiptLineAmountCandidates(candidates: ReceiptLineAmountCandidate[]): ReceiptLineAmountCandidate[] {
  const byKey = new Map<string, ReceiptLineAmountCandidate>()

  for (const candidate of candidates) {
    const key = `${candidate.line}:${candidate.raw}:${candidate.amountMinor}:${candidate.currency}`
    const existing = byKey.get(key)

    if (!existing || candidate.matchIndex < existing.matchIndex) {
      byKey.set(key, candidate)
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.lineIndex !== right.lineIndex) {
      return left.lineIndex - right.lineIndex
    }

    return left.matchIndex - right.matchIndex
  })
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
  const normalizedLines = collapseReceiptSingleGlyphRuns(splitReceiptLines(content))
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
    reconstructedAmountTokens: footerWindow.reconstructedAmountTokens,
    footerAmountCandidateLinesRaw: footerWindow.footerAmountCandidateLinesRaw,
    footerAnchorRejectedLines: footerWindow.footerAnchorRejectedLines,
    footerNormalizationSteps: footerWindow.footerNormalizationSteps
  }
}

function buildReceiptFooterWindow(lines: string[]): {
  footerWindowLines: string[]
  reconstructedFooterLines: string[]
  footerAnchorMatched: boolean
  reconstructedAmountTokens: string[]
  footerAmountCandidateLinesRaw: string[]
  footerAnchorRejectedLines: string[]
  footerNormalizationSteps: string[]
} {
  const anchorDiagnostics = collectReceiptFooterAnchorDiagnostics(lines)
  const anchorIndices = anchorDiagnostics.anchorIndices

  if (anchorIndices.length === 0) {
    return {
      footerWindowLines: [],
      reconstructedFooterLines: [],
      footerAnchorMatched: false,
      reconstructedAmountTokens: [],
      footerAmountCandidateLinesRaw: [],
      footerAnchorRejectedLines: anchorDiagnostics.rejectedLines,
      footerNormalizationSteps: anchorDiagnostics.normalizationSteps
    }
  }

  const firstAnchorIndex = Math.min(...anchorIndices)
  const footerWindowLines = lines.slice(Math.max(0, firstAnchorIndex - 1))
  const footerAmountCandidateLinesRaw = collectReceiptFooterCandidateLines(footerWindowLines)
  const reconstructedFooterLines = reconstructReceiptFooterPaymentArea(footerAmountCandidateLinesRaw)
  const reconstructedAmountTokens = collectReconstructedAmountTokens(reconstructedFooterLines)

  return {
    footerWindowLines,
    reconstructedFooterLines,
    footerAnchorMatched: true,
    reconstructedAmountTokens,
    footerAmountCandidateLinesRaw,
    footerAnchorRejectedLines: anchorDiagnostics.rejectedLines,
    footerNormalizationSteps: [
      ...anchorDiagnostics.normalizationSteps,
      `footer-window-start:${firstAnchorIndex}`,
      `footer-window-size:${footerWindowLines.length}`,
      `footer-raw-candidate-lines:${footerAmountCandidateLinesRaw.length}`,
      `footer-reconstructed-lines:${reconstructedFooterLines.length}`,
      `footer-reconstructed-amount-tokens:${reconstructedAmountTokens.length}`
    ]
  }
}

function reconstructReceiptOcrLineClusters(lines: string[]): string[] {
  return collectReceiptReconstructedWindows(lines, {
    maxWindowSize: 8,
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

function collectReceiptFooterCandidateLines(lines: string[]): string[] {
  return mergeUniqueReceiptLines([
    ...lines.filter((line) => hasAnyReceiptFooterSignal(line)),
    ...collectReceiptFooterRawJoinedWindows(lines)
  ])
}

function collectReceiptFooterRawJoinedWindows(lines: string[]): string[] {
  const windows: string[] = []

  for (let startIndex = 0; startIndex < lines.length; startIndex += 1) {
    for (let windowSize = 2; windowSize <= 12; windowSize += 1) {
      const window = lines.slice(startIndex, startIndex + windowSize)

      if (window.length !== windowSize || !window.every((line) => isMergeableReceiptClusterLine(line))) {
        continue
      }

      const joinedLine = normalizeReceiptFooterAmountLine(window.join(' '))
      if (!joinedLine || joinedLine.length > 180) {
        continue
      }

      if ((hasAnyReceiptFooterSignal(joinedLine) && containsReceiptAmountFragment(joinedLine)) || scoreReceiptFooterAnchorCandidate(joinedLine) >= 2) {
        windows.push(joinedLine)
      }
    }
  }

  return mergeUniqueReceiptLines(windows)
}

function scoreReceiptFooterAnchorCandidate(line: string): number {
  const signalText = normalizeReceiptFooterSignalText(line)
  let score = 0

  if (containsReceiptTotalAnchorSignal(signalText)) {
    score += 3
  }

  if (containsReceiptPaymentAnchorSignal(signalText)) {
    score += 2
  }

  if (containsReceiptCurrencySignal(signalText)) {
    score += 1
  }

  if (containsReceiptVatSignal(signalText)) {
    score += 1
  }

  if (containsReceiptAmountFragment(line)) {
    score += 1
  }

  return score
}

function reconstructReceiptFooterPaymentArea(lines: string[]): string[] {
  return mergeUniqueReceiptLines(
    lines
      .map((line) => normalizeReceiptFooterAmountLine(line))
      .filter((line) => hasAnyReceiptFooterSignal(line) && containsReceiptNumericAmount(line))
  )
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

function collectReceiptFooterAnchorDiagnostics(lines: string[]): {
  anchorIndices: number[]
  rejectedLines: string[]
  normalizationSteps: string[]
} {
  const evaluationStartIndex = Math.max(0, lines.length - 64)
  const nearFooterRegionStartIndex = Math.max(0, lines.length - 24)
  const accepted = new Set<number>()
  const rejected = new Set<string>()
  let strongMatches = 0
  let weakMatches = 0

  for (let startIndex = evaluationStartIndex; startIndex < lines.length; startIndex += 1) {
    for (let windowSize = 1; windowSize <= 12; windowSize += 1) {
      const window = lines.slice(startIndex, startIndex + windowSize)

      if (window.length !== windowSize) {
        continue
      }

      const joinedLine = normalizeReceiptFooterAmountLine(window.join(' '))
      if (!joinedLine) {
        continue
      }

      const anchorScore = scoreReceiptFooterAnchorCandidate(joinedLine)
      const nearBottom = startIndex >= Math.max(0, lines.length - 10)
      const nearFooterRegion = startIndex >= nearFooterRegionStartIndex
      const extendedFooterRegion = startIndex >= evaluationStartIndex
      const hasNormalizedAmount = containsReceiptNumericAmount(joinedLine)

      if ((anchorScore >= 4 && hasNormalizedAmount && extendedFooterRegion) || anchorScore >= 5 || (anchorScore >= 3 && nearBottom)) {
        accepted.add(startIndex)
        strongMatches += 1
        continue
      }

      if (
        (anchorScore >= 3 && hasNormalizedAmount && nearFooterRegion)
        || (anchorScore >= 2 && nearBottom)
        || (anchorScore >= 2 && hasNormalizedAmount && nearFooterRegion && hasAnyReceiptFooterSignal(joinedLine))
        || (anchorScore >= 1 && nearBottom && hasNormalizedAmount && hasAnyReceiptFooterSignal(joinedLine))
      ) {
        accepted.add(startIndex)
        weakMatches += 1
        continue
      }

      if (anchorScore > 0 && (nearBottom || (extendedFooterRegion && hasNormalizedAmount))) {
        rejected.add(joinedLine)
      }
    }
  }

  return {
    anchorIndices: Array.from(accepted.values()).sort((left, right) => left - right),
    rejectedLines: Array.from(rejected.values()).slice(0, 8),
    normalizationSteps: [
      `footer-anchor-evaluation-start:${evaluationStartIndex}`,
      `footer-anchor-strong-matches:${strongMatches}`,
      `footer-anchor-weak-matches:${weakMatches}`,
      `footer-anchor-rejected:${rejected.size}`
    ]
  }
}

function isMergeableReceiptClusterLine(line: string): boolean {
  return line.length <= 24
    || containsReceiptFooterAnchor(line)
    || containsReceiptDateOrTime(line)
    || containsReceiptAmountOrCurrency(line)
    || /\b(datum|date|prodeje|purchase|nakup|n[aá]kup|transakce|transaction|uctenka|doklad|visa|mastercard|maestro|platebni|platba|hotovost|cash|card|payment|celkem|zaplaceno|uhrazeno|czk|eur)\b/i.test(line)
}

function containsReceiptFooterAnchor(line: string): boolean {
  return hasAnyReceiptFooterSignal(line)
}

function containsReceiptDateOrTime(line: string): boolean {
  return /\b\d{1,2}[./-]\d{1,2}[./-](?:\d{2}|\d{4})\b/.test(line)
    || /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(line)
}

function containsReceiptAmountOrCurrency(line: string): boolean {
  return containsReceiptCurrencySignal(normalizeReceiptFooterSignalText(line))
    || containsReceiptAmountFragment(line)
}

function containsReceiptNumericAmount(line: string): boolean {
  return /\b-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2}\b/.test(line)
}

function containsReceiptAmountFragment(line: string): boolean {
  if (containsReceiptDateOrTime(line) && !hasAnyReceiptFooterSignal(line)) {
    return false
  }

  const normalizedLine = normalizeReceiptFooterAmountLine(line)

  return containsReceiptNumericAmount(normalizedLine)
    || /\b\d{1,3}\s+\d{3}\b/.test(line)
    || /\b\d{2,4}\s+\d{2}\b/.test(line)
    || /\b[.,]\s*\d{2}\b/.test(line)
}

function collectReconstructedAmountTokens(lines: string[]): string[] {
  const tokens = lines.flatMap((line) => {
    const normalizedLine = normalizeReceiptFooterAmountLine(line)
    return Array.from(normalizedLine.matchAll(/\b-?\d{1,3}(?:[ .]\d{3})*[.,]\d{2}\b/g)).map((match) => match[0] ?? '')
  }).filter(Boolean)

  return Array.from(new Set(tokens))
}

function normalizeReceiptOcrAmountLine(line: string): string {
  return normalizeReceiptOcrSplitAmountFragments(
    line
      .replace(/fi/gi, '8')
      .replace(/ffi/gi, '8')
      .replace(/[?]/g, '7')
      .replace(/([,.]\s*)(?:il|li|ll|ii|i1|1i|l1|1l)\b/gi, '$10')
      .replace(/([,.]\s*7)(?:il|li|ll|ii|i1|1i|l1|1l)\b/gi, '$10')
      .replace(/\b(?:il|li|ll|ii|i1|1i|l1|1l)\b/gi, '10')
      .replace(/([0-9])[oO](?=[0-9.,])/g, '$10')
      .replace(/([,.]\s*7)[iIlL](?=\b)/g, '$10')
      .replace(/(?<=\d)[bB](?=[\d,.])/g, '8')
      .replace(/f+(?=\d|[.,])/gi, '8')
  )
}

function normalizeReceiptFooterAmountLine(line: string): string {
  return normalizeReceiptVendorLine(
    normalizeReceiptJoinedGlyphRun(line)
      .replace(/\bcz\s*k\b/gi, 'CZK')
      .replace(/\beu\s*r\b/gi, 'EUR')
      .replace(/\bd\s*ph\b/gi, 'DPH')
      .replace(/\bv\s*1\s*s\s*a\b/gi, 'VISA')
      .replace(/\bv1sa\b/gi, 'VISA')
      .replace(/\bpin\s*0k\b/gi, 'PIN OK')
      .replace(/\b([0-9])\s+([0-9]{3})\s*[,.]\s*([0-9]{2})\b/g, '$1 $2,$3')
      .replace(/\b([0-9])\s+([0-9]{3})\s+([0-9]{2})\b/g, '$1 $2,$3')
      .replace(/\b([0-9]{2,4})\s*[,.]\s*([0-9]{2})\b(?![./-]\d{2,4})/g, '$1,$2')
      .replace(/\b([0-9]{2,4})\s+([0-9]{2})\b(?=\s*(CZK|KČ|KC|EUR|€)\b)/gi, '$1,$2')
      .replace(/\b([0-9]+)\s*,\s*([0-9]{2})\b(?![./-]\d{2,4})/g, '$1,$2')
  )
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

function collapseReceiptSingleGlyphRuns(lines: string[]): string[] {
  const collapsed: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]!

    if (!isSingleGlyphReceiptFragment(line)) {
      collapsed.push(line)
      index += 1
      continue
    }

    let joined = line
    let nextIndex = index + 1

    while (nextIndex < lines.length && isSingleGlyphReceiptFragment(lines[nextIndex]!)) {
      joined += lines[nextIndex]!
      nextIndex += 1
    }

    collapsed.push(normalizeReceiptJoinedGlyphRun(joined))
    index = nextIndex
  }

  return collapsed.filter(Boolean)
}

function isSingleGlyphReceiptFragment(line: string): boolean {
  return /^[\p{L}\p{N}.,:/-]$/u.test(line)
}

function normalizeReceiptJoinedGlyphRun(line: string): string {
  return normalizeReceiptVendorLine(
    normalizeReceiptOcrAmountLine(line)
      .replace(/([\p{L}])(?=\d)/gu, '$1 ')
      .replace(/(\d)(?=[\p{L}])/gu, '$1 ')
      .replace(/(\d{1,2}\.\d{1,2}\.\d{4})(?=\d{1,2}:\d{2}(?::\d{2})?)/g, '$1 ')
      .replace(/\b(\d{1,3})(\d{3}[.,]\d{2})\b/g, '$1 $2')
  )
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

function normalizeReceiptFooterSignalText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[|!]/g, '1')
    .replace(/\$/g, 's')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/5/g, 's')
    .replace(/4/g, 'a')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/6/g, 'g')
    .replace(/2/g, 'z')
    .replace(/3/g, 'e')
    .replace(/[^a-z]+/g, '')
}

function containsReceiptTotalAnchorSignal(signalText: string): boolean {
  return /(celkem|ceikem|ceikern|celkern|celkcm|telkem|telkr|ilerkem|total|kplatbe|zaplaceno|uhrazeno)/.test(signalText)
}

function containsReceiptVisaSignal(signalText: string): boolean {
  return /(visa|uisa|usa)/.test(signalText)
}

function containsReceiptCardSignal(signalText: string): boolean {
  const sanitizedSignalText = signalText.replace(/clubcard/g, '')

  return /(visa|uisa|usa|mastercard|maestro|karta|kartou|card|payment|pinok|prodej|ptodej|hotovost|cash)/.test(sanitizedSignalText)
}

function containsReceiptPaymentAnchorSignal(signalText: string): boolean {
  return containsReceiptCardSignal(signalText)
}

function containsReceiptCurrencySignal(signalText: string): boolean {
  return /(czk|eur|euro)/.test(signalText)
}

function containsReceiptVatSignal(signalText: string): boolean {
  return /(dph|vat)/.test(signalText)
}

function hasAnyReceiptFooterSignal(value: string): boolean {
  const signalText = normalizeReceiptFooterSignalText(value)

  return containsReceiptTotalAnchorSignal(signalText)
    || containsReceiptPaymentAnchorSignal(signalText)
    || containsReceiptCurrencySignal(signalText)
    || containsReceiptVatSignal(signalText)
}

function normalizeReceiptOcrSplitAmountFragments(line: string): string {
  return line.replace(/\b([\p{L}\p{N}$?']{2,8})\s*,\s*([\p{L}\p{N}$?']{1,3})\b/gu, (match, wholePart, decimalPart) => {
    const normalizedWholePart = normalizeReceiptOcrAmountFragment(String(wholePart), false)
    const normalizedDecimalPart = normalizeReceiptOcrAmountFragment(String(decimalPart), true)

    if (!normalizedWholePart || !normalizedDecimalPart) {
      return match
    }

    const normalizedCandidate = `${normalizedWholePart},${normalizedDecimalPart}`
    return /^\d{2,4},\d{2}$/.test(normalizedCandidate) ? normalizedCandidate : match
  })
}

function normalizeReceiptOcrAmountFragment(value: string, decimalPart: boolean): string {
  const normalized = value
    .replace(/ffi/gi, '8')
    .replace(/fi/gi, '8')
    .replace(/f+(?=\d|$)/gi, '8')
    .replace(/[?]/g, '7')
    .replace(/[oO]/g, '0')
    .replace(/[dD]/g, '5')
    .replace(/[tT]/g, '7')
    .replace(/[zZ]/g, '2')
    .replace(/[aA]/g, '8')
    .replace(/[gG]/g, '6')
    .replace(/[$sS]/g, decimalPart ? '5' : '3')
    .replace(/[iIlLjJ|!]/g, decimalPart ? '0' : '1')
    .replace(/[^0-9]/g, '')

  if (!normalized) {
    return ''
  }

  if (decimalPart) {
    return normalized.length >= 2 ? normalized.slice(0, 2) : normalized.padEnd(2, '0')
  }

  return normalized.length > 4 ? normalized.slice(0, 4) : normalized
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