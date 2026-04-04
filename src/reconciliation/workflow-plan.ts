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
import type { PreviousMonthCarryoverSource } from './contracts'

export interface BuildWorkflowPlanInput {
    extractedRecords: ExtractedRecord[]
    normalizedTransactions: NormalizedTransaction[]
    requestedAt: string
    previousMonthCarryoverSource?: PreviousMonthCarryoverSource
}

export function buildReconciliationWorkflowPlan(
    input: BuildWorkflowPlanInput
): ReconciliationWorkflowPlan {
    const previoReservationTruth = buildPrevioReservationTruth(input.extractedRecords)
    const reservationSources = buildReservationSources(input.extractedRecords)
    const ancillaryRevenueSources = buildAncillaryRevenueSources(input.extractedRecords)
    const payoutRows = buildPayoutRows(input.normalizedTransactions, input.extractedRecords)
    const payoutBatches = buildPayoutBatches(payoutRows).concat(
        buildCarryoverPayoutBatches(input.previousMonthCarryoverSource)
    )
    const directBankSettlements = buildDirectBankSettlements(input.normalizedTransactions)
    const reservationSettlementMatching = matchReservationSourcesToSettlements({
        reservationSources,
        payoutRows,
        directBankSettlements
    })
    const previoReservationTruthMatching = matchReservationSourcesToSettlements({
        reservationSources: previoReservationTruth,
        payoutRows,
        directBankSettlements
    })
    const expenseDocuments = buildExpenseDocuments(input.normalizedTransactions)
    const bankFeeClassifications = buildBankFeeClassifications(input.normalizedTransactions)

    return {
        previoReservationTruth,
        reservationSources,
        ancillaryRevenueSources,
        reservationSettlementMatches: dedupeReservationSettlementMatches(
            reservationSettlementMatching.matches.concat(previoReservationTruthMatching.matches)
        ),
        reservationSettlementNoMatches: reservationSettlementMatching.noMatches,
        payoutRows,
        payoutBatches,
        directBankSettlements,
        expenseDocuments,
        bankFeeClassifications
    }
}

function buildPrevioReservationTruth(extractedRecords: ExtractedRecord[]): ReservationSourceRecord[] {
    return extractedRecords
        .filter(isPrevioAccommodationReservationRecord)
        .map(toReservationSourceRecord)
}

function buildCarryoverPayoutBatches(
    source: PreviousMonthCarryoverSource | undefined
): PayoutBatchExpectation[] {
    if (!source || !Array.isArray(source.payoutBatches) || source.payoutBatches.length === 0) {
        return []
    }

    return source.payoutBatches
        .filter((batch) => batch.platform === 'comgate')
        .map((batch) => ({
            ...batch,
            rowIds: Array.isArray(batch.rowIds) ? batch.rowIds.slice() : [],
            payoutSupplementReferenceHints: batch.payoutSupplementReferenceHints?.slice(),
            payoutSupplementSourceDocumentIds: batch.payoutSupplementSourceDocumentIds?.slice(),
            payoutSupplementReservationIds: batch.payoutSupplementReservationIds?.slice(),
            fromPreviousMonth: true,
            sourceMonthKey: source.sourceMonthKey
        }))
}

function buildReservationSources(extractedRecords: ExtractedRecord[]): ReservationSourceRecord[] {
    return extractedRecords
        .filter(isPrevioAccommodationReservationRecord)
        .filter(isSettlementProjectionEligible)
        .map(toReservationSourceRecord)
}

function buildAncillaryRevenueSources(extractedRecords: ExtractedRecord[]): AncillaryRevenueSourceRecord[] {
    return extractedRecords
        .filter((record) => record.data.platform === 'previo')
        .filter((record) => record.data.rowKind === 'ancillary')
        .filter(isSettlementProjectionEligible)
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

function isSettlementProjectionEligible(record: ExtractedRecord): boolean {
    return record.data.settlementProjectionEligibility !== 'intake_only'
}

function buildPayoutRows(
    transactions: NormalizedTransaction[],
    extractedRecords: ExtractedRecord[]
): PayoutRowExpectation[] {
    const extractedRecordsById = new Map(extractedRecords.map((record) => [record.id, record]))

    return transactions
        .filter(isPayoutPlanTransaction)
        .filter((transaction) => transaction.direction === 'in')
        .filter(shouldRemainPayoutPlanTransaction)
        .map((transaction) => {
            const totalFeeMinor = resolveCurrentPortalComgateTotalFeeMinor(transaction, extractedRecordsById)
            const matchingAmountMinor = typeof totalFeeMinor === 'number'
                ? transaction.amountMinor - totalFeeMinor
                : transaction.amountMinor

            return {
                rowId: transaction.id,
                platform: transaction.source,
                sourceDocumentId: transaction.sourceDocumentIds[0]!,
                reservationId: transaction.reservationId,
                payoutReference: transaction.reference ?? transaction.id,
                payoutDate: transaction.bookedAt,
                payoutBatchKey: resolvePayoutBatchKey(transaction, extractedRecordsById),
                amountMinor: transaction.amountMinor,
                ...(typeof totalFeeMinor === 'number' ? { totalFeeMinor } : {}),
                ...(matchingAmountMinor !== transaction.amountMinor ? { matchingAmountMinor } : {}),
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
            }
        })
}

function buildPayoutBatches(rows: PayoutRowExpectation[]): PayoutBatchExpectation[] {
    const grouped = new Map<string, PayoutRowExpectation[]>()

    for (const row of rows) {
        const items = grouped.get(row.payoutBatchKey) ?? []
        items.push(row)
        grouped.set(row.payoutBatchKey, items)
    }

    return Array.from(grouped.entries()).map(([payoutBatchKey, batchRows]) => {
        const grossTotalMinor = batchRows.reduce((sum, row) => sum + row.amountMinor, 0)
        const feeTotalMinor = batchRows.reduce((sum, row) => sum + (row.totalFeeMinor ?? 0), 0)
        const netSettlementTotalMinor = batchRows.reduce(
            (sum, row) => sum + (row.matchingAmountMinor ?? row.amountMinor),
            0
        )

        return {
            payoutBatchKey,
            platform: batchRows[0]!.platform,
            payoutReference: batchRows[0]!.payoutReference,
            payoutDate: batchRows[0]!.payoutDate,
            bankRoutingTarget: batchRows[0]!.bankRoutingTarget,
            rowIds: batchRows.map((row) => row.rowId),
            expectedTotalMinor: netSettlementTotalMinor,
            ...(grossTotalMinor !== netSettlementTotalMinor ? { grossTotalMinor } : {}),
            ...(feeTotalMinor > 0 ? { feeTotalMinor } : {}),
            ...(grossTotalMinor !== netSettlementTotalMinor ? { netSettlementTotalMinor } : {}),
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
        }
    })
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

    const channel = normalizeReservationSettlementChannel(optionalString(record.data.channel))
    if (channel) {
        return [channel]
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

function resolvePayoutBatchKey(
    transaction: NormalizedTransaction,
    extractedRecordsById: Map<string, ExtractedRecord>
): string {
    if (transaction.bookingPayoutBatchKey) {
        return transaction.bookingPayoutBatchKey
    }

    if (isCurrentPortalComgateTransaction(transaction, extractedRecordsById)) {
        return buildCurrentPortalComgateBatchKey(transaction.bookedAt, transaction.currency)
    }

    return buildGenericPayoutBatchKey(
        transaction.source,
        transaction.bookedAt,
        transaction.payoutBatchIdentity ?? transaction.reference ?? transaction.id
    )
}

function isCurrentPortalComgateTransaction(
    transaction: NormalizedTransaction,
    extractedRecordsById: Map<string, ExtractedRecord>
): boolean {
    if (transaction.source !== 'comgate') {
        return false
    }

    return transaction.extractedRecordIds.some((recordId) =>
        optionalString(extractedRecordsById.get(recordId)?.data.comgateParserVariant) === 'current-portal'
    )
}

function buildCurrentPortalComgateBatchKey(payoutDate: string, currency: string): string {
    return `comgate-batch:${payoutDate}:${currency.trim().toUpperCase()}`
}

function resolveCurrentPortalComgateTotalFeeMinor(
    transaction: NormalizedTransaction,
    extractedRecordsById: Map<string, ExtractedRecord>
): number | undefined {
    if (!isCurrentPortalComgateTransaction(transaction, extractedRecordsById)) {
        return undefined
    }

    const fees = transaction.extractedRecordIds
        .map((recordId) => extractedRecordsById.get(recordId)?.data.totalFeeMinor)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    if (fees.length === 0) {
        return undefined
    }

    return fees.reduce((sum, value) => sum + value, 0)
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

function isPrevioAccommodationReservationRecord(record: ExtractedRecord): boolean {
    return record.recordType === 'payout-line'
        && record.data.platform === 'previo'
        && record.data.rowKind !== 'ancillary'
        && hasDeterministicPrevioReservationSignals(record)
}

function hasDeterministicPrevioReservationSignals(record: ExtractedRecord): boolean {
    return stringOrFallback(record.data.reservationId, record.data.reference, record.rawReference, '').length > 0
        && stringOrFallback(record.data.bookedAt, record.data.stayStartAt, record.occurredAt, '').length > 0
        && stringOrFallback(record.data.currency, record.currency, '').length > 0
    && hasFiniteNumber(record.data.amountMinor, record.amountMinor)
}

function toReservationSourceRecord(record: ExtractedRecord): ReservationSourceRecord {
    return {
        reservationId: stringOrFallback(record.data.reservationId, record.rawReference, record.id),
        sourceDocumentId: record.sourceDocumentId,
        sourceSystem: 'previo',
        bookedAt: stringOrFallback(record.data.bookedAt, record.occurredAt, record.extractedAt.slice(0, 10)),
        createdAt: optionalString(record.data.createdAt),
        reference: optionalString(record.data.reference) ?? record.rawReference,
        guestName: optionalString(record.data.guestName),
        channel: optionalString(record.data.channel),
        stayStartAt: optionalString(record.data.stayStartAt) ?? optionalString(record.data.bookedAt) ?? record.occurredAt,
        stayEndAt: optionalString(record.data.stayEndAt),
        propertyId: optionalString(record.data.propertyId),
        grossRevenueMinor: numberOrZero(record.data.amountMinor, record.amountMinor),
        netRevenueMinor: optionalNumber(record.data.netAmountMinor),
        outstandingBalanceMinor: optionalNumber(record.data.outstandingBalanceMinor),
        roomName: optionalString(record.data.roomName),
        companyName: optionalString(record.data.companyName),
        currency: stringOrFallback(record.data.currency, record.currency, 'CZK'),
        expectedSettlementChannels: inferReservationSettlementChannels(record)
    }
}

function normalizeReservationSettlementChannel(value: string | undefined): ReservationSettlementChannel | undefined {
    const normalized = (value ?? '').trim().toLowerCase()

    if (!normalized) {
        return undefined
    }

    if (normalized === 'booking' || normalized === 'booking.com') {
        return 'booking'
    }

    if (normalized === 'airbnb') {
        return 'airbnb'
    }

    if (normalized === 'expedia' || normalized === 'expedia_direct_bank') {
        return 'expedia_direct_bank'
    }

    if (
        normalized === 'comgate'
        || normalized === 'direct-web'
        || normalized === 'direct web'
        || normalized === 'web'
        || normalized === 'website'
        || normalized === 'parking'
    ) {
        return 'comgate'
    }

    return undefined
}

function dedupeReservationSettlementMatches(
    matches: ReconciliationWorkflowPlan['reservationSettlementMatches']
): ReconciliationWorkflowPlan['reservationSettlementMatches'] {
    const uniqueMatches = new Map<string, ReconciliationWorkflowPlan['reservationSettlementMatches'][number]>()

    for (const match of matches) {
        const key = [
            match.reservationId,
            match.platform,
            match.settlementKind,
            match.matchedRowId ?? '',
            match.matchedSettlementId ?? ''
        ].join(':')

        if (!uniqueMatches.has(key)) {
            uniqueMatches.set(key, match)
        }
    }

    return Array.from(uniqueMatches.values())
}

function hasFiniteNumber(...values: Array<unknown>): boolean {
    return values.some((value) => typeof value === 'number' && Number.isFinite(value))
}
