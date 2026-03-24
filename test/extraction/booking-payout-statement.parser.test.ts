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
