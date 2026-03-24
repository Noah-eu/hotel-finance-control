import { describe, expect, it } from 'vitest'
import {
  detectBookingPayoutStatementKeywordHits,
  detectBookingPayoutStatementSignals,
  extractBookingPayoutStatementFields,
  inspectBookingPayoutStatementFieldCheck,
  parseBookingPayoutStatementPdf
} from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseBookingPayoutStatementPdf', () => {
  it('extracts deterministic payout-level supplement data from the representative Booking payout statement text', () => {
    const fixture = getRealInputFixture('booking-payout-statement-pdf')

    const records = parseBookingPayoutStatementPdf({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-24T11:20:00.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        ...fixture.expectedExtractedRecords[0],
        data: expect.objectContaining(fixture.expectedExtractedRecords[0]?.data ?? {}),
        extractedAt: '2026-03-24T11:20:00.000Z'
      })
    ])
  })

  it('accepts transfer-total wording from Booking payout statement variants', () => {
    const fixture = getRealInputFixture('booking-payout-statement-pdf')

    const records = parseBookingPayoutStatementPdf({
      sourceDocument: fixture.sourceDocument,
      content: [
        'Booking.com',
        'Payout summary',
        'Payment',
        'ID',
        'PAYOUT-BOOK-20260310',
        'Payment',
        'date',
        '2026-03-12',
        'Transfer',
        'total',
        '1 250,00 CZK',
        'IBAN',
        'CZ65 5500 0000 0000 5599 555956',
        'Included',
        'reservations',
        'RES-BOOK-8841 1 250,00 CZK'
      ].join('\n'),
      extractedAt: '2026-03-24T11:20:30.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        ...fixture.expectedExtractedRecords[0],
        data: expect.objectContaining(fixture.expectedExtractedRecords[0]?.data ?? {}),
        extractedAt: '2026-03-24T11:20:30.000Z'
      })
    ])
  })

  it('parses glyph-separated Booking payout statement text from browser PDF extraction', () => {
    const fixture = getRealInputFixture('booking-payout-statement-pdf')

    const records = parseBookingPayoutStatementPdf({
      sourceDocument: fixture.sourceDocument,
      content: buildGlyphSeparatedBookingPayoutStatementContent(),
      extractedAt: '2026-03-24T11:20:45.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        ...fixture.expectedExtractedRecords[0],
        data: expect.objectContaining(fixture.expectedExtractedRecords[0]?.data ?? {}),
        extractedAt: '2026-03-24T11:20:45.000Z'
      })
    ])
  })

  it('detects Czech Booking payout cues from later full-document text blocks after unrelated property header lines', () => {
    const signals = detectBookingPayoutStatementSignals(buildCzechBookingPayoutStatementLateCueContent())

    expect(signals).toEqual({
      hasBookingBranding: true,
      hasStatementWording: true,
      paymentId: '010638445054',
      payoutDateRaw: '2026-03-12',
      payoutTotalRaw: '1456.42 EUR',
      localTotalRaw: '35530.12 CZK',
      ibanValue: 'CZ65 5500 0000 0000 5599 555956',
      exchangeRate: undefined,
      reservationIds: ['RES-BOOK-8841']
    })
    expect(detectBookingPayoutStatementKeywordHits(buildCzechBookingPayoutStatementLateCueContent())).toEqual([
      'Booking.com B.V.',
      'Výkaz plateb',
      'ID platby',
      'Datum vyplacení částky',
      'Celkem (CZK)',
      'Celková částka k vyplacení',
      'IBAN',
      'Reservation reference'
    ])
  })

  it('extracts real Booking payout statement core fields, local payout total, IBAN hint, and exchange rate from normalized Czech browser text', () => {
    const fields = extractBookingPayoutStatementFields([
      buildCzechBookingPayoutStatementLateCueContent(),
      'Směnný kurz 24,3941'
    ].join('\n'))

    expect(fields).toEqual({
      hasBookingBranding: true,
      hasStatementWording: true,
      paymentId: '010638445054',
      payoutDate: '2026-03-12',
      payoutTotalRaw: '1456.42 EUR',
      payoutTotalAmountMinor: 145642,
      payoutTotalCurrency: 'EUR',
      localTotalRaw: '35530.12 CZK',
      localAmountMinor: 3553012,
      localCurrency: 'CZK',
      ibanValue: 'CZ65 5500 0000 0000 5599 555956',
      ibanSuffix: '5956',
      exchangeRate: '24.3941',
      reservationIds: ['RES-BOOK-8841']
    })
  })

  it('keeps required field validation aligned with parser extraction when labels and values arrive in separate text blocks', () => {
    const fieldCheck = inspectBookingPayoutStatementFieldCheck(buildCzechBookingPayoutStatementSeparatedBlockContent())

    expect(fieldCheck).toEqual({
      fields: expect.objectContaining({
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotalRaw: '1456.42 EUR',
        payoutTotalAmountMinor: 145642,
        payoutTotalCurrency: 'EUR',
        localTotalRaw: '35530.12 CZK',
        localAmountMinor: 3553012,
        localCurrency: 'CZK',
        ibanSuffix: '5956'
      }),
      parserExtracted: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR',
        localTotal: '35530.12 CZK',
        ibanHint: '5956',
        exchangeRate: undefined
      },
      validatorInput: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR'
      },
      missingFields: [],
      requiredFieldsCheck: 'passed'
    })
  })

  it('keeps parserExtracted and validatorInput aligned when Booking labels are far from values in the full browser text', () => {
    const fieldCheck = inspectBookingPayoutStatementFieldCheck(buildCzechBookingPayoutStatementWideGapContent())

    expect(fieldCheck).toEqual({
      fields: expect.objectContaining({
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotalRaw: '1456.42 EUR',
        payoutTotalAmountMinor: 145642,
        payoutTotalCurrency: 'EUR',
        localTotalRaw: '35530.12 CZK',
        localAmountMinor: 3553012,
        localCurrency: 'CZK',
        ibanSuffix: '5956'
      }),
      parserExtracted: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR',
        localTotal: '35530.12 CZK',
        ibanHint: '5956',
        exchangeRate: undefined
      },
      validatorInput: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR'
      },
      missingFields: [],
      requiredFieldsCheck: 'passed'
    })
  })

  it('extracts paymentId, payoutDate, and payoutTotal from fragmented browser text blocks instead of collapsing to 1 EUR', () => {
    const fieldCheck = inspectBookingPayoutStatementFieldCheck(buildCzechBookingPayoutStatementFragmentedBrowserContent())

    expect(fieldCheck).toEqual({
      fields: expect.objectContaining({
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotalRaw: '1456.42 EUR',
        payoutTotalAmountMinor: 145642,
        payoutTotalCurrency: 'EUR',
        localTotalRaw: '35530.12 CZK',
        localAmountMinor: 3553012,
        localCurrency: 'CZK',
        ibanSuffix: '5956'
      }),
      parserExtracted: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR',
        localTotal: '35530.12 CZK',
        ibanHint: '5956',
        exchangeRate: undefined
      },
      validatorInput: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR'
      },
      missingFields: [],
      requiredFieldsCheck: 'passed'
    })
  })

  it('extracts required Booking payout fields from the real browser shape where the PDF text arrives as one glyph per line', () => {
    const fieldCheck = inspectBookingPayoutStatementFieldCheck(buildCzechBookingPayoutStatementSingleGlyphBrowserContent())

    expect(fieldCheck).toEqual({
      fields: expect.objectContaining({
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotalRaw: '1456.42 EUR',
        payoutTotalAmountMinor: 145642,
        payoutTotalCurrency: 'EUR',
        localTotalRaw: '35530.12 CZK',
        localAmountMinor: 3553012,
        localCurrency: 'CZK',
        exchangeRate: '24.3955'
      }),
      parserExtracted: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR',
        localTotal: '35530.12 CZK',
        ibanHint: undefined,
        exchangeRate: '24.3955'
      },
      validatorInput: {
        paymentId: '010638445054',
        payoutDate: '2026-03-12',
        payoutTotal: '1456.42 EUR'
      },
      missingFields: [],
      requiredFieldsCheck: 'passed'
    })
  })

  it('parses Czech Booking payout statement text by using the full normalized document instead of only the header prefix', () => {
    const records = parseBookingPayoutStatementPdf({
      sourceDocument: getRealInputFixture('booking-payout-statement-pdf').sourceDocument,
      content: buildCzechBookingPayoutStatementLateCueContent(),
      extractedAt: '2026-03-24T11:20:50.000Z'
    })

    expect(records).toEqual([
      expect.objectContaining({
        id: 'booking-payout-statement-1',
        rawReference: '010638445054',
        amountMinor: 3553012,
        currency: 'CZK',
        occurredAt: '2026-03-12',
        extractedAt: '2026-03-24T11:20:50.000Z',
        data: expect.objectContaining({
          platform: 'booking',
          supplementRole: 'payout_statement',
          paymentId: '010638445054',
          payoutDate: '2026-03-12',
          amountMinor: 3553012,
          currency: 'CZK',
          payoutTotalRaw: '1456.42 EUR',
          payoutTotalAmountMinor: 145642,
          payoutTotalCurrency: 'EUR',
          localTotalRaw: '35530.12 CZK',
          localAmountMinor: 3553012,
          localCurrency: 'CZK',
          ibanSuffix: '5956',
          reservationIds: ['RES-BOOK-8841']
        })
      })
    ])
  })

  it('fails clearly when required labeled payout fields are missing', () => {
    expect(() =>
      parseBookingPayoutStatementPdf({
        sourceDocument: getRealInputFixture('booking-payout-statement-pdf').sourceDocument,
        content: [
          'Booking.com payout statement',
          'Payment date: 2026-03-10'
        ].join('\n'),
        extractedAt: '2026-03-24T11:21:00.000Z'
      })
    ).toThrow('Booking payout statement PDF is missing required labeled fields: paymentId, payoutDate, payoutTotal.')
  })
})

function buildGlyphSeparatedBookingPayoutStatementContent(): string {
  return [
    'Booking.com',
    'Payment overview',
    'Payment ID: P A Y O U T - B O O K - 2 0 2 6 0 3 1 0',
    'Payment date: 2 0 2 6 - 0 3 - 1 2',
    'Transfer total: 1 2 5 0 , 0 0 C Z K',
    'IBAN: C Z 6 5 5 5 0 0 0 0 0 0 0 0 0 0 5 5 9 9 5 5 5 9 5 6',
    'Included reservations: RES-BOOK-8841 1 250,00 CZK'
  ].join('\n')
}

function buildCzechBookingPayoutStatementLateCueContent(): string {
  return [
    'Chill apartment with city view and balcony',
    'Sokolská 55, Nové Město',
    '120 00 Prague 2',
    'Czech Republic',
    'Jokeland s.r.o.',
    'Property reference CHILL-APT-PRG',
    'Reservation contact summary',
    'Building access instructions',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky 12. března 2026',
    'ID platby 010638445054',
    'Celková částka k vyplacení € 1,456.42',
    'Celkem (CZK) 35,530.12 Kč',
    'IBAN CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ].join('\n')
}

function buildCzechBookingPayoutStatementSeparatedBlockContent(): string {
  return [
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky',
    'ID platby',
    'Celková částka k vyplacení',
    'Celkem (CZK)',
    'IBAN',
    '12. března 2026',
    '010638445054',
    '€ 1,456.42',
    '35,530.12 Kč',
    'CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ].join('\n')
}

function buildCzechBookingPayoutStatementWideGapContent(): string {
  return [
    'Chill apartment with city view and balcony',
    'Sokolská 55, Nové Město',
    '120 00 Prague 2',
    'Czech Republic',
    'Jokeland s.r.o.',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky',
    'ID platby',
    'Celková částka k vyplacení',
    'Celkem (CZK)',
    'IBAN',
    'Reservation contact summary',
    'House rules acknowledgement',
    'Guest arrival instructions',
    'Late check-in details',
    'Reservation note A',
    'Reservation note B',
    'Reservation note C',
    'Reservation note D',
    'Reservation note E',
    'Reservation note F',
    'Reservation note G',
    'Reservation note H',
    'Reservation note I',
    'Reservation note J',
    'Reservation note K',
    'Reservation note L',
    '12. března 2026',
    '010638445054',
    '€ 1,456.42',
    '35,530.12 Kč',
    'CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ].join('\n')
}

function buildCzechBookingPayoutStatementFragmentedBrowserContent(): string {
  return [
    'Chill apartment with city view and balcony',
    'Sokolská 55, Nové Město',
    '120 00 Prague 2',
    'Czech Republic',
    'Jokeland s.r.o.',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Reservation contact summary',
    'Building access instructions',
    'Datum vyplacení částky',
    'Celková částka k vyplacení',
    'ID platby',
    'Celkem (CZK)',
    'IBAN',
    '12.',
    'března',
    '2026',
    '€ 1',
    ',456.42',
    '0106',
    '3844',
    '5054',
    '35,530.12 Kč',
    'CZ65 5500 0000 0000 5599 555956',
    'Rezervace RES-BOOK-8841'
  ].join('\n')
}

function buildCzechBookingPayoutStatementSingleGlyphBrowserContent(): string {
  const denseDocument = [
    'Chill apartments',
    'Sokolská 64',
    '120 00 Prague',
    'ID ubytování 2206371',
    'Booking.com B.V.',
    'Výkaz plateb',
    'Datum vyplacení částky 12. března 2026',
    'ID platby 010638445054',
    'Typ faktury',
    'Referenční číslo',
    'Typ platby',
    'Příjezd',
    'Odjezd',
    'Jméno hosta',
    'Měna',
    'Částka',
    'Celkem (CZK) 35,530.12 Kč',
    'Celková částka k vyplacení € 1,456.42',
    'Celková částka k vyplacení (CZK)',
    'Směnný kurz 24.3955',
    'Bankovní údaje',
    'IBAN CZ65 5500 0000 0000 5599 555956'
  ].join('')

  return Array.from(denseDocument).join('\n')
}
