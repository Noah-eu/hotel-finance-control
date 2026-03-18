import { describe, it, expect } from 'vitest'
import { PayoutLineNormalizer } from '../../src/normalization/normalizers/payout-line.normalizer'
import type { NormalizationContext, NormalizationInput } from '../../src/normalization/contracts'
import type { ExtractedRecord } from '../../src/domain/types'
import type { DocumentId } from '../../src/domain/value-types'

const context: NormalizationContext = {
  sourceSystem: 'booking',
  extractionMethod: 'deterministic',
  runId: 'run-2',
  requestedAt: '2024-01-31T10:00:00Z'
}

function makeRecord(overrides: Partial<ExtractedRecord> & { data?: Record<string, unknown> }): ExtractedRecord {
  return {
    id: 'pay-1',
    sourceDocumentId: 'doc-2' as DocumentId,
    recordType: 'payout-line',
    extractedAt: '2024-01-31T10:00:00Z',
    data: {
      amountMinor: 25000,
      currency: 'CZK',
      bookedAt: '2024-01-20',
      accountId: 'raiffeisen-main'
    },
    ...overrides
  }
}

describe('PayoutLineNormalizer', () => {
  const normalizer = new PayoutLineNormalizer()

  it('normalizes a valid payout-line into an inbound transaction', () => {
    const input: NormalizationInput = { extractedRecords: [makeRecord({})] }
    const result = normalizer.normalize(input, context)

    expect(result.warnings).toHaveLength(0)
    expect(result.transactions).toHaveLength(1)
    expect(result.trace).toHaveLength(1)

    const txn = result.transactions[0]
    expect(txn.direction).toBe('in')
    expect(txn.amountMinor).toBe(25000)
    expect(txn.currency).toBe('CZK')
    expect(txn.bookedAt).toBe('2024-01-20')
    expect(txn.accountId).toBe('raiffeisen-main')
    expect(txn.source).toBe('booking')
    expect(txn.id).toBe('txn:payout:pay-1')
    expect(txn.extractedRecordIds).toEqual(['pay-1'])
    expect(txn.sourceDocumentIds).toEqual(['doc-2'])
  })

  it('resolves source from platform field when present', () => {
    const platforms: Array<[string, string]> = [
      ['booking', 'booking'],
      ['Booking', 'booking'],
      ['airbnb', 'airbnb'],
      ['Airbnb', 'airbnb'],
      ['expedia', 'expedia'],
      ['comgate', 'comgate']
    ]

    for (const [platform, expectedSource] of platforms) {
      const input: NormalizationInput = {
        extractedRecords: [
          makeRecord({ data: { amountMinor: 1000, currency: 'CZK', bookedAt: '2024-01-20', accountId: 'acc', platform } })
        ]
      }
      const result = normalizer.normalize(input, context)
      expect(result.transactions[0].source).toBe(expectedSource)
    }
  })

  it('falls back to context.sourceSystem for unknown platforms', () => {
    const input: NormalizationInput = {
      extractedRecords: [
        makeRecord({ data: { amountMinor: 1000, currency: 'CZK', bookedAt: '2024-01-20', accountId: 'acc', platform: 'unknown-ota' } })
      ]
    }
    const result = normalizer.normalize(input, context)
    expect(result.transactions[0].source).toBe('booking')
  })

  it('falls back to context.sourceSystem when platform field is absent', () => {
    const input: NormalizationInput = { extractedRecords: [makeRecord({})] }
    const result = normalizer.normalize(input, context)
    expect(result.transactions[0].source).toBe('booking')
  })

  it('maps optional fields when present', () => {
    const input: NormalizationInput = {
      extractedRecords: [
        makeRecord({
          data: {
            amountMinor: 3000,
            currency: 'EUR',
            bookedAt: '2024-01-20',
            accountId: 'raiffeisen-main',
            platform: 'airbnb',
            reference: 'AIREF-456',
            reservationId: 'AIRBNB-RES-77'
          }
        })
      ]
    }
    const result = normalizer.normalize(input, context)
    const txn = result.transactions[0]
    expect(txn.source).toBe('airbnb')
    expect(txn.reference).toBe('AIREF-456')
    expect(txn.reservationId).toBe('AIRBNB-RES-77')
  })

  it('skips records with wrong recordType', () => {
    const input: NormalizationInput = {
      extractedRecords: [makeRecord({ recordType: 'bank-transaction' })]
    }
    const result = normalizer.normalize(input, context)
    expect(result.transactions).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.trace).toHaveLength(0)
  })

  it('emits a warning and empty trace entry when required fields are missing', () => {
    const input: NormalizationInput = {
      extractedRecords: [makeRecord({ data: { amountMinor: 500 } })]
    }
    const result = normalizer.normalize(input, context)

    expect(result.transactions).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('MISSING_REQUIRED_FIELD')
    expect(result.warnings[0].message).toContain('currency')
    expect(result.warnings[0].message).toContain('bookedAt')
    expect(result.warnings[0].message).toContain('accountId')
    expect(result.trace[0].transactionIds).toHaveLength(0)
  })

  it('handles a mix of valid and invalid records', () => {
    const input: NormalizationInput = {
      extractedRecords: [
        makeRecord({ id: 'pay-ok', data: { amountMinor: 1200, currency: 'CZK', bookedAt: '2024-01-20', accountId: 'acc' } }),
        makeRecord({ id: 'pay-bad', data: { amountMinor: 800 } })
      ]
    }
    const result = normalizer.normalize(input, context)
    expect(result.transactions).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
    expect(result.trace).toHaveLength(2)
    expect(result.trace[0].transactionIds).toHaveLength(1)
    expect(result.trace[1].transactionIds).toHaveLength(0)
  })
})
