import type {
    AncillaryRevenueSourceRecord,
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
import { matchReservationSourcesToSettlements } from './reservation-settlement.matcher'

export interface BuildWorkflowPlanInput {
    extractedRecords: ExtractedRecord[]
    normalizedTransactions: NormalizedTransaction[]
    requestedAt: string
}

export function buildReconciliationWorkflowPlan(
    input: BuildWorkflowPlanInput
): ReconciliationWorkflowPlan {
    const reservationSources = buildReservationSources(input.extractedRecords)
    const ancillaryRevenueSources = buildAncillaryRevenueSources(input.extractedRecords)
    const payoutRows = buildPayoutRows(input.normalizedTransactions)
    const payoutBatches = buildPayoutBatches(payoutRows)
    const directBankSettlements = buildDirectBankSettlements(input.normalizedTransactions)
    const reservationSettlementMatching = matchReservationSourcesToSettlements({
        reservationSources,
        payoutRows,
        directBankSettlements
    })
    const expenseDocuments = buildExpenseDocuments(input.normalizedTransactions)
    const bankFeeClassifications = buildBankFeeClassifications(input.normalizedTransactions)

    return {
        reservationSources,
        ancillaryRevenueSources,
        reservationSettlementMatches: reservationSettlementMatching.matches,
        reservationSettlementNoMatches: reservationSettlementMatching.noMatches,
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
        .filter((record) => record.data.rowKind !== 'ancillary')
        .map((record) => ({
            reservationId: stringOrFallback(record.data.reservationId, record.rawReference, record.id),
            sourceDocumentId: record.sourceDocumentId,
            sourceSystem: 'previo',
            bookedAt: stringOrFallback(record.data.bookedAt, record.occurredAt, record.extractedAt.slice(0, 10)),
            reference: optionalString(record.data.reference) ?? record.rawReference,
            guestName: optionalString(record.data.guestName),
            channel: optionalString(record.data.channel),
            stayStartAt: optionalString(record.data.stayStartAt) ?? optionalString(record.data.bookedAt) ?? record.occurredAt,
            stayEndAt: optionalString(record.data.stayEndAt),
            propertyId: optionalString(record.data.propertyId),
            grossRevenueMinor: numberOrZero(record.data.amountMinor, record.amountMinor),
            netRevenueMinor: optionalNumber(record.data.netAmountMinor),
            currency: stringOrFallback(record.data.currency, record.currency, 'CZK'),
            expectedSettlementChannels: inferReservationSettlementChannels(record)
        }))
}

function buildAncillaryRevenueSources(extractedRecords: ExtractedRecord[]): AncillaryRevenueSourceRecord[] {
    return extractedRecords
        .filter((record) => record.data.platform === 'previo')
        .filter((record) => record.data.rowKind === 'ancillary')
        .map((record) => ({
            sourceDocumentId: record.sourceDocumentId,
            sourceSystem: 'previo',
            reference: stringOrFallback(record.data.reference, record.rawReference, record.id),
            reservationId: optionalString(record.data.reservationId),
            bookedAt: optionalString(record.data.bookedAt) ?? record.occurredAt,
            createdAt: optionalString(record.data.createdAt),
            itemLabel: optionalString(record.data.itemLabel) ?? optionalString(record.data.roomName),
            channel: optionalString(record.data.channel),
            grossRevenueMinor: numberOrZero(record.data.amountMinor, record.amountMinor),
            outstandingBalanceMinor: optionalNumber(record.data.outstandingBalanceMinor),
            currency: stringOrFallback(record.data.currency, record.currency, 'CZK')
        }))
}

function buildPayoutRows(transactions: NormalizedTransaction[]): PayoutRowExpectation[] {
    return transactions
        .filter(isPayoutPlanTransaction)
        .filter((transaction) => transaction.direction === 'in')
        .filter(shouldRemainPayoutPlanTransaction)
        .map((transaction) => ({
            rowId: transaction.id,
            platform: transaction.source,
            sourceDocumentId: transaction.sourceDocumentIds[0]!,
            reservationId: transaction.reservationId,
            payoutReference: transaction.reference ?? transaction.id,
            payoutDate: transaction.bookedAt,
            payoutBatchKey:
                transaction.bookingPayoutBatchKey
                ?? buildGenericPayoutBatchKey(
                    transaction.source,
                    transaction.bookedAt,
                    transaction.payoutBatchIdentity ?? transaction.reference ?? transaction.id
                ),
            amountMinor: transaction.amountMinor,
            currency: transaction.currency,
            bankRoutingTarget: 'rb_bank_inflow',
            payoutSupplementPaymentId: transaction.payoutSupplementPaymentId,
            payoutSupplementPayoutDate: transaction.payoutSupplementPayoutDate,
            payoutSupplementPayoutTotalAmountMinor: transaction.payoutSupplementPayoutTotalAmountMinor,
            payoutSupplementPayoutTotalCurrency: transaction.payoutSupplementPayoutTotalCurrency,
            payoutSupplementLocalAmountMinor: transaction.payoutSupplementLocalAmountMinor,
            payoutSupplementLocalCurrency: transaction.payoutSupplementLocalCurrency,
            payoutSupplementIbanSuffix: transaction.payoutSupplementIbanSuffix,
            payoutSupplementExchangeRate: transaction.payoutSupplementExchangeRate,
            payoutSupplementReferenceHints: transaction.payoutSupplementReferenceHints,
            payoutSupplementSourceDocumentIds: transaction.payoutSupplementSourceDocumentIds,
            payoutSupplementReservationIds: transaction.payoutSupplementReservationIds
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
        currency: batchRows[0]!.currency,
        payoutSupplementPaymentId: firstDefined(batchRows.map((row) => row.payoutSupplementPaymentId)),
        payoutSupplementPayoutDate: firstDefined(batchRows.map((row) => row.payoutSupplementPayoutDate)),
        payoutSupplementPayoutTotalAmountMinor: firstDefined(
            batchRows.map((row) => row.payoutSupplementPayoutTotalAmountMinor)
        ),
        payoutSupplementPayoutTotalCurrency: firstDefined(
            batchRows.map((row) => row.payoutSupplementPayoutTotalCurrency)
        ),
        payoutSupplementLocalAmountMinor: firstDefined(
            batchRows.map((row) => row.payoutSupplementLocalAmountMinor)
        ),
        payoutSupplementLocalCurrency: firstDefined(
            batchRows.map((row) => row.payoutSupplementLocalCurrency)
        ),
        payoutSupplementIbanSuffix: firstDefined(batchRows.map((row) => row.payoutSupplementIbanSuffix)),
        payoutSupplementExchangeRate: firstDefined(batchRows.map((row) => row.payoutSupplementExchangeRate)),
        payoutSupplementReferenceHints: uniqueValues(
            batchRows.flatMap((row) => row.payoutSupplementReferenceHints ?? [])
        ),
        payoutSupplementSourceDocumentIds: uniqueValues(
            batchRows.flatMap((row) => row.payoutSupplementSourceDocumentIds ?? [])
        ),
        payoutSupplementReservationIds: uniqueValues(
            batchRows.flatMap((row) => row.payoutSupplementReservationIds ?? [])
        )
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
        .filter(isExpenseDocumentTransaction)
        .map((transaction) => ({
            documentId: transaction.sourceDocumentIds[0]!,
            kind:
                transaction.source === 'receipt'
                    ? 'merchant_receipt'
                    : transaction.direction === 'in'
                        ? 'supplier_refund'
                        : 'supplier_invoice',
            sourceSystem: transaction.source,
            settlementDirection:
                transaction.source === 'receipt'
                    ? 'payable_outgoing'
                    : transaction.settlementDirection ?? (transaction.direction === 'in' ? 'refund_incoming' : 'payable_outgoing'),
            bookedAt: transaction.bookedAt,
            amountMinor: transaction.amountMinor,
            currency: transaction.currency,
            expectedBankDirection: transaction.direction === 'in' ? 'in' : 'out',
            routingTarget: transaction.direction === 'in' ? 'document_refund_inflow' : 'document_expense_outflow',
            documentReference: transaction.reference,
            targetBankAccountHint: transaction.targetBankAccountHint
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

        if (
            transaction.accountId.includes('fio')
            && (
                reference.includes('fee')
                || counterparty.includes('terminal')
                || reference.includes('zúčtování pos terminálu')
                || reference.includes('zuctovani pos terminalu')
                || counterparty.includes('zúčtování pos terminálu')
                || counterparty.includes('zuctovani pos terminalu')
                || reference.includes('settlement fee')
                || reference.includes('payment fee')
            )
        ) {
            classifications.push({
                transactionId: transaction.id,
                category: 'fio_terminal_fee',
                bankRoutingTarget: 'fio_bank_inflow',
                bankAccountId: transaction.accountId,
                reason: 'Fio POS terminal fee inferred from observed settlement wording on the current dataset.'
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

function shouldRemainPayoutPlanTransaction(transaction: NormalizedTransaction): boolean {
    if (transaction.source !== 'airbnb') {
        return true
    }

    return transaction.subtype !== 'reservation'
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

function optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
    return values.find((value) => value !== undefined)
}

function uniqueValues<T>(values: T[]): T[] | undefined {
    const unique = Array.from(new Set(values))
    return unique.length > 0 ? unique : undefined
}
