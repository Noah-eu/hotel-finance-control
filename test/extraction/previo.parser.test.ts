import { describe, expect, it } from 'vitest'
import { parsePrevioReservationExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parsePrevioReservationExport', () => {
  it('extracts deterministic payout-line records from the operational Previo reservation fixture', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-19T10:40:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'previo-reservation-1',
      recordType: 'payout-line',
      rawReference: 'PREVIO-20260314',
      data: {
        platform: 'previo',
        reservationId: 'PREVIO-8841',
        propertyId: 'HOTEL-CZ-001',
        guestName: 'Jan Novak',
        channel: 'direct-web',
        stayStartAt: '2026-03-14',
        stayEndAt: '2026-03-16',
        netAmountMinor: 39000
      }
    })
  })

  it('matches the expected extracted output for the Previo fixture row', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      extractedAt: '2026-03-18T20:00:00.000Z'
    })

    expect(records[0]).toEqual(fixture.expectedExtractedRecords[0])
  })

  it('throws a clear error when required Previo reservation columns are missing', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    expect(() =>
      parsePrevioReservationExport({
        sourceDocument: fixture.sourceDocument,
        content: 'stayDate,amountMinor,currency\n2026-03-14,42000,CZK',
        extractedAt: '2026-03-19T10:40:00.000Z'
      })
    ).toThrow('Previo reservation export is missing required columns')
  })

  it('accepts operational aliases like checkIn/checkOut and guest/channel fields', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: [
        'reservationNumber,bookingReference,platform,guest,arrival,departure,grossAmount,netAmount,měna,hotelId',
        'PREVIO-9901,PREVIO-REF-9901,booking.com,Petr Svoboda,2026-03-21,2026-03-24,51000,47000,CZK,HOTEL-CZ-002'
      ].join('\n'),
      extractedAt: '2026-03-19T10:40:00.000Z'
    })

    expect(records[0]).toMatchObject({
      rawReference: 'PREVIO-REF-9901',
      occurredAt: '2026-03-21',
      data: {
        reservationId: 'PREVIO-9901',
        reference: 'PREVIO-REF-9901',
        channel: 'booking.com',
        guestName: 'Petr Svoboda',
        stayStartAt: '2026-03-21',
        stayEndAt: '2026-03-24',
        amountMinor: 51000,
        netAmountMinor: 47000,
        propertyId: 'HOTEL-CZ-002'
      }
    })
  })
})