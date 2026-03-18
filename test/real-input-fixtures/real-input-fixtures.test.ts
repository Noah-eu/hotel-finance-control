import { describe, expect, it } from 'vitest'
import { getRealInputFixture, realInputFixtures } from '../../src/real-input-fixtures'

describe('realInputFixtures', () => {
  it('covers the first practical hotel-finance source types with deterministic metadata', () => {
    expect(realInputFixtures.map((fixture) => fixture.key)).toEqual([
      'raiffeisenbank-statement',
      'fio-statement',
      'booking-payout-export',
      'comgate-export',
      'invoice-document'
    ])

    for (const fixture of realInputFixtures) {
      expect(fixture.rawInput.content.length).toBeGreaterThan(0)
      expect(fixture.expectedExtractedRecords.length).toBeGreaterThan(0)
      expect(fixture.sourceDocument.fileName.length).toBeGreaterThan(0)
    }
  })

  it('keeps representative extracted outputs aligned with downstream contracts', () => {
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const booking = getRealInputFixture('booking-payout-export')
    const invoice = getRealInputFixture('invoice-document')

    expect(raiffeisen.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'bank-transaction',
      data: {
        sourceSystem: 'bank',
        transactionType: 'booking-payout'
      }
    })
    expect(booking.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'payout-line',
      data: {
        platform: 'booking',
        reservationId: 'RES-BOOK-8841'
      }
    })
    expect(invoice.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'invoice-document',
      data: {
        invoiceNumber: 'INV-2026-332',
        supplier: 'Laundry Supply s.r.o.'
      }
    })
  })

  it('includes normalized expectations where current deterministic normalizers already apply', () => {
    const raiffeisen = getRealInputFixture('raiffeisenbank-statement')
    const booking = getRealInputFixture('booking-payout-export')

    expect(raiffeisen.expectedNormalizedTransactions).toBeDefined()
    expect(booking.expectedNormalizedTransactions).toBeDefined()
    expect(booking.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'booking',
      reference: 'PAYOUT-BOOK-20260310'
    })
  })
})
