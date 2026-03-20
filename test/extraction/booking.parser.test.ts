import { describe, expect, it } from 'vitest'
import { parseBookingPayoutExport } from '../../src/extraction'
import { inspectBookingPayoutHeaderDiagnostics, inspectBookingPayoutHeaders } from '../../src/extraction/parsers/booking.parser'
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

  it('accepts the real browser-upload Booking export shape from diagnostics', () => {
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

  it('accepts English short-month payout dates from the real Booking browser-upload shape', () => {
    const fixture = getRealInputFixture('booking-payout-export-browser-upload-shape')

    const records = parseBookingPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T12:12:00.000Z'
    })

    expect(records[0]).toMatchObject({
      occurredAt: '2026-03-12',
      data: {
        bookedAt: '2026-03-12',
        bookingPayoutBatchKey: 'booking-batch:2026-03-12:PAYOUT-BOOK-20260310'
      }
    })
  })

  it('keeps multiple Booking reservation rows on the same deterministic payout batch key', () => {
    const fixture = getRealInputFixture('booking-payout-export-browser-upload-batch-shape')

    const records = parseBookingPayoutExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-20T14:10:00.000Z'
    })

    expect(records).toHaveLength(2)
    expect(records.map((record) => record.data.bookingPayoutBatchKey)).toEqual([
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310',
      'booking-batch:2026-03-12:PAYOUT-BOOK-20260310'
    ])
    expect(records.map((record) => record.data.reservationId)).toEqual(['RES-BOOK-8841', 'RES-BOOK-8842'])
  })

  it('still fails fast for unsupported Booking exports missing reservation linkage', () => {
    expect(() =>
      parseBookingPayoutExport({
        sourceDocument: getRealInputFixture('booking-payout-export-browser-upload-shape').sourceDocument,
        content: [
          'Type;Currency;Payment status;Amount;Payout date;Payout ID',
          'Reservation;CZK;Paid;1250,00;10.03.2026;PAYOUT-BOOK-20260310'
        ].join('\n'),
        extractedAt: '2026-03-20T12:10:00.000Z'
      })
    ).toThrow('Booking payout export is missing required columns')
  })

  it('exposes normalized detected headers for the real browser-upload Booking shape diagnostics', () => {
    const fixture = getRealInputFixture('booking-payout-export-browser-upload-shape')

    expect(inspectBookingPayoutHeaders(fixture.rawInput.content)).toEqual([
      'Type',
      'reservationId',
      'Check-in',
      'Checkout',
      'Guest name',
      'Reservation status',
      'currency',
      'Payment status',
      'amountMinor',
      'payoutDate',
      'payoutReference'
    ])
  })

  it('exposes the raw detected header row for the real browser-upload Booking shape diagnostics', () => {
    const fixture = getRealInputFixture('booking-payout-export-browser-upload-shape')

    expect(inspectBookingPayoutHeaderDiagnostics(fixture.rawInput.content)).toEqual({
      rawHeaderRow: 'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
      headers: [
        'Type',
        'reservationId',
        'Check-in',
        'Checkout',
        'Guest name',
        'Reservation status',
        'currency',
        'Payment status',
        'amountMinor',
        'payoutDate',
        'payoutReference'
      ]
    })
  })

  it('includes normalized detected headers in fail-fast errors for unsupported Booking files', () => {
    expect(() =>
      parseBookingPayoutExport({
        sourceDocument: getRealInputFixture('booking-payout-export-browser-upload-shape').sourceDocument,
        content: [
          'Datum vyplaty;Castka;Mena;Poznamka',
          '10.03.2026;1250,00;CZK;PAYOUT-BOOK-20260310'
        ].join('\n'),
        extractedAt: '2026-03-20T12:20:00.000Z'
      })
    ).toThrow('Raw detected header row: Datum vyplaty;Castka;Mena;Poznamka. Detected normalized headers: payoutDate, amountMinor, currency, Poznamka')
  })

  it('still fails fast for unsupported Booking payout date formats', () => {
    expect(() =>
      parseBookingPayoutExport({
        sourceDocument: getRealInputFixture('booking-payout-export-browser-upload-shape').sourceDocument,
        content: [
          'Type;Reference number;Check-in;Checkout;Guest name;Reservation status;Currency;Payment status;Amount;Payout date;Payout ID',
          'Reservation;RES-BOOK-8841;2026-03-08;2026-03-10;Jan Novak;OK;CZK;Paid;1250,00;12 March 2026;PAYOUT-BOOK-20260310'
        ].join('\n'),
        extractedAt: '2026-03-20T12:25:00.000Z'
      })
    ).toThrow('Booking payoutDate has unsupported date format: 12 March 2026')
  })
})