import type { NormalizedTransaction, PayoutBatchExpectation } from '../domain'
import type {
    PayoutBatchBankMatch,
    PayoutBatchCandidateDiagnostic,
    PayoutBatchNoMatchDiagnostic
} from './contracts'

const PAYOUT_BATCH_BANK_RULE_KEY = 'deterministic:payout-batch-bank:1to1:v1'
const MAX_DAY_DISTANCE = 2

export interface MatchPayoutBatchesToBankInput {
    payoutBatches: PayoutBatchExpectation[]
    bankTransactions: NormalizedTransaction[]
}

export function matchPayoutBatchesToBank(
    input: MatchPayoutBatchesToBankInput
): PayoutBatchBankMatch[] {
    const availableBankTransactions = input.bankTransactions.filter(
        (transaction) => transaction.direction === 'in' && transaction.source === 'bank'
    )

    return input.payoutBatches.flatMap((batch) => {
        const candidates = availableBankTransactions.filter((transaction) => {
            if (transaction.amountMinor !== batch.expectedTotalMinor) {
                return false
            }

            if (transaction.currency !== batch.currency) {
                return false
            }

            if (!matchesRouting(batch, transaction)) {
                return false
            }

            const dateDistance = calculateDayDistance(batch.payoutDate, transaction.bookedAt)
            if (dateDistance > MAX_DAY_DISTANCE) {
                return false
            }

            return true
        })

        if (candidates.length !== 1) {
            return []
        }

        const candidate = candidates[0]!
        const reasons = ['amountExact', 'currencyExact', 'directionInbound', 'routingAllowed']
        const evidence: PayoutBatchBankMatch['evidence'] = [
            { key: 'payoutBatchKey', value: batch.payoutBatchKey },
            { key: 'bankTransactionId', value: candidate.id },
            { key: 'amountMinor', value: batch.expectedTotalMinor },
            { key: 'currency', value: batch.currency },
            { key: 'dateDistanceDays', value: calculateDayDistance(batch.payoutDate, candidate.bookedAt) }
        ]

        const normalizedReference = normalizeComparable(candidate.reference)
        if (normalizedReference && normalizedReference.includes(normalizeComparable(batch.payoutReference))) {
            reasons.push('payoutReferenceAligned')
            evidence.push({ key: 'payoutReference', value: batch.payoutReference })
        }

        if (normalizeComparable(candidate.reference).includes(normalizeComparable(batch.payoutBatchKey))) {
            reasons.push('batchIdentityAligned')
            evidence.push({ key: 'batchIdentity', value: batch.payoutBatchKey })
        }

        return [{
            payoutBatchKey: batch.payoutBatchKey,
            payoutBatchRowIds: batch.rowIds,
            bankTransactionId: candidate.id,
            bankAccountId: candidate.accountId,
            amountMinor: batch.expectedTotalMinor,
            currency: batch.currency,
            confidence: reasons.includes('payoutReferenceAligned') ? 0.99 : 0.95,
            ruleKey: PAYOUT_BATCH_BANK_RULE_KEY,
            matched: true,
            reasons,
            evidence
        }]
    })
}

export function diagnoseUnmatchedPayoutBatchesToBank(
    input: MatchPayoutBatchesToBankInput
): PayoutBatchNoMatchDiagnostic[] {
    const availableBankTransactions = input.bankTransactions.filter(
        (transaction) => transaction.direction === 'in' && transaction.source === 'bank'
    )

    return input.payoutBatches.flatMap((batch) => {
        const diagnostics = availableBankTransactions.map((transaction) => buildCandidateDiagnostic(batch, transaction))
        const eligibleCandidates = diagnostics.filter((candidate) => candidate.eligible)

        if (eligibleCandidates.length === 1) {
            return []
        }

        return [{
            payoutBatchKey: batch.payoutBatchKey,
            payoutReference: batch.payoutReference,
            platform: batch.platform,
            expectedTotalMinor: batch.expectedTotalMinor,
            currency: batch.currency,
            payoutDate: batch.payoutDate,
            bankRoutingTarget: batch.bankRoutingTarget,
            eligibleCandidates,
            allInboundBankCandidates: diagnostics,
            noMatchReason: determineNoMatchReason(diagnostics, eligibleCandidates),
            matched: false
        }]
    })
}

function matchesRouting(
    batch: PayoutBatchExpectation,
    bankTransaction: NormalizedTransaction
): boolean {
    if (batch.bankRoutingTarget === 'rb_bank_inflow') {
        return bankTransaction.accountId.includes('raiffeisen') || bankTransaction.accountId.includes('5599955956')
    }

    return true
}

function buildCandidateDiagnostic(
    batch: PayoutBatchExpectation,
    transaction: NormalizedTransaction
): PayoutBatchCandidateDiagnostic {
    const rejectionReasons: PayoutBatchCandidateDiagnostic['rejectionReasons'] = []

    if (transaction.amountMinor !== batch.expectedTotalMinor) {
        rejectionReasons.push('noExactAmount')
    }

    if (transaction.currency !== batch.currency) {
        rejectionReasons.push('currencyMismatch')
    }

    if (!matchesRouting(batch, transaction)) {
        rejectionReasons.push('wrongBankRouting')
    }

    const dateDistanceDays = calculateDayDistance(batch.payoutDate, transaction.bookedAt)
    if (dateDistanceDays > MAX_DAY_DISTANCE) {
        rejectionReasons.push('dateToleranceMiss')
    }

    return {
        bankTransactionId: transaction.id,
        bankAccountId: transaction.accountId,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        bookedAt: transaction.bookedAt,
        reference: transaction.reference,
        eligible: rejectionReasons.length === 0,
        rejectionReasons,
        dateDistanceDays
    }
}

function determineNoMatchReason(
    diagnostics: PayoutBatchCandidateDiagnostic[],
    eligibleCandidates: PayoutBatchCandidateDiagnostic[]
): PayoutBatchNoMatchDiagnostic['noMatchReason'] {
    if (eligibleCandidates.length > 1) {
        return 'ambiguousCandidates'
    }

    if (diagnostics.length === 0) {
        return 'noCandidateAtAll'
    }

    const hasExactAmountCandidate = diagnostics.some((candidate) => !candidate.rejectionReasons.includes('noExactAmount'))
    if (!hasExactAmountCandidate) {
        return 'noExactAmount'
    }

    const exactAmountCandidates = diagnostics.filter((candidate) => !candidate.rejectionReasons.includes('noExactAmount'))
    const hasRoutingPass = exactAmountCandidates.some((candidate) => !candidate.rejectionReasons.includes('wrongBankRouting'))
    if (!hasRoutingPass) {
        return 'wrongBankRouting'
    }

    const hasDatePass = exactAmountCandidates.some((candidate) => !candidate.rejectionReasons.includes('dateToleranceMiss'))
    if (!hasDatePass) {
        return 'dateToleranceMiss'
    }

    return 'noCandidateAtAll'
}

function calculateDayDistance(left: string, right: string): number {
    const leftDate = new Date(`${left}T00:00:00Z`)
    const rightDate = new Date(`${right}T00:00:00Z`)
    return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
}

function normalizeComparable(value?: string): string {
    return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}