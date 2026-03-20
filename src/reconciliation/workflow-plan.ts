import type {
    BankFeeClassification,
    DirectBankSettlementExpectation,
    ExpenseDocumentExpectation,
    ExtractedRecord,
    NormalizedTransaction,
    PayoutBatchExpectation,
    PayoutRowExpectation,
    ReconciliationWorkflowPlan,
    ReservationSettlementChannel,
    ReservationSourceRecord,
    SourceDocument
} from '../domain'

export interface BuildWorkflowPlanInput {
    extractedRecords: ExtractedRecord[]
    normalizedTransactions: NormalizedTransaction[]
    requestedAt: string
}

export function buildReconciliationWorkflowPlan(
    input: BuildWorkflowPlanInput
): ReconciliationWorkflowPlan {
    const reservationSources = buildReservationSources(input.extractedRecords)
    const payoutRows = buildPayoutRows(input.normalizedTransactions)
    const payoutBatches = buildPayoutBatches(payoutRows)
    const directBankSettlements = buildDirectBankSettlements(input.normalizedTransactions)
    const expenseDocuments = buildExpenseDocuments(input.normalizedTransactions)
    const bankFeeClassifications = buildBankFeeClassifications(input.normalizedTransactions)

    return {
        reservationSources,
        payoutRows,
        payoutBatches,
        directBankSettlements,
        expenseDocuments,
        bankFeeClassifications
    }
}

function buildReservationSources(extractedRecords: ExtractedRecord[]): ReservationSourceRecord[] {
    return extractedRecords
        .filter((record) => record.recordType === 'payout-line')
        .filter((record) => record.data.platform === 'previo')
        .map((record) => ({
            reservationId: stringOrFallback(record.data.reservationId, record.rawReference, record.id),
            sourceDocumentId: record.sourceDocumentId,
            sourceSystem: 'previo',
            bookedAt: stringOrFallback(record.data.bookedAt, record.occurredAt, record.extractedAt.slice(0, 10)),
            propertyId: optionalString(record.data.propertyId),
            grossRevenueMinor: numberOrZero(record.data.amountMinor, record.amountMinor),
            currency: stringOrFallback(record.data.currency, record.currency, 'CZK'),
            expectedSettlementChannels: inferReservationSettlementChannels(record)
        }))
}

function buildPayoutRows(transactions: NormalizedTransaction[]): PayoutRowExpectation[] {
    return transactions
        .filter(isPayoutPlanTransaction)
        .filter((transaction) => transaction.direction === 'in')
        .map((transaction) => ({
            rowId: transaction.id,
            platform: transaction.source,
            sourceDocumentId: transaction.sourceDocumentIds[0]!,
            reservationId: transaction.reservationId,
            payoutReference: transaction.reference ?? transaction.id,
            payoutDate: transaction.bookedAt,
            payoutBatchKey:
                transaction.bookingPayoutBatchKey
                ?? buildGenericPayoutBatchKey(transaction.source, transaction.bookedAt, transaction.reference ?? transaction.id),
            amountMinor: transaction.amountMinor,
            currency: transaction.currency,
            bankRoutingTarget: 'rb_bank_inflow'
        }))
}

function buildPayoutBatches(rows: PayoutRowExpectation[]): PayoutBatchExpectation[] {
    const grouped = new Map<string, PayoutRowExpectation[]>()

    for (const row of rows) {
        const items = grouped.get(row.payoutBatchKey) ?? []
        items.push(row)
        grouped.set(row.payoutBatchKey, items)
    }

    return Array.from(grouped.entries()).map(([payoutBatchKey, batchRows]) => ({
        payoutBatchKey,
        platform: batchRows[0]!.platform,
        payoutReference: batchRows[0]!.payoutReference,
        payoutDate: batchRows[0]!.payoutDate,
        bankRoutingTarget: batchRows[0]!.bankRoutingTarget,
        rowIds: batchRows.map((row) => row.rowId),
        expectedTotalMinor: batchRows.reduce((sum, row) => sum + row.amountMinor, 0),
        currency: batchRows[0]!.currency
    }))
}

function buildDirectBankSettlements(
    transactions: NormalizedTransaction[]
): DirectBankSettlementExpectation[] {
    return transactions
        .filter((transaction) => transaction.source === 'expedia')
        .filter((transaction) => transaction.direction === 'in')
        .map((transaction) => ({
            settlementId: transaction.id,
            channel: 'expedia_direct_bank',
            reservationId: transaction.reservationId ?? transaction.reference ?? transaction.id,
            bankRoutingTarget: 'fio_bank_inflow',
            accountIdHint: transaction.accountId,
            bookedAt: transaction.bookedAt,
            amountMinor: transaction.amountMinor,
            currency: transaction.currency
        }))
}

function buildExpenseDocuments(
    transactions: NormalizedTransaction[]
): ExpenseDocumentExpectation[] {
    return transactions
        .filter((transaction) => transaction.direction === 'out')
        .filter(isExpenseDocumentTransaction)
        .map((transaction) => ({
            documentId: transaction.sourceDocumentIds[0]!,
            kind: transaction.source === 'invoice' ? 'supplier_invoice' : 'merchant_receipt',
            sourceSystem: transaction.source,
            bookedAt: transaction.bookedAt,
            amountMinor: transaction.amountMinor,
            currency: transaction.currency,
            expectedBankDirection: 'out',
            routingTarget: 'document_expense_outflow',
            documentReference: transaction.reference
        }))
}

function buildBankFeeClassifications(
    transactions: NormalizedTransaction[]
): BankFeeClassification[] {
    const classifications: BankFeeClassification[] = []

    for (const transaction of transactions) {
        if (transaction.source !== 'bank' || transaction.direction !== 'out') {
            continue
        }

        const reference = (transaction.reference ?? '').toLowerCase()
        const counterparty = (transaction.counterparty ?? '').toLowerCase()

        if (transaction.accountId.includes('fio') && (reference.includes('fee') || counterparty.includes('terminal'))) {
            classifications.push({
                transactionId: transaction.id,
                category: 'fio_terminal_fee',
                bankRoutingTarget: 'fio_bank_inflow',
                bankAccountId: transaction.accountId,
                reason: 'Fio terminal fee inferred from outgoing bank transaction metadata.'
            })
            continue
        }

        if (transaction.accountId.includes('raiffeisen') && reference.includes('fee')) {
            classifications.push({
                transactionId: transaction.id,
                category: 'rb_account_fee',
                bankRoutingTarget: 'rb_bank_inflow',
                bankAccountId: transaction.accountId,
                reason: 'Raiffeisenbank account fee inferred from outgoing bank transaction reference.'
            })
        }
    }

    return classifications
}

function inferReservationSettlementChannels(record: ExtractedRecord): ReservationSettlementChannel[] {
    const routing = optionalString(record.data.settlementChannel)
    if (routing === 'booking' || routing === 'airbnb' || routing === 'comgate' || routing === 'expedia_direct_bank') {
        return [routing]
    }

    const reference = `${optionalString(record.data.reference) ?? ''} ${record.rawReference ?? ''}`.toLowerCase()
    if (reference.includes('booking')) return ['booking']
    if (reference.includes('airbnb')) return ['airbnb']
    if (reference.includes('comgate') || reference.includes('web')) return ['comgate']

    return []
}

function isPayoutPlanTransaction(
    transaction: NormalizedTransaction
): transaction is NormalizedTransaction & { source: 'booking' | 'airbnb' | 'comgate' } {
    return transaction.source === 'booking' || transaction.source === 'airbnb' || transaction.source === 'comgate'
}

function isExpenseDocumentTransaction(
    transaction: NormalizedTransaction
): transaction is NormalizedTransaction & { source: 'invoice' | 'receipt' } {
    return transaction.source === 'invoice' || transaction.source === 'receipt'
}

function buildGenericPayoutBatchKey(source: string, payoutDate: string, payoutReference: string): string {
    return `${source}-batch:${payoutDate}:${payoutReference.trim().toUpperCase()}`
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringOrFallback(...values: Array<unknown>): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim()
        }
    }

    return ''
}

function numberOrZero(...values: Array<unknown>): number {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value
        }
    }

    return 0
}