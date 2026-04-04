import type { NormalizedTransaction, PayoutBatchExpectation } from '../domain'
import type {
    PayoutBatchBankMatch,
    PayoutBatchBankDecisionTrace,
    PayoutBatchCandidateDiagnostic,
    PayoutBatchNoMatchDiagnostic
} from './contracts'

const PAYOUT_BATCH_BANK_RULE_KEY = 'deterministic:payout-batch-bank:1to1:v1'
const DEFAULT_MAX_DAY_DISTANCE = 2
const AIRBNB_MAX_DAY_DISTANCE = 3
const COMGATE_SAME_MONTH_POST_PAYOUT_MAX_DAY_LAG = 3

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
    return buildBatchDecisions(input).flatMap((decision) => {
        const candidate = decision.winner

        if (!candidate) {
            return []
        }

        const batch = decision.batch
        const bankExpectation = resolveBankMatchingExpectation(batch)
        const reasons = ['amountExact', 'currencyExact', 'directionInbound', 'routingAllowed']
        const evidence: PayoutBatchBankMatch['evidence'] = [
            { key: 'payoutBatchKey', value: batch.payoutBatchKey },
            { key: 'bankTransactionId', value: candidate.bankTransactionId },
            ...(candidate.bookedAt ? [{ key: 'bankBookedAt', value: candidate.bookedAt }] : []),
            ...(candidate.counterparty ? [{ key: 'bankCounterparty', value: candidate.counterparty }] : []),
            ...(candidate.reference ? [{ key: 'bankReference', value: candidate.reference }] : []),
            { key: 'amountMinor', value: bankExpectation.amountMinor },
            { key: 'currency', value: bankExpectation.currency },
            { key: 'dateDistanceDays', value: candidate.dateDistanceDays }
        ]

        if (candidate.evidenceLabels.length > 0) {
            evidence.push({ key: 'evidenceLabels', value: candidate.evidenceLabels.join(', ') })
        }

        if (candidate.clueLabels.length > 0) {
            reasons.push('counterpartyClueAligned')
            evidence.push({ key: 'counterpartyClues', value: candidate.clueLabels.join(', ') })
        }

        if (candidate.evidenceLabels.includes('Payment ID')) {
            reasons.push('supplementPaymentIdAligned')
            evidence.push({ key: 'paymentId', value: batch.payoutSupplementPaymentId ?? '' })
        }

        const matchedReferenceHints = candidate.evidenceLabels
            .filter((label) => label.startsWith('Reference hint '))
            .map((label) => label.slice('Reference hint '.length))

        if (matchedReferenceHints.length > 0) {
            reasons.push('supplementReferenceHintAligned')
            evidence.push({ key: 'referenceHints', value: matchedReferenceHints.join(', ') })
        }

        if (candidate.evidenceLabels.includes('Payout reference')) {
            reasons.push('payoutReferenceAligned')
            evidence.push({ key: 'payoutReference', value: batch.payoutReference })
        }

        if (candidate.evidenceLabels.includes('Batch identity')) {
            reasons.push('batchIdentityAligned')
            evidence.push({ key: 'batchIdentity', value: batch.payoutBatchKey })
        }

        return [{
            payoutBatchKey: batch.payoutBatchKey,
            payoutBatchRowIds: batch.rowIds,
            bankTransactionId: candidate.bankTransactionId,
            bankAccountId: candidate.bankAccountId,
            amountMinor: bankExpectation.amountMinor,
            currency: bankExpectation.currency,
            confidence: reasons.includes('supplementPaymentIdAligned')
                ? 0.995
                : reasons.includes('supplementReferenceHintAligned')
                    ? 0.992
                    : reasons.includes('payoutReferenceAligned')
                        ? 0.99
                        : reasons.includes('counterpartyClueAligned')
                            ? 0.97
                            : 0.95,
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
    return buildBatchDecisions(input).flatMap((decision) => {
        if (decision.winner) {
            return []
        }

        return [{
            payoutBatchKey: decision.batch.payoutBatchKey,
            payoutReference: decision.batch.payoutReference,
            platform: decision.batch.platform,
            expectedTotalMinor: decision.bankExpectation.amountMinor,
            currency: decision.bankExpectation.currency,
            payoutDate: decision.batch.payoutDate,
            bankRoutingTarget: decision.batch.bankRoutingTarget,
            eligibleCandidates: decision.eligibleCandidates,
            allInboundBankCandidates: decision.allCandidates,
            noMatchReason: determineNoMatchReason(decision.batch, decision.allCandidates, decision.eligibleCandidates),
            matched: false
        }]
    })
}

export function inspectPayoutBatchBankDecisions(
    input: MatchPayoutBatchesToBankInput
): PayoutBatchBankDecisionTrace[] {
    return buildBatchDecisions(input).map((decision) => {
        const carryoverDebug = resolveCarryoverDecisionDebug(decision.batch, decision.allCandidates)
        const sameCurrencyCandidates = decision.allCandidates
            .filter((candidate) => candidate.currency === decision.bankExpectation.currency)
            .sort((left, right) =>
                Math.abs(left.amountMinor - decision.bankExpectation.amountMinor)
                - Math.abs(right.amountMinor - decision.bankExpectation.amountMinor)
            )
        const uniqueSameCurrencyAmountMinors = [...new Set(sameCurrencyCandidates.map((candidate) => candidate.amountMinor))]
        const amountCurrencyCandidates = decision.allCandidates.filter((candidate) =>
            !candidate.rejectionReasons.includes('noExactAmount')
            && !candidate.rejectionReasons.includes('currencyMismatch')
        )
        const sameMonthExactAmountCandidates = amountCurrencyCandidates.filter((candidate) =>
            !candidate.rejectionReasons.includes('wrongBankRouting')
            && candidate.clueLabels.includes('Comgate')
            && isSameCalendarMonth(decision.batch.payoutDate, candidate.bookedAt)
        )
        const dateWindowCandidates = amountCurrencyCandidates.filter((candidate) =>
            !candidate.rejectionReasons.includes('dateToleranceMiss')
        )
        const evidenceFilteredCandidates = dateWindowCandidates.filter((candidate) =>
            !requiresPositiveEvidence(decision.batch) || candidate.evidenceScore > 0
        )

        return {
            payoutBatchKey: decision.batch.payoutBatchKey,
            payoutReference: decision.batch.payoutReference,
            platform: decision.batch.platform,
            fromPreviousMonth: decision.batch.fromPreviousMonth,
            sourceMonthKey: decision.batch.sourceMonthKey,
            expectedTotalMinor: decision.batch.expectedTotalMinor,
            grossTotalMinor: decision.batch.grossTotalMinor,
            feeTotalMinor: decision.batch.feeTotalMinor,
            netSettlementTotalMinor: decision.batch.netSettlementTotalMinor,
            documentTotalMinor: decision.batch.payoutSupplementPayoutTotalAmountMinor,
            expectedBankAmountMinor: decision.bankExpectation.amountMinor,
            currency: decision.batch.currency,
            documentCurrency: decision.batch.payoutSupplementPayoutTotalCurrency,
            expectedBankCurrency: decision.bankExpectation.currency,
            matchingAmountSource: decision.bankExpectation.source,
            selectionMode: decision.selectionMode,
            exactAmountMatchExistsBeforeDateEvidence: amountCurrencyCandidates.length > 0,
            sameCurrencyCandidateAmountMinors: uniqueSameCurrencyAmountMinors.slice(0, 8),
            sameMonthExactAmountCandidateExists: sameMonthExactAmountCandidates.length > 0,
            rejectedOnlyByDateGate: sameMonthExactAmountCandidates.some((candidate) => !candidate.strictDateEligible),
            appliedComgateSameMonthLagRule: decision.allCandidates.some((candidate) => candidate.comgateSameMonthLagRuleApplied),
            wouldRejectOnStrictDateGate: sameMonthExactAmountCandidates.some((candidate) => !candidate.strictDateEligible),
            payoutDate: decision.batch.payoutDate,
            bankCandidateCountBeforeFiltering: decision.allCandidates.length,
            bankCandidateCountAfterAmountCurrency: amountCurrencyCandidates.length,
            bankCandidateCountAfterDateWindow: dateWindowCandidates.length,
            bankCandidateCountAfterEvidenceFiltering: evidenceFilteredCandidates.length,
            carryoverCandidateExistsInMatcher: carryoverDebug.carryoverCandidateExistsInMatcher,
            carryoverRejectedReason: carryoverDebug.carryoverRejectedReason,
            matched: Boolean(decision.winner),
            matchedBankTransactionId: decision.winner?.bankTransactionId,
            noMatchReason: decision.winner
                ? undefined
                : determineNoMatchReason(decision.batch, decision.allCandidates, decision.eligibleCandidates)
        }
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
    const evidenceMatch = evaluateBatchEvidence(batch, transaction)
    const bankExpectation = resolveBankMatchingExpectation(batch)
    const amountExact = transaction.amountMinor === bankExpectation.amountMinor
    const currencyExact = transaction.currency === bankExpectation.currency
    const routingAllowed = matchesRouting(batch, transaction)

    if (!amountExact) {
        rejectionReasons.push('noExactAmount')
    }

    if (!currencyExact) {
        rejectionReasons.push('currencyMismatch')
    }

    if (!routingAllowed) {
        rejectionReasons.push('wrongBankRouting')
    }

    const dateDistanceDays = calculateDayDistance(batch.payoutDate, transaction.bookedAt)
    const strictDateEligible = isWithinStrictDateTolerance(batch, transaction)
    const comgateSameMonthLagRuleApplied = shouldApplyComgateSameMonthLagRule({
        batch,
        transaction,
        amountExact,
        currencyExact,
        routingAllowed,
        clueLabels: clueMatch.labels,
        strictDateEligible
    })
    const comgatePreviousMonthCarryoverRuleApplied = shouldApplyComgatePreviousMonthCarryoverRule({
        batch,
        transaction,
        amountExact,
        currencyExact,
        routingAllowed,
        clueLabels: clueMatch.labels,
        strictDateEligible
    })

    if (!strictDateEligible && !comgateSameMonthLagRuleApplied && !comgatePreviousMonthCarryoverRuleApplied) {
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
        evidenceScore: evidenceMatch.score,
        evidenceLabels: evidenceMatch.labels,
        rejectionReasons,
        dateDistanceDays,
        strictDateEligible,
        comgateSameMonthLagRuleApplied,
        comgatePreviousMonthCarryoverRuleApplied
    }
}

function resolveCarryoverDecisionDebug(
    batch: PayoutBatchExpectation,
    diagnostics: PayoutBatchCandidateDiagnostic[]
): Pick<PayoutBatchBankDecisionTrace, 'carryoverCandidateExistsInMatcher' | 'carryoverRejectedReason'> {
    if (!batch.fromPreviousMonth || batch.platform !== 'comgate') {
        return {
            carryoverCandidateExistsInMatcher: false,
            carryoverRejectedReason: undefined
        }
    }

    if (diagnostics.length === 0) {
        return {
            carryoverCandidateExistsInMatcher: false,
            carryoverRejectedReason: 'noInboundBankCandidate'
        }
    }

    const exactAmountCandidates = diagnostics.filter((candidate) => !candidate.rejectionReasons.includes('noExactAmount'))
    if (exactAmountCandidates.length === 0) {
        return {
            carryoverCandidateExistsInMatcher: false,
            carryoverRejectedReason: 'noExactAmount'
        }
    }

    const exactAmountCurrencyCandidates = exactAmountCandidates.filter((candidate) => !candidate.rejectionReasons.includes('currencyMismatch'))
    if (exactAmountCurrencyCandidates.length === 0) {
        return {
            carryoverCandidateExistsInMatcher: false,
            carryoverRejectedReason: 'currencyMismatch'
        }
    }

    const exactAmountCurrencyRoutingCandidates = exactAmountCurrencyCandidates.filter((candidate) => !candidate.rejectionReasons.includes('wrongBankRouting'))
    if (exactAmountCurrencyRoutingCandidates.length === 0) {
        return {
            carryoverCandidateExistsInMatcher: false,
            carryoverRejectedReason: 'wrongBankRouting'
        }
    }

    const clueAlignedCandidates = exactAmountCurrencyRoutingCandidates.filter((candidate) => candidate.clueLabels.includes('Comgate'))
    if (clueAlignedCandidates.length === 0) {
        return {
            carryoverCandidateExistsInMatcher: true,
            carryoverRejectedReason: 'counterpartyClueMismatch'
        }
    }

    const sourceMonthKey = String(batch.sourceMonthKey ?? '')
    if (!sourceMonthKey || sourceMonthKey !== normalizeIsoCalendarDate(batch.payoutDate)?.slice(0, 7)) {
        return {
            carryoverCandidateExistsInMatcher: true,
            carryoverRejectedReason: 'sourceMonthKeyMismatch'
        }
    }

    const immediateNextMonthCandidates = clueAlignedCandidates.filter((candidate) =>
        isImmediateNextCalendarMonth(batch.payoutDate, candidate.bookedAt)
    )
    if (immediateNextMonthCandidates.length === 0) {
        return {
            carryoverCandidateExistsInMatcher: true,
            carryoverRejectedReason: 'notImmediateNextCalendarMonth'
        }
    }

    if (!immediateNextMonthCandidates.some((candidate) => candidate.comgatePreviousMonthCarryoverRuleApplied || candidate.strictDateEligible)) {
        return {
            carryoverCandidateExistsInMatcher: true,
            carryoverRejectedReason: 'noEligibleCarryoverCandidate'
        }
    }

    return {
        carryoverCandidateExistsInMatcher: true,
        carryoverRejectedReason: undefined
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

    const hasPositiveEvidence = exactAmountCandidates.some((candidate) => candidate.evidenceScore > 0)
    if (!hasPositiveEvidence && requiresPositiveEvidence(batch)) {
        return 'counterpartyClueMismatch'
    }

    const hasDatePass = exactAmountCandidates.some((candidate) => !candidate.rejectionReasons.includes('dateToleranceMiss'))
    if (!hasDatePass) {
        return 'dateToleranceMiss'
    }

    return 'noCandidateAtAll'
}

function buildBatchDecisions(
    input: MatchPayoutBatchesToBankInput
): Array<{
    batch: PayoutBatchExpectation
    bankExpectation: {
        amountMinor: number
        currency: PayoutBatchExpectation['currency']
        source: 'batch_total' | 'booking_local_total'
    }
    allCandidates: PayoutBatchCandidateDiagnostic[]
    eligibleCandidates: PayoutBatchCandidateDiagnostic[]
    selectionMode?: 'eligible_candidate' | 'unique_exact_amount_fallback'
    winner?: PayoutBatchCandidateDiagnostic
}> {
    const availableBankTransactions = input.bankTransactions.filter(
        (transaction) => transaction.direction === 'in' && transaction.source === 'bank'
    )

    return input.payoutBatches.map((batch) => {
        const allCandidates = availableBankTransactions.map((transaction) => buildCandidateDiagnostic(batch, transaction))
        const eligibleCandidates = allCandidates
            .filter((candidate) => candidate.eligible)
            .sort(compareBatchCandidates)
        const directWinner = selectUniqueTopCandidate(batch, eligibleCandidates)
        const fallbackWinner = directWinner ? undefined : selectUniqueExactAmountFallbackCandidate(batch, allCandidates)
        const winner = directWinner ?? fallbackWinner
        const selectionMode = directWinner
            ? 'eligible_candidate'
            : fallbackWinner
                ? 'unique_exact_amount_fallback'
                : undefined

        return {
            batch,
            bankExpectation: resolveBankMatchingExpectation(batch),
            allCandidates,
            eligibleCandidates,
            selectionMode,
            winner
        }
    })
}

function compareBatchCandidates(left: PayoutBatchCandidateDiagnostic, right: PayoutBatchCandidateDiagnostic): number {
    if (right.evidenceScore !== left.evidenceScore) {
        return right.evidenceScore - left.evidenceScore
    }

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
        if (first.evidenceScore > 0) {
            return first
        }

        if (!requiresPositiveEvidence(batch)) {
            return first
        }

        return undefined
    }

    if (first.evidenceScore > second.evidenceScore && first.evidenceScore > 0) {
        return first
    }

    return undefined
}

function selectUniqueExactAmountFallbackCandidate(
    batch: PayoutBatchExpectation,
    candidates: PayoutBatchCandidateDiagnostic[]
): PayoutBatchCandidateDiagnostic | undefined {
    if (batch.platform === 'airbnb') {
        if (requiresPositiveEvidence(batch)) {
            return undefined
        }

        const amountCurrencyRoutingCandidates = candidates
            .filter((candidate) =>
                !candidate.rejectionReasons.includes('noExactAmount')
                && !candidate.rejectionReasons.includes('currencyMismatch')
                && !candidate.rejectionReasons.includes('wrongBankRouting')
            )
            .sort(compareBatchCandidates)

        if (amountCurrencyRoutingCandidates.length !== 1) {
            return undefined
        }

        return amountCurrencyRoutingCandidates[0]
    }

    if (!supportsBookingUniqueExactAmountFallback(batch)) {
        return undefined
    }

    const amountCurrencyRoutingDateCandidates = candidates
        .filter((candidate) =>
            !candidate.rejectionReasons.includes('noExactAmount')
            && !candidate.rejectionReasons.includes('currencyMismatch')
            && !candidate.rejectionReasons.includes('wrongBankRouting')
            && !candidate.rejectionReasons.includes('dateToleranceMiss')
        )
        .sort(compareBatchCandidates)

    if (amountCurrencyRoutingDateCandidates.length !== 1) {
        return undefined
    }

    return amountCurrencyRoutingDateCandidates[0]
}

function calculateDayDistance(left: string, right: string): number {
    const normalizedLeft = normalizeIsoCalendarDate(left)
    const normalizedRight = normalizeIsoCalendarDate(right)

    if (!normalizedLeft || !normalizedRight) {
        return Number.NaN
    }

    const leftDate = new Date(`${normalizedLeft}T00:00:00Z`)
    const rightDate = new Date(`${normalizedRight}T00:00:00Z`)
    return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
}

function resolveMaxDayDistance(batch: PayoutBatchExpectation): number {
    if (batch.platform === 'airbnb') {
        return AIRBNB_MAX_DAY_DISTANCE
    }

    return DEFAULT_MAX_DAY_DISTANCE
}

function isWithinStrictDateTolerance(
    batch: PayoutBatchExpectation,
    transaction: NormalizedTransaction
): boolean {
    const dateDistanceDays = calculateDayDistance(batch.payoutDate, transaction.bookedAt)

    return Number.isFinite(dateDistanceDays) && dateDistanceDays <= resolveMaxDayDistance(batch)
}

function normalizeIsoCalendarDate(value?: string): string | undefined {
    if (!value) {
        return undefined
    }

    const trimmed = value.trim()

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed
    }

    const timestampMatch = /^(\d{4}-\d{2}-\d{2})[ T]/.exec(trimmed)
    return timestampMatch?.[1]
}

function calculateSignedDayDelta(left: string, right: string): number {
    const normalizedLeft = normalizeIsoCalendarDate(left)
    const normalizedRight = normalizeIsoCalendarDate(right)

    if (!normalizedLeft || !normalizedRight) {
        return Number.NaN
    }

    const leftDate = new Date(`${normalizedLeft}T00:00:00Z`)
    const rightDate = new Date(`${normalizedRight}T00:00:00Z`)
    return Math.round((rightDate.getTime() - leftDate.getTime()) / 86400000)
}

function isSameCalendarMonth(left?: string, right?: string): boolean {
    const normalizedLeft = normalizeIsoCalendarDate(left)
    const normalizedRight = normalizeIsoCalendarDate(right)

    if (!normalizedLeft || !normalizedRight) {
        return false
    }

    return normalizedLeft.slice(0, 7) === normalizedRight.slice(0, 7)
}

function shouldApplyComgateSameMonthLagRule(input: {
    batch: PayoutBatchExpectation
    transaction: NormalizedTransaction
    amountExact: boolean
    currencyExact: boolean
    routingAllowed: boolean
    clueLabels: string[]
    strictDateEligible: boolean
}): boolean {
    const { batch, transaction, amountExact, currencyExact, routingAllowed, clueLabels, strictDateEligible } = input

    if (
        strictDateEligible
        || batch.platform !== 'comgate'
        || !amountExact
        || !currencyExact
        || !routingAllowed
        || !clueLabels.includes('Comgate')
    ) {
        return false
    }

    if (!isSameCalendarMonth(batch.payoutDate, transaction.bookedAt)) {
        return false
    }

    const signedDayDelta = calculateSignedDayDelta(batch.payoutDate, transaction.bookedAt)
    return Number.isFinite(signedDayDelta)
        && signedDayDelta >= 0
        && signedDayDelta <= COMGATE_SAME_MONTH_POST_PAYOUT_MAX_DAY_LAG
}

function shouldApplyComgatePreviousMonthCarryoverRule(input: {
    batch: PayoutBatchExpectation
    transaction: NormalizedTransaction
    amountExact: boolean
    currencyExact: boolean
    routingAllowed: boolean
    clueLabels: string[]
    strictDateEligible: boolean
}): boolean {
    const { batch, transaction, amountExact, currencyExact, routingAllowed, clueLabels, strictDateEligible } = input

    if (
        strictDateEligible
        || batch.platform !== 'comgate'
        || !batch.fromPreviousMonth
        || !amountExact
        || !currencyExact
        || !routingAllowed
        || !clueLabels.includes('Comgate')
    ) {
        return false
    }

    const sourceMonthKey = String(batch.sourceMonthKey ?? '')
    if (!sourceMonthKey || sourceMonthKey !== normalizeIsoCalendarDate(batch.payoutDate)?.slice(0, 7)) {
        return false
    }

    if (!isImmediateNextCalendarMonth(batch.payoutDate, transaction.bookedAt)) {
        return false
    }

    const signedDayDelta = calculateSignedDayDelta(batch.payoutDate, transaction.bookedAt)
    return Number.isFinite(signedDayDelta) && signedDayDelta >= 0
}

function isImmediateNextCalendarMonth(left?: string, right?: string): boolean {
    const normalizedLeft = normalizeIsoCalendarDate(left)
    const normalizedRight = normalizeIsoCalendarDate(right)

    if (!normalizedLeft || !normalizedRight) {
        return false
    }

    const [leftYear, leftMonth] = normalizedLeft.slice(0, 7).split('-').map((value) => Number(value))
    const [rightYear, rightMonth] = normalizedRight.slice(0, 7).split('-').map((value) => Number(value))

    if (!Number.isInteger(leftYear) || !Number.isInteger(leftMonth) || !Number.isInteger(rightYear) || !Number.isInteger(rightMonth)) {
        return false
    }

    if (leftMonth === 12) {
        return rightYear === leftYear + 1 && rightMonth === 1
    }

    return rightYear === leftYear && rightMonth === leftMonth + 1
}

function normalizeComparable(value?: string): string {
    return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function requiresPositiveEvidence(batch: PayoutBatchExpectation): boolean {
    return Boolean(batch.payoutSupplementPaymentId?.trim())
}

function supportsBookingUniqueExactAmountFallback(batch: PayoutBatchExpectation): boolean {
    if (batch.platform !== 'booking' || batch.bankRoutingTarget !== 'rb_bank_inflow') {
        return false
    }

    if ((batch.payoutSupplementSourceDocumentIds?.length ?? 0) === 0) {
        return false
    }

    const bankExpectation = resolveBankMatchingExpectation(batch)
    return bankExpectation.currency === 'CZK'
}

function resolveBankMatchingExpectation(
    batch: PayoutBatchExpectation
): {
    amountMinor: number
    currency: PayoutBatchExpectation['currency']
    source: 'batch_total' | 'booking_local_total'
} {
    if (
        batch.platform === 'booking'
        && typeof batch.payoutSupplementLocalAmountMinor === 'number'
        && typeof batch.payoutSupplementLocalCurrency === 'string'
    ) {
        return {
            amountMinor: batch.payoutSupplementLocalAmountMinor,
            currency: batch.payoutSupplementLocalCurrency,
            source: 'booking_local_total'
        }
    }

    return {
        amountMinor: batch.expectedTotalMinor,
        currency: batch.currency,
        source: 'batch_total'
    }
}

function evaluateBatchEvidence(
    batch: PayoutBatchExpectation,
    transaction: NormalizedTransaction
): { score: number, labels: string[] } {
    const labels: string[] = []
    let score = 0
    const haystack = normalizeComparable(`${transaction.counterparty ?? ''} ${transaction.reference ?? ''}`)
    const payoutReference = normalizeComparable(batch.payoutReference)
    const payoutBatchKey = normalizeComparable(batch.payoutBatchKey)
    const supplementPaymentId = normalizeComparable(batch.payoutSupplementPaymentId)
    const supplementReferenceHints = (batch.payoutSupplementReferenceHints ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length >= 4)
    const supplementIbanSuffix = normalizeDigits(batch.payoutSupplementIbanSuffix)
    const transactionAccountDigits = normalizeDigits(transaction.accountId)

    if (supplementPaymentId && haystack.includes(supplementPaymentId)) {
        labels.push('Payment ID')
        score += 6
    }

    if (payoutReference && haystack.includes(payoutReference)) {
        labels.push('Payout reference')
        score += 4
    }

    if (payoutBatchKey && haystack.includes(payoutBatchKey)) {
        labels.push('Batch identity')
        score += 2
    }

    for (const hint of supplementReferenceHints) {
        const normalizedHint = normalizeComparable(hint)

        if (!normalizedHint || !haystack.includes(normalizedHint)) {
            continue
        }

        labels.push(`Reference hint ${hint}`)
        score += 5
    }

    const clueMatch = evaluateDatasetCounterpartyClues(batch, transaction)
    if (clueMatch.labels.length > 0) {
        labels.push(...clueMatch.labels)
        score += clueMatch.score
    }

    if (supplementIbanSuffix && transactionAccountDigits.endsWith(supplementIbanSuffix)) {
        labels.push(`IBAN ${batch.payoutSupplementIbanSuffix!.trim()}`)
    }

    return {
        score,
        labels: uniqueLabels(labels)
    }
}

function normalizeDigits(value?: string): string {
    return (value ?? '').replace(/\D+/g, '')
}

function uniqueLabels(values: string[]): string[] {
    return [...new Set(values)]
}
