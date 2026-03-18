import { describe, expect, it } from 'vitest'
import { parseBookingPayoutExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parseBookingPayoutExport', () => {
  it('extracts deterministic payout-line records from the representative Booking fixture', () => {
    const fixture = getRealInputFixture('booking-payout-export')

    const records = parseBookingPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T21:45:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'booking-payout-1',
      recordType: 'payout-line',
      rawReference: 'PAYOUT-BOOK-20260310',
      data: {
        platform: 'booking',
        accountId: 'expected-payouts',
        reservationId: 'RES-BOOK-8841',
        propertyId: 'HOTEL-CZ-001'
      }
    })
  })

  it('matches the representative expected extracted output for the fixture row', () => {
    const fixture = getRealInputFixture('booking-payout-export')

    const records = parseBookingPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
  })

  it('throws a clear error when required payout export columns are missing', () => {
    const fixture = getRealInputFixture('booking-payout-export')

    expect(() =>
      parseBookingPayoutExport({
        sourceDocument: fixture.sourceDocument,
        content: 'payoutDate,amountMinor,currency\n2026-03-10,125000,CZK',
        extractedAt: '2026-03-18T21:45:00.000Z'
      })
    ).toThrow('Booking payout export is missing required columns')
  })
})