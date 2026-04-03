import { describe, expect, it } from 'vitest'
import type { ExtractedRecord } from '../../src/domain/types'
import type { DocumentId } from '../../src/domain/value-types'
import { normalizeExtractedRecords } from '../../src/normalization/service'

function makeBankRecord(input: {
  id: string
  sourceDocumentId: string
  amountMinor: number
}): ExtractedRecord {
  return {
    id: input.id,
    sourceDocumentId: input.sourceDocumentId as DocumentId,
    recordType: 'bank-transaction',
    extractedAt: '2026-04-03T09:00:00.000Z',
    rawReference: input.id,
    amountMinor: input.amountMinor,
    currency: 'CZK',
    occurredAt: '2026-03-11',
    data: {
      sourceSystem: 'bank',
      bookedAt: '2026-03-11',
      amountMinor: input.amountMinor,
      currency: 'CZK',
      accountId: 'shared-bank-account',
      counterparty: 'Shared counterparty',
      reference: input.id,
      transactionType: 'bank-transaction'
    }
  }
}

describe('normalizeExtractedRecords', () => {
  it('keeps transaction IDs unique across different source documents that reuse the same extracted record ID', () => {
    const result = normalizeExtractedRecords({
      extractedRecords: [
        makeBankRecord({ id: 'raif-row-1', sourceDocumentId: 'uploaded:bank:1:rb-gpc', amountMinor: -65000 }),
        makeBankRecord({ id: 'raif-row-1', sourceDocumentId: 'uploaded:bank:2:fio-csv', amountMinor: 65000 })
      ],
      runId: 'normalization-service-duplicate-id-regression',
      requestedAt: '2026-04-03T09:00:00.000Z'
    })

    expect(result.transactions.map((transaction) => transaction.id)).toEqual([
      'txn:bank:raif-row-1',
      'txn:bank:raif-row-1:uploaded-bank-2-fio-csv'
    ])
    expect(result.trace).toEqual([
      { extractedRecordId: 'raif-row-1', transactionIds: ['txn:bank:raif-row-1'] },
      { extractedRecordId: 'raif-row-1', transactionIds: ['txn:bank:raif-row-1:uploaded-bank-2-fio-csv'] }
    ])
  })
})