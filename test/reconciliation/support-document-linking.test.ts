import { describe, expect, it } from 'vitest'
import { reconcileExtractedRecords } from '../../src/reconciliation'
import { getRealInputFixture } from '../../src/real-input-fixtures'
import type { ExtractedRecord } from '../../src/domain'
import type { NormalizedTransaction } from '../../src/domain/types'

describe('support-document linking', () => {
  it('suppresses missing-supporting-document exceptions when a same-amount nearby invoice supports the bank outflow', () => {
    const bankOutflow: ExtractedRecord = {
      id: 'bank-expense-1',
      sourceDocumentId: 'doc-bank-expense-1' as ExtractedRecord['sourceDocumentId'],
      recordType: 'bank-transaction',
      extractedAt: '2026-03-19T11:00:00.000Z',
      rawReference: 'INV-2026-332',
      amountMinor: -1850000,
      currency: 'CZK',
      occurredAt: '2026-03-20',
      data: {
        sourceSystem: 'bank',
        bookedAt: '2026-03-20',
        amountMinor: -1850000,
        currency: 'CZK',
        accountId: 'raiffeisen-main',
        counterparty: 'Laundry Supply s.r.o.',
        reference: 'INV-2026-332',
        transactionType: 'expense'
      }
    }
    const invoice = getRealInputFixture('invoice-document').expectedExtractedRecords[0]

    const result = reconcileExtractedRecords(
      {
        extractedRecords: [bankOutflow, invoice]
      },
      {
        runId: 'support-link-positive',
        requestedAt: '2026-03-19T11:00:00.000Z'
      }
    )

    expect(result.supportedExpenseLinks).toHaveLength(1)
    expect(result.supportedExpenseLinks[0]).toMatchObject({
      expenseTransactionId: 'txn:bank:bank-expense-1',
      supportTransactionId: getRealInputFixture('invoice-document').expectedNormalizedTransactions?.[0]?.id
    })
    expect(result.supportedExpenseLinks[0].reasons).toContain('amountExact:1850000')
    expect(result.exceptionCases.some((item) => item.ruleCode === 'missing_supporting_document')).toBe(false)
  })

  it('keeps the missing-supporting-document exception when the document evidence is too weak or unrelated', () => {
    const bankOutflow: ExtractedRecord = {
      id: 'bank-expense-2',
      sourceDocumentId: 'doc-bank-expense-2' as ExtractedRecord['sourceDocumentId'],
      recordType: 'bank-transaction',
      extractedAt: '2026-03-19T11:05:00.000Z',
      rawReference: 'OFFICE-CHAIR',
      amountMinor: -1850000,
      currency: 'CZK',
      occurredAt: '2026-03-20',
      data: {
        sourceSystem: 'bank',
        bookedAt: '2026-03-20',
        amountMinor: -1850000,
        currency: 'CZK',
        accountId: 'raiffeisen-main',
        counterparty: 'Office Depot',
        reference: 'OFFICE-CHAIR',
        transactionType: 'expense'
      }
    }
    const invoice = getRealInputFixture('invoice-document').expectedExtractedRecords[0]

    const result = reconcileExtractedRecords(
      {
        extractedRecords: [bankOutflow, invoice]
      },
      {
        runId: 'support-link-negative',
        requestedAt: '2026-03-19T11:05:00.000Z'
      }
    )

    expect(result.supportedExpenseLinks).toHaveLength(0)
    expect(result.exceptionCases.some((item) => item.ruleCode === 'missing_supporting_document')).toBe(true)
  })

  it('links an incoming supplier refund document to the matching incoming bank movement', () => {
    const bankInflow: ExtractedRecord = {
      id: 'bank-refund-1',
      sourceDocumentId: 'doc-bank-refund-1' as ExtractedRecord['sourceDocumentId'],
      recordType: 'bank-transaction',
      extractedAt: '2026-03-26T08:12:00.000Z',
      rawReference: 'Vrácení přeplatku VS 5125144501',
      amountMinor: 380400,
      currency: 'CZK',
      occurredAt: '2026-03-26',
      data: {
        sourceSystem: 'bank',
        bookedAt: '2026-03-26T08:12:00',
        amountMinor: 380400,
        currency: 'CZK',
        accountId: 'fio-main',
        counterparty: 'Dobrá Energie s.r.o.',
        reference: 'Vrácení přeplatku VS 5125144501',
        transactionType: 'refund'
      }
    }
    const refundInvoice = getRealInputFixture('invoice-document-dobra-energie-refund-sparse-pdf')

    const result = reconcileExtractedRecords(
      {
        extractedRecords: [bankInflow, refundInvoice.expectedExtractedRecords[0]!]
      },
      {
        runId: 'support-link-incoming-refund',
        requestedAt: '2026-03-26T08:12:00.000Z'
      }
    )

    expect(result.supportedExpenseLinks).toHaveLength(1)
    expect(result.supportedExpenseLinks[0]).toMatchObject({
      expenseTransactionId: 'txn:bank:bank-refund-1',
      supportTransactionId: refundInvoice.expectedNormalizedTransactions?.[0]?.id
    })
    expect(result.supportedExpenseLinks[0].reasons).toContain('referenceAligned')
    const refundTransactionId = 'txn:bank:bank-refund-1' as NormalizedTransaction['id']
    expect(
      result.exceptionCases.some((item) => item.relatedTransactionIds.includes(refundTransactionId))
    ).toBe(false)
  })
})