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
        id: 'txn:document:invoice-record-1',
        source: 'invoice',
        direction: 'out',
        amountMinor: 1850000,
        accountId: 'document-expenses',
        invoiceNumber: 'INV-2026-332'
      }),
      expect.objectContaining({
        id: 'txn:document:receipt-record-1',
        source: 'receipt',
        direction: 'out',
        amountMinor: 249000,
        accountId: 'document-expenses'
      })
    ])
    expect(result.trace).toEqual([
      {
        extractedRecordId: 'invoice-record-1',
        transactionIds: ['txn:document:invoice-record-1']
      },
      {
        extractedRecordId: 'receipt-record-1',
        transactionIds: ['txn:document:receipt-record-1']
      }
    ])
  })
})