import type { NormalizedTransaction, PayoutBatchExpectation } from '../domain'
import type { PayoutBatchBankMatch } from './contracts'

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

function matchesRouting(
    batch: PayoutBatchExpectation,
    bankTransaction: NormalizedTransaction
): boolean {
    if (batch.bankRoutingTarget === 'rb_bank_inflow') {
        return bankTransaction.accountId.includes('raiffeisen') || bankTransaction.accountId.includes('5599955956')
    }

    return true
}

function calculateDayDistance(left: string, right: string): number {
    const leftDate = new Date(`${left}T00:00:00Z`)
    const rightDate = new Date(`${right}T00:00:00Z`)
    return Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
}

function normalizeComparable(value?: string): string {
    return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}