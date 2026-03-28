import type { ExtractedRecord, SourceDocument } from '../../domain'
import {
  DeterministicParserError,
  findMissingHeaders,
  parseAmountMinor,
  parseDelimitedContent,
  parseDelimitedRows,
  parseIsoDate
} from './csv-utils'

export interface ParseAirbnbPayoutExportInput {
  sourceDocument: SourceDocument
  content: string
  extractedAt: string
}

export interface AirbnbPayoutHeaderDiagnostics {
  parserVariant: 'structured-export' | 'real-mixed-export'
  rawHeaderRow: string
  normalizedHeaders: string[]
  normalizedHeaderMap: string[]
  requiredCanonicalHeaders: string[]
  mappedCanonicalHeaders: Partial<Record<'payoutDate' | 'amountMinor' | 'currency' | 'payoutReference' | 'reservationId' | 'listingId', string>>
  candidateSourceHeaders: string[]
  missingCanonicalHeaders: string[]
}

const REQUIRED_HEADERS = [
  'payoutDate',
  'amountMinor',
  'currency',
  'payoutReference',
  'reservationId',
  'listingId'
]

const HEADER_ALIASES = {
  payoutDate: [
    'payoutDate',
    'payout_date',
    'arrivalDate',
    'datumVyplaty',
    'date',
    'datum',
    'datum převodu',
    'datum prevodu',
    'datum transferu',
    'payout date',
    'transfer date'
  ],
  amountMinor: [
    'amountMinor',
    'amount_minor',
    'amount',
    'netPayout',
    'castka',
    'částka',
    'částka převodu',
    'castka prevodu',
    'transfer amount',
    'payout amount',
    'vyplaceno',
    'paid out'
  ],
  currency: ['currency', 'mena', 'měna'],
  payoutReference: [
    'payoutReference',
    'payout_reference',
    'reference',
    'referenční kód',
    'referencni kod',
    'reference code',
    'transactionId',
    'transferId',
    'transfer id',
    'payout id'
  ],
  reservationId: [
    'reservationId',
    'reservation_id',
    'confirmationCode',
    'reservationCode',
    'confirmation code',
    'potvrzující kód',
    'potvrzujici kod',
    'rezervace',
    'reservation'
  ],
  listingId: [
    'listingId',
    'listing_id',
    'propertyId',
    'listing',
    'listing name',
    'property name',
    'název nabídky',
    'nabídka',
    'nabidka'
  ]
} satisfies Record<string, string[]>

const REAL_AIRBNB_REQUIRED_HEADERS = [
  'date',
  'type',
  'guestName',
  'details',
  'currency',
  'amountMinor',
  'paidOutAmountMinor',
  'serviceFeeMinor',
  'grossEarningsMinor'
]

const REAL_AIRBNB_HEADER_ALIASES = {
  date: ['Datum'],
  availableUntilDate: ['Bude připsán do dne'],
  type: ['Typ'],
  stayStartDate: ['Datum zahájení'],
  stayEndDate: ['Datum ukončení'],
  guestName: ['Host'],
  listingName: ['Nabídka'],
  details: ['Podrobnosti'],
  referenceCode: ['Referenční kód', 'Referencni kod', 'Reference code', 'Reference Code'],
  confirmationCode: ['Potvrzující kód'],
  currency: ['Měna'],
  amountMinor: ['Částka'],
  paidOutAmountMinor: ['Vyplaceno'],
  serviceFeeMinor: ['Servisní poplatek'],
  grossEarningsMinor: ['Hrubé výdělky']
} satisfies Record<string, string[]>

export class AirbnbPayoutParser {
  parse(input: ParseAirbnbPayoutExportInput): ExtractedRecord[] {
    if (isRealAirbnbMixedExport(input.content)) {
      return parseRealAirbnbMixedExport(input)
    }

    const rows = parseDelimitedRows(input.content, { canonicalHeaders: HEADER_ALIASES })

    if (rows.length === 0) {
      return []
    }

    const missing = findMissingHeaders(rows, REQUIRED_HEADERS)
    if (missing.length > 0) {
      throw new Error(`Airbnb payout export is missing required columns: ${missing.join(', ')}`)
    }

    return rows.map((row, index) => {
      const payoutDate = parseIsoDate(row.payoutDate, 'Airbnb payoutDate')
      const amountMinor = parseAmountMinor(row.amountMinor, 'Airbnb amountMinor')
      const currency = row.currency.trim().toUpperCase()
      const payoutReference = row.payoutReference.trim()
      const reservationId = row.reservationId.trim()
      const listingId = row.listingId.trim()

      return {
        id: `airbnb-payout-${index + 1}`,
        sourceDocumentId: input.sourceDocument.id,
        recordType: 'payout-line',
        extractedAt: input.extractedAt,
        rawReference: payoutReference,
        amountMinor,
        currency,
        occurredAt: payoutDate,
        data: {
          platform: 'airbnb',
          bookedAt: payoutDate,
          amountMinor,
          currency,
          accountId: 'expected-payouts',
          reference: payoutReference,
          reservationId,
          propertyId: listingId,
          listingId
        }
      }
    })
  }
}

const defaultAirbnbPayoutParser = new AirbnbPayoutParser()

export function parseAirbnbPayoutExport(input: ParseAirbnbPayoutExportInput): ExtractedRecord[] {
  return defaultAirbnbPayoutParser.parse(input)
}

export function inspectAirbnbPayoutHeaderDiagnostics(content: string): AirbnbPayoutHeaderDiagnostics {
  const structuredParsed = parseDelimitedContent(content, { canonicalHeaders: HEADER_ALIASES })
  const structuredMissing = findMissingHeaders(structuredParsed.rows, REQUIRED_HEADERS)

  if (structuredParsed.rows.length > 0 && structuredMissing.length === 0) {
    return buildAirbnbHeaderDiagnostics(
      'structured-export',
      structuredParsed,
      REQUIRED_HEADERS
    )
  }

  const realParsed = parseDelimitedContent(content, { canonicalHeaders: REAL_AIRBNB_HEADER_ALIASES })
  const realMissing = findMissingHeaders(realParsed.rows, REAL_AIRBNB_REQUIRED_HEADERS)

  if (realParsed.rows.length > 0 && realMissing.length === 0) {
    return {
      parserVariant: 'real-mixed-export',
      rawHeaderRow: realParsed.rawHeaderRow,
      normalizedHeaders: realParsed.headers,
      normalizedHeaderMap: realParsed.headerColumns.map((column) => `${column.rawHeader} -> ${column.normalizedHeader}`),
      requiredCanonicalHeaders: ['payoutDate', 'amountMinor', 'currency', 'payoutReference', 'reservationId', 'listingId'],
      mappedCanonicalHeaders: {
        payoutDate: findMappedRawHeader(realParsed.headerColumns, 'availableUntilDate') ?? findMappedRawHeader(realParsed.headerColumns, 'date'),
        amountMinor: findMappedRawHeader(realParsed.headerColumns, 'paidOutAmountMinor') ?? findMappedRawHeader(realParsed.headerColumns, 'amountMinor'),
        currency: findMappedRawHeader(realParsed.headerColumns, 'currency'),
        payoutReference: findMappedRawHeader(realParsed.headerColumns, 'referenceCode'),
        reservationId: findMappedRawHeader(realParsed.headerColumns, 'confirmationCode'),
        listingId: findMappedRawHeader(realParsed.headerColumns, 'listingName')
      },
      candidateSourceHeaders: realParsed.headerColumns.map((column) => column.rawHeader),
      missingCanonicalHeaders: []
    }
  }

  return buildAirbnbHeaderDiagnostics(
    'structured-export',
    structuredParsed,
    REQUIRED_HEADERS,
    structuredMissing
  )
}

function isRealAirbnbMixedExport(content: string): boolean {
  const parsed = parseDelimitedContent(content, { canonicalHeaders: REAL_AIRBNB_HEADER_ALIASES })

  return REAL_AIRBNB_REQUIRED_HEADERS.every((header) => parsed.headers.includes(header))
}

function buildAirbnbHeaderDiagnostics(
  parserVariant: AirbnbPayoutHeaderDiagnostics['parserVariant'],
  parsed: ReturnType<typeof parseDelimitedContent>,
  requiredCanonicalHeaders: string[],
  missingCanonicalHeaders = findMissingHeaders(parsed.rows, requiredCanonicalHeaders)
): AirbnbPayoutHeaderDiagnostics {
  return {
    parserVariant,
    rawHeaderRow: parsed.rawHeaderRow,
    normalizedHeaders: parsed.headers,
    normalizedHeaderMap: parsed.headerColumns.map((column) => `${column.rawHeader} -> ${column.normalizedHeader}`),
    requiredCanonicalHeaders,
    mappedCanonicalHeaders: {
      payoutDate: findMappedRawHeader(parsed.headerColumns, 'payoutDate'),
      amountMinor: findMappedRawHeader(parsed.headerColumns, 'amountMinor'),
      currency: findMappedRawHeader(parsed.headerColumns, 'currency'),
      payoutReference: findMappedRawHeader(parsed.headerColumns, 'payoutReference'),
      reservationId: findMappedRawHeader(parsed.headerColumns, 'reservationId'),
      listingId: findMappedRawHeader(parsed.headerColumns, 'listingId')
    },
    candidateSourceHeaders: parsed.headerColumns.map((column) => column.rawHeader),
    missingCanonicalHeaders
  }
}

function findMappedRawHeader(
  headerColumns: ReturnType<typeof parseDelimitedContent>['headerColumns'],
  canonicalHeader: string
): string | undefined {
  return headerColumns.find((column) => column.normalizedHeader === canonicalHeader)?.rawHeader
}

function parseRealAirbnbMixedExport(input: ParseAirbnbPayoutExportInput): ExtractedRecord[] {
  const parsed = parseDelimitedContent(input.content, { canonicalHeaders: REAL_AIRBNB_HEADER_ALIASES })
  const rows = parsed.rows

  if (rows.length === 0) {
    return []
  }

  const missing = findMissingHeaders(rows, REAL_AIRBNB_REQUIRED_HEADERS)
  if (missing.length > 0) {
    throw new Error(
      `Airbnb real export is missing required columns: ${missing.join(', ')}. Raw detected header row: ${parsed.rawHeaderRow}. Detected normalized headers: ${parsed.headers.join(', ')}`
    )
  }

  return rows.flatMap((row, index) => {
    const rowKind = inferRealAirbnbRowKind(row.type, row.details)
    const paidOutAmountMinor = parseOptionalAmountMinor(row.paidOutAmountMinor, 'Airbnb real export paid out amount')

    if (rowKind === 'transfer' && paidOutAmountMinor === undefined) {
      return []
    }

    const bookedAt = parseRealAirbnbDate(row.date, 'Airbnb real export date')
    const availableUntilDate = parseOptionalRealAirbnbDate(row.availableUntilDate, 'Airbnb real export availableUntilDate')

    if (rowKind === 'transfer' && availableUntilDate === undefined) {
      throw new DeterministicParserError('Airbnb real export transfer row is missing required availableUntilDate')
    }

    const payoutDate = rowKind === 'transfer' ? availableUntilDate! : bookedAt
    const amountMinor = parseRealAirbnbRowAmount(row, rowKind)
    const serviceFeeMinor = parseOptionalSignedMoney(row.serviceFeeMinor, 'Airbnb real export service fee')
    const grossEarningsMinor = parseOptionalSignedMoney(row.grossEarningsMinor, 'Airbnb real export gross earnings')
    const currency = row.currency.trim().toUpperCase()
    const stayStartDate = parseOptionalRealAirbnbDate(row.stayStartDate, 'Airbnb real export stayStartDate')
    const stayEndDate = parseOptionalRealAirbnbDate(row.stayEndDate, 'Airbnb real export stayEndDate')
    const guestName = row.guestName.trim()
    const details = row.details.trim()
    const listingName = typeof row.listingName === 'string' ? row.listingName.trim() : ''
    const referenceCode = typeof row.referenceCode === 'string' ? row.referenceCode.trim() : ''
    const confirmationCode = typeof row.confirmationCode === 'string' ? row.confirmationCode.trim() : ''
    const parsedTransfer = rowKind === 'transfer' ? parseRealAirbnbTransferDetails(details) : undefined
    const reservationId = rowKind === 'reservation' && stayStartDate && stayEndDate
      ? buildRealAirbnbReservationId(confirmationCode || guestName, stayStartDate, stayEndDate, amountMinor)
      : undefined
    const exactPayoutReference = rowKind === 'transfer'
      ? buildRealAirbnbExactPayoutReference(referenceCode, parsedTransfer!.transferReference)
      : undefined
    const payoutBatchIdentity = rowKind === 'transfer'
      ? buildRealAirbnbPayoutBatchIdentity({
        referenceCode,
        fallbackTransferReference: parsedTransfer!.transferReference,
        sourceDate: bookedAt,
        payoutDate,
        paidOutAmountMinor: paidOutAmountMinor!
      })
      : undefined
    const reference = rowKind === 'transfer'
      ? exactPayoutReference!
      : buildRealAirbnbReservationReference(confirmationCode || guestName, stayStartDate, stayEndDate)

    return {
      id: `airbnb-payout-${index + 1}`,
      sourceDocumentId: input.sourceDocument.id,
      recordType: 'payout-line',
      extractedAt: input.extractedAt,
      rawReference: reference,
      amountMinor: rowKind === 'transfer' ? paidOutAmountMinor : amountMinor,
      currency,
      occurredAt: payoutDate,
      data: {
        platform: 'airbnb',
        rowKind,
        bookedAt: payoutDate,
        amountMinor: rowKind === 'transfer' ? paidOutAmountMinor : amountMinor,
        currency,
        accountId: 'expected-payouts',
        reference,
        reservationId,
        stayStartAt: stayStartDate,
        stayEndAt: stayEndDate,
        guestName,
        details,
        paidOutAmountMinor,
        serviceFeeMinor,
        grossEarningsMinor,
        sourceDate: bookedAt,
        availableUntilDate,
        ...(listingName ? { listingName } : {}),
        ...(referenceCode ? { referenceCode } : {}),
        ...(confirmationCode ? { confirmationCode } : {}),
        ...(parsedTransfer
          ? {
            transferDescriptor: parsedTransfer.transferDescriptor,
            payoutReference: exactPayoutReference,
            payoutBatchKey: exactPayoutReference,
            ...(payoutBatchIdentity !== exactPayoutReference ? { payoutBatchIdentity } : {}),
            transferBatchDescriptor: parsedTransfer.transferReference
          }
          : {})
      }
    } satisfies ExtractedRecord
  })
}

function inferRealAirbnbRowKind(type: string | undefined, details: string): 'reservation' | 'transfer' {
  const normalizedType = (type ?? '').trim().toLowerCase()

  if (normalizedType === 'rezervace' || normalizedType === 'reservation') {
    return 'reservation'
  }

  if (normalizedType === 'payout' || normalizedType === 'převod' || normalizedType === 'prevod' || normalizedType === 'transfer') {
    return 'transfer'
  }

  const normalized = details.trim().toLowerCase()
  return normalized.startsWith('převod ') || normalized.startsWith('prevod ') ? 'transfer' : 'reservation'
}

function parseRealAirbnbRowAmount(row: Record<string, string>, rowKind: 'reservation' | 'transfer'): number {
  if (rowKind === 'transfer') {
    return parseAmountMinor(row.paidOutAmountMinor, 'Airbnb real export paid out amount')
  }

  return parseAmountMinor(row.amountMinor, 'Airbnb real export amount')
}

function parseOptionalAmountMinor(value: string | undefined, fieldName: string): number | undefined {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) {
    return undefined
  }

  return parseAmountMinor(trimmed, fieldName)
}

function parseRealAirbnbTransferDetails(details: string): {
  transferDescriptor: string
  transferReference: string
} {
  const trimmed = details.trim()
  const match = /^Převod\s+(.+?),\s*IBAN\s+([\w\-\/]+.*)$/iu.exec(trimmed)
    ?? /^Prevod\s+(.+?),\s*IBAN\s+([\w\-\/]+.*)$/iu.exec(trimmed)

  if (!match) {
    throw new DeterministicParserError(`Airbnb transfer row has unsupported details format: ${details}`)
  }

  const [, merchant, ibanTail] = match
  const transferDescriptor = `Převod ${merchant.trim()}`
  const transferReference = `AIRBNB-TRANSFER:${merchant.trim()}:IBAN-${ibanTail.trim().replace(/\s+/g, '-')}`

  return {
    transferDescriptor,
    transferReference
  }
}

function buildRealAirbnbExactPayoutReference(referenceCode: string, fallbackTransferReference: string): string {
  const trimmedReferenceCode = referenceCode.trim()
  if (/^G-[A-Z0-9]+$/i.test(trimmedReferenceCode)) {
    return trimmedReferenceCode.toUpperCase()
  }

  return fallbackTransferReference
}

function buildRealAirbnbPayoutBatchIdentity(input: {
  referenceCode: string
  fallbackTransferReference: string
  sourceDate: string
  payoutDate: string
  paidOutAmountMinor: number
}): string {
  const exactPayoutReference = buildRealAirbnbExactPayoutReference(input.referenceCode, input.fallbackTransferReference)

  if (exactPayoutReference !== input.fallbackTransferReference) {
    return exactPayoutReference
  }

  return `${input.fallbackTransferReference}:SOURCE-${input.sourceDate}:PAYOUT-${input.payoutDate}:AMOUNT-${input.paidOutAmountMinor}`
}

function buildRealAirbnbReservationId(
  guestName: string,
  stayStartDate: string,
  stayEndDate: string,
  amountMinor: number
): string {
  return `AIRBNB-RES:${slugifyComparable(guestName)}:${stayStartDate}:${stayEndDate}:${amountMinor}`
}

function buildRealAirbnbReservationReference(
  guestName: string,
  stayStartDate: string | undefined,
  stayEndDate: string | undefined
): string {
  if (!stayStartDate || !stayEndDate) {
    return `AIRBNB-STAY:${slugifyComparable(guestName)}`
  }

  return `AIRBNB-STAY:${slugifyComparable(guestName)}:${stayStartDate}:${stayEndDate}`
}

function slugifyComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseSignedMoney(value: string, fieldName: string): number {
  const trimmed = value.trim()
  if (trimmed.startsWith('-')) {
    return -parseAmountMinor(trimmed.slice(1), fieldName)
  }

  if (trimmed.startsWith('+')) {
    return parseAmountMinor(trimmed.slice(1), fieldName)
  }

  return parseAmountMinor(trimmed, fieldName)
}

function parseOptionalSignedMoney(value: string | undefined, fieldName: string): number | undefined {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) {
    return undefined
  }

  return parseSignedMoney(trimmed, fieldName)
}

function parseRealAirbnbDate(value: string, fieldName: string): string {
  try {
    return parseIsoDate(value, fieldName)
  } catch (error) {
    const normalized = value.trim()
    const usStyleMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized)

    if (usStyleMatch) {
      const [, month, day, year] = usStyleMatch
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    if (error instanceof DeterministicParserError) {
      throw error
    }

    throw new DeterministicParserError(`${fieldName} has unsupported date format: ${value}`)
  }
}

function parseOptionalRealAirbnbDate(value: string | undefined, fieldName: string): string | undefined {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) {
    return undefined
  }

  return parseRealAirbnbDate(trimmed, fieldName)
}
