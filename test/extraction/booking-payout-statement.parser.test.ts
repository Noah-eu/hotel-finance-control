import { describe, expect, it } from 'vitest'
import { detectBookingPayoutStatementKeywordHits, detectBookingPayoutStatementSignals, parseBookingPayoutStatementPdf } from '../../src/extraction'
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
      payoutTotalRaw: '35530.12 CZK',
      ibanValue: 'CZ65 5500 0000 0000 5599 555956',
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
