import { describe, expect, it } from 'vitest'
import { parseBookingPayoutStatementPdf } from '../../src/extraction'
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
