import { describe, expect, it } from 'vitest'
import { getRealInputFixture, realInputFixtures } from '../../src/real-input-fixtures'

describe('realInputFixtures', () => {
  it('covers the first practical hotel-finance source types with deterministic metadata', () => {
    expect(realInputFixtures.map((fixture) => fixture.key)).toEqual([
      'raiffeisenbank-statement',
      'fio-statement',
      'booking-payout-export',
      'comgate-export',
      'invoice-document',
      'receipt-document'
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
  const receipt = getRealInputFixture('receipt-document')

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
      amountMinor: 1850000,
      data: {
        invoiceNumber: 'INV-2026-332',
        supplier: 'Laundry Supply s.r.o.',
        amountMinor: 1850000
      }
    })
    expect(receipt.expectedExtractedRecords[0]).toMatchObject({
      recordType: 'receipt-document',
      amountMinor: 249000,
      data: {
        receiptNumber: 'RCPT-2026-03-55',
        merchant: 'Metro Cash & Carry',
        amountMinor: 249000
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

    const invoice = getRealInputFixture('invoice-document')
    const receipt = getRealInputFixture('receipt-document')
    expect(invoice.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'invoice',
      amountMinor: 1850000,
      accountId: 'document-expenses'
    })
    expect(receipt.expectedNormalizedTransactions?.[0]).toMatchObject({
      source: 'receipt',
      amountMinor: 249000,
      accountId: 'document-expenses'
    })
  })
})
