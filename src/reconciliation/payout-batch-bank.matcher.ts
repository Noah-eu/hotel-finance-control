import type { NormalizedTransaction, PayoutBatchExpectation } from '../domain'
import type {
    PayoutBatchBankMatch,
    PayoutBatchCandidateDiagnostic,
    PayoutBatchNoMatchDiagnostic
} from './contracts'

const PAYOUT_BATCH_BANK_RULE_KEY = 'deterministic:payout-batch-bank:1to1:v1'
const MAX_DAY_DISTANCE = 2

const DATASET_PLATFORM_COUNTERPARTY_CLUES: Record<string, string[]> = {
    airbnb: ['citibank'],
    booking: ['booking'],
    comgate: ['comgate']
}

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
        const candidates = availableBankTransactions
            .map((transaction) => buildCandidateDiagnostic(batch, transaction))
            .filter((candidate) => candidate.eligible)
            .sort(compareBatchCandidates)

        const winner = selectUniqueTopCandidate(batch, candidates)

        if (!winner) {
            return []
        }

        const candidate = winner
        const reasons = ['amountExact', 'currencyExact', 'directionInbound', 'routingAllowed']
        const evidence: PayoutBatchBankMatch['evidence'] = [
            { key: 'payoutBatchKey', value: batch.payoutBatchKey },
            { key: 'bankTransactionId', value: candidate.bankTransactionId },
            { key: 'amountMinor', value: batch.expectedTotalMinor },
            { key: 'currency', value: batch.currency },
            { key: 'dateDistanceDays', value: candidate.dateDistanceDays }
        ]

        if (candidate.clueLabels.length > 0) {
            reasons.push('counterpartyClueAligned')
            evidence.push({ key: 'counterpartyClues', value: candidate.clueLabels.join(', ') })
        }

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
            bankTransactionId: candidate.bankTransactionId,
            bankAccountId: candidate.bankAccountId,
            amountMinor: batch.expectedTotalMinor,
            currency: batch.currency,
            confidence: reasons.includes('payoutReferenceAligned') ? 0.99 : reasons.includes('counterpartyClueAligned') ? 0.97 : 0.95,
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
        const winner = selectUniqueTopCandidate(batch, eligibleCandidates)

        if (winner) {
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
            noMatchReason: determineNoMatchReason(batch, diagnostics, eligibleCandidates),
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
    const clueMatch = evaluateDatasetCounterpartyClues(batch, transaction)

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
        counterparty: transaction.counterparty,
        reference: transaction.reference,
        eligible: rejectionReasons.length === 0,
        clueScore: clueMatch.score,
        clueLabels: clueMatch.labels,
        rejectionReasons,
        dateDistanceDays
    }
}

function determineNoMatchReason(
    batch: PayoutBatchExpectation,
    diagnostics: PayoutBatchCandidateDiagnostic[],
    eligibleCandidates: PayoutBatchCandidateDiagnostic[]
): PayoutBatchNoMatchDiagnostic['noMatchReason'] {
    if (eligibleCandidates.length > 1 && !selectUniqueTopCandidate(batch, eligibleCandidates)) {
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

    const hasCounterpartyClue = exactAmountCandidates.some((candidate) => candidate.clueScore > 0)
    if (!hasCounterpartyClue && hasDatasetCounterpartyClues(batch.platform)) {
        return 'counterpartyClueMismatch'
    }

    const hasDatePass = exactAmountCandidates.some((candidate) => !candidate.rejectionReasons.includes('dateToleranceMiss'))
    if (!hasDatePass) {
        return 'dateToleranceMiss'
    }

    return 'noCandidateAtAll'
}

function compareBatchCandidates(left: PayoutBatchCandidateDiagnostic, right: PayoutBatchCandidateDiagnostic): number {
    if (right.clueScore !== left.clueScore) {
        return right.clueScore - left.clueScore
    }

    return left.dateDistanceDays - right.dateDistanceDays
}

function evaluateDatasetCounterpartyClues(
    batch: PayoutBatchExpectation,
    transaction: NormalizedTransaction
): { score: number, labels: string[] } {
    const expectedClues = DATASET_PLATFORM_COUNTERPARTY_CLUES[batch.platform] ?? []

    if (expectedClues.length === 0) {
        return { score: 0, labels: [] }
    }

    const haystack = `${transaction.counterparty ?? ''} ${transaction.reference ?? ''}`.toLowerCase()
    const labels = expectedClues
        .filter((clue) => haystack.includes(clue))
        .map((clue) => counterpartyClueLabel(clue))

    return {
        score: labels.length,
        labels
    }
}

function counterpartyClueLabel(clue: string): string {
    if (clue === 'citibank') return 'CITIBANK'
    if (clue === 'booking') return 'Booking'
    if (clue === 'comgate') return 'Comgate'
    return clue
}

function hasDatasetCounterpartyClues(platform: string | undefined): boolean {
    return Boolean(platform && (DATASET_PLATFORM_COUNTERPARTY_CLUES[platform] ?? []).length > 0)
}

function selectUniqueTopCandidate(
    batch: PayoutBatchExpectation,
    candidates: PayoutBatchCandidateDiagnostic[]
): PayoutBatchCandidateDiagnostic | undefined {
    if (candidates.length === 0) {
        return undefined
    }

    const [first, second] = candidates
    if (!first) {
        return undefined
    }

    if (!second) {
        if (first.clueScore > 0) {
            return first
        }

        const expectedReference = normalizeComparable(batch.payoutReference)
        const candidateReference = normalizeComparable(first.reference)
        if (expectedReference && candidateReference.includes(expectedReference)) {
            return first
        }

        if (!hasDatasetCounterpartyClues(batch.platform)) {
            return first
        }

        return undefined
    }

    if (first.clueScore > second.clueScore && first.clueScore > 0) {
        return first
    }

    return undefined
}

function calculateDayDistance(left: string, right: string): number {
    const leftDate = new Date(`${left}T00:00:00Z`)
    const rightDate = new Date(`${right}T00:00:00Z`)
    return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
}

function normalizeComparable(value?: string): string {
    return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}