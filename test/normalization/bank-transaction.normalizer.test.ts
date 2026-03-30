import { describe, it, expect } from 'vitest'
import { BankTransactionNormalizer } from '../../src/normalization/normalizers/bank-transaction.normalizer'
import type { NormalizationContext, NormalizationInput } from '../../src/normalization/contracts'
import type { ExtractedRecord } from '../../src/domain/types'
import type { DocumentId } from '../../src/domain/value-types'

const context: NormalizationContext = {
  sourceSystem: 'bank',
  extractionMethod: 'deterministic',
  runId: 'run-1',
  requestedAt: '2024-01-31T10:00:00Z'
}

function makeRecord(overrides: Partial<ExtractedRecord> & { data?: Record<string, unknown> }): ExtractedRecord {
  return {
    id: 'rec-1',
    sourceDocumentId: 'doc-1' as DocumentId,
    recordType: 'bank-transaction',
    extractedAt: '2024-01-31T10:00:00Z',
    data: {
      amountMinor: 10000,
      currency: 'CZK',
      bookedAt: '2024-01-15',
      accountId: 'raiffeisen-main'
    },
    ...overrides
  }
}

describe('BankTransactionNormalizer', () => {
  const normalizer = new BankTransactionNormalizer()

  it('normalizes a valid credit record into an inbound transaction', () => {
    const input: NormalizationInput = { extractedRecords: [makeRecord({})] }
    const result = normalizer.normalize(input, context)

    expect(result.warnings).toHaveLength(0)
    expect(result.transactions).toHaveLength(1)
    expect(result.trace).toHaveLength(1)

    const txn = result.transactions[0]
    expect(txn.direction).toBe('in')
    expect(txn.amountMinor).toBe(10000)
    expect(txn.currency).toBe('CZK')
    expect(txn.bookedAt).toBe('2024-01-15')
    expect(txn.accountId).toBe('raiffeisen-main')
    expect(txn.source).toBe('bank')
    expect(txn.id).toBe('txn:bank:rec-1')
    expect(txn.extractedRecordIds).toEqual(['rec-1'])
    expect(txn.sourceDocumentIds).toEqual(['doc-1'])
  })

  it('normalizes a debit record into an outbound transaction with positive amountMinor', () => {
    const input: NormalizationInput = {
      extractedRecords: [makeRecord({ data: { amountMinor: -5000, currency: 'CZK', bookedAt: '2024-01-16', accountId: 'raiffeisen-main' } })]
    }
    const result = normalizer.normalize(input, context)

    expect(result.warnings).toHaveLength(0)
    const txn = result.transactions[0]
    expect(txn.direction).toBe('out')
    expect(txn.amountMinor).toBe(5000)
  })

  it('treats zero-amount as internal direction', () => {
    const input: NormalizationInput = {
      extractedRecords: [makeRecord({ data: { amountMinor: 0, currency: 'CZK', bookedAt: '2024-01-16', accountId: 'raiffeisen-main' } })]
    }
    const result = normalizer.normalize(input, context)
    expect(result.transactions[0].direction).toBe('internal')
  })

  it('maps optional fields when present', () => {
    const input: NormalizationInput = {
      extractedRecords: [
        makeRecord({
          data: {
            amountMinor: 1000,
            currency: 'EUR',
            bookedAt: '2024-01-15',
            accountId: 'raiffeisen-main',
            valueAt: '2024-01-17',
            counterparty: 'Booking.com',
            reference: 'REF-123',
            reservationId: 'RES-99',
            invoiceNumber: 'INV-01'
          }
        })
      ]
    }
    const result = normalizer.normalize(input, context)
    const txn = result.transactions[0]
    expect(txn.valueAt).toBe('2024-01-17')
    expect(txn.counterparty).toBe('Booking.com')
    expect(txn.reference).toBe('REF-123')
    expect(txn.reservationId).toBe('RES-99')
    expect(txn.invoiceNumber).toBe('INV-01')
  })

  it('skips records with wrong recordType', () => {
    const input: NormalizationInput = {
      extractedRecords: [makeRecord({ recordType: 'payout-line' })]
    }
    const result = normalizer.normalize(input, context)
    expect(result.transactions).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.trace).toHaveLength(0)
  })

  it('emits a warning and empty trace entry when required fields are missing', () => {
    const input: NormalizationInput = {
      extractedRecords: [makeRecord({ data: { currency: 'CZK', bookedAt: '2024-01-15' } })]
    }
    const result = normalizer.normalize(input, context)

    expect(result.transactions).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('MISSING_REQUIRED_FIELD')
    expect(result.warnings[0].message).toContain('amountMinor')
    expect(result.warnings[0].message).toContain('accountId')
    expect(result.trace[0].transactionIds).toHaveLength(0)
  })

  it('handles a mix of valid and invalid records', () => {
    const input: NormalizationInput = {
      extractedRecords: [
        makeRecord({ id: 'rec-ok', data: { amountMinor: 500, currency: 'CZK', bookedAt: '2024-01-15', accountId: 'acc-1' } }),
        makeRecord({ id: 'rec-bad', data: { currency: 'CZK' } })
      ]
    }
    const result = normalizer.normalize(input, context)
    expect(result.transactions).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
    expect(result.trace).toHaveLength(2)
    expect(result.trace[0].transactionIds).toHaveLength(1)
    expect(result.trace[1].transactionIds).toHaveLength(0)
  })

  it('keeps transaction IDs unique when two bank files reuse the same extracted record ID', () => {
    const input: NormalizationInput = {
      extractedRecords: [
        makeRecord({ id: 'fio-row-1', sourceDocumentId: 'uploaded:bank:1:rb-csv' as DocumentId }),
        makeRecord({ id: 'fio-row-1', sourceDocumentId: 'uploaded:bank:2:fio-csv' as DocumentId })
      ]
    }
    const result = normalizer.normalize(input, context)

    expect(result.transactions).toHaveLength(2)
    expect(result.transactions.map((transaction) => transaction.id)).toEqual([
      'txn:bank:fio-row-1',
      'txn:bank:fio-row-1:uploaded-bank-2-fio-csv'
    ])
    expect(result.trace).toEqual([
      { extractedRecordId: 'fio-row-1', transactionIds: ['txn:bank:fio-row-1'] },
      { extractedRecordId: 'fio-row-1', transactionIds: ['txn:bank:fio-row-1:uploaded-bank-2-fio-csv'] }
    ])
  })
})
