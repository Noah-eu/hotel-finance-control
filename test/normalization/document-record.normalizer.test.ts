import { describe, expect, it } from 'vitest'
import { createDefaultRegistry } from '../../src/normalization/registry'
import { getRealInputFixture } from '../../src/real-input-fixtures'

describe('DocumentRecordNormalizer', () => {
  it('normalizes invoice and receipt records through the shared registry', () => {
    const invoice = getRealInputFixture('invoice-document')
    const receipt = getRealInputFixture('receipt-document')
    const registry = createDefaultRegistry()
    const normalizer = registry.get('invoice-document')

    expect(normalizer).toBeDefined()

    const result = normalizer!.normalize(
      {
        extractedRecords: [invoice.expectedExtractedRecords[0], receipt.expectedExtractedRecords[0]]
      },
      {
        sourceSystem: 'invoice',
        extractionMethod: 'deterministic',
        runId: 'normalize-documents',
        requestedAt: '2026-03-18T22:30:00.000Z'
      }
    )

    expect(result.warnings).toEqual([])
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: invoice.expectedNormalizedTransactions?.[0]?.id,
        source: 'invoice',
        direction: 'out',
        amountMinor: 1850000,
        accountId: 'document-expenses',
        invoiceNumber: 'INV-2026-332'
      }),
      expect.objectContaining({
        id: 'txn:document:receipt-record-1:doc-receipt-2026-03-55',
        source: 'receipt',
        direction: 'out',
        amountMinor: 249000,
        accountId: 'document-expenses'
      })
    ])
    expect(result.trace).toEqual([
      {
        extractedRecordId: invoice.expectedExtractedRecords[0]?.id,
        transactionIds: [invoice.expectedNormalizedTransactions?.[0]?.id]
      },
      {
        extractedRecordId: 'receipt-record-1',
        transactionIds: ['txn:document:receipt-record-1:doc-receipt-2026-03-55']
      }
    ])
  })

  it('normalizes refund settlement invoices as incoming document transactions with preserved linking hints', () => {
    const refundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-pdf')
    const registry = createDefaultRegistry()
    const normalizer = registry.get('invoice-document')

    const result = normalizer!.normalize(
      {
        extractedRecords: [refundInvoice.expectedExtractedRecords[0]]
      },
      {
        sourceSystem: 'invoice',
        extractionMethod: 'deterministic',
        runId: 'normalize-refund-document',
        requestedAt: '2026-03-30T17:10:00.000Z'
      }
    )

    expect(result.warnings).toEqual([])
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: refundInvoice.expectedNormalizedTransactions?.[0]?.id,
        source: 'invoice',
        direction: 'in',
        settlementDirection: 'refund_incoming',
        amountMinor: 245000,
        accountId: 'document-refunds',
        invoiceNumber: 'DE-RET-2026-03-9901',
        variableSymbol: '2026039901',
        targetBankAccountHint: '5599955956/5500'
      })
    ])
  })
})