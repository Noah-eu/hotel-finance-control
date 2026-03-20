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

  it('accepts semicolon exports with aliased headers and quoted values', () => {
    const fixture = getRealInputFixture('booking-payout-export')

    const records = parseBookingPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'datumVyplaty;netAmount;měna;paymentReference;bookingId;hotelId',
        '10.03.2026;"1250,00";czk;"PAYOUT-BOOK-20260310";RES-BOOK-8841;HOTEL-CZ-001'
      ].join('\n'),
      extractedAt: '2026-03-18T21:45:00.000Z'
    })

    expect(records[0]).toMatchObject({
      id: 'booking-payout-1',
      amountMinor: 125000,
      occurredAt: '2026-03-10',
      currency: 'CZK',
      data: {
        reservationId: 'RES-BOOK-8841',
        propertyId: 'HOTEL-CZ-001'
      }
    })
  })

  it('accepts the current anonymized browser-upload Booking export shape', () => {
    const fixture = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const records = parseBookingPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T12:10:00.000Z'
    })

    expect(records[0]).toMatchObject({
      id: fixture.expectedExtractedRecords[0]?.id,
      sourceDocumentId: fixture.expectedExtractedRecords[0]?.sourceDocumentId,
      recordType: fixture.expectedExtractedRecords[0]?.recordType,
      rawReference: fixture.expectedExtractedRecords[0]?.rawReference,
      amountMinor: fixture.expectedExtractedRecords[0]?.amountMinor,
      currency: fixture.expectedExtractedRecords[0]?.currency,
      occurredAt: fixture.expectedExtractedRecords[0]?.occurredAt,
      data: fixture.expectedExtractedRecords[0]?.data
    })
  })

  it('still fails fast for unsupported Booking exports missing reservation/property linkage', () => {
    expect(() =>
      parseBookingPayoutExport({
        sourceDocument: getRealInputFixture('booking-payout-export-browser-upload-shape').sourceDocument,
        content: [
          'datumVyplaty;netAmount;měna;bookingReference',
          '10.03.2026;1250,00;CZK;PAYOUT-BOOK-20260310'
        ].join('\n'),
        extractedAt: '2026-03-20T12:10:00.000Z'
      })
    ).toThrow('Booking payout export is missing required columns')
  })
})