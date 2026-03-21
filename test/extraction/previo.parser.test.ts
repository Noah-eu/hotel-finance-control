import { describe, expect, it } from 'vitest'
import { parsePrevioReservationExport } from '../../src/extraction'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('parsePrevioReservationExport', () => {
  it('extracts deterministic payout-line records from the operational Previo reservation fixture', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: fixture.rawInput.binaryContentBase64,
      extractedAt: '2026-03-19T10:40:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'previo-reservation-1',
      recordType: 'payout-line',
      rawReference: 'PREVIO-20260314',
      data: {
        platform: 'previo',
        reservationId: 'PREVIO-20260314',
        guestName: 'Jan Novak',
        channel: 'direct-web',
        createdAt: '2026-03-13T09:15:00',
        stayStartAt: '2026-03-14',
        stayEndAt: '2026-03-16',
        outstandingBalanceMinor: 3000,
        companyName: 'Acme Travel s.r.o.',
        roomName: 'A101',
        sourceSheet: 'Seznam rezervací'
      }
    })
  })

  it('matches the expected extracted output for the Previo fixture row', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: fixture.rawInput.binaryContentBase64,
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

  it('reads the real workbook shape from `Seznam rezervací` and does not misuse `Přehled rezervací` as row input', () => {
    const fixture = getRealInputFixture('previo-reservation-export')

    const records = parsePrevioReservationExport({
      sourceDocument: fixture.sourceDocument,
      content: fixture.rawInput.content,
      binaryContentBase64: fixture.rawInput.binaryContentBase64,
      extractedAt: '2026-03-21T09:30:00.000Z'
    })

    expect(records).toHaveLength(1)
    expect(records[0]?.rawReference).toBe('PREVIO-20260314')
    expect(records[0]?.data.sourceSheet).toBe('Seznam rezervací')
  })
})