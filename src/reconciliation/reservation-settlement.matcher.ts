import type {
    DirectBankSettlementExpectation,
    PayoutRowExpectation,
    ReservationSettlementMatch,
    ReservationSettlementNoMatch,
    ReservationSourceRecord
} from '../domain'

export interface MatchReservationSettlementsInput {
    reservationSources: ReservationSourceRecord[]
    payoutRows: PayoutRowExpectation[]
    directBankSettlements: DirectBankSettlementExpectation[]
}

export interface MatchReservationSettlementsResult {
    matches: ReservationSettlementMatch[]
    noMatches: ReservationSettlementNoMatch[]
}

type Candidate =
    | {
        settlementKind: 'payout_row'
        platform: 'booking' | 'airbnb' | 'comgate'
        rowId: string
        reservationId?: string
        amountMinor: number
        currency: string
        bookedAt: string
        payoutReference: string
    }
    | {
        settlementKind: 'direct_bank_settlement'
        platform: 'expedia_direct_bank'
        settlementId: string
        reservationId: string
        amountMinor: number
        currency: string
        bookedAt: string
    }

const STAY_DATE_TOLERANCE_DAYS = 7

export function matchReservationSourcesToSettlements(
    input: MatchReservationSettlementsInput
): MatchReservationSettlementsResult {
    const matches: ReservationSettlementMatch[] = []
    const noMatches: ReservationSettlementNoMatch[] = []

    for (const reservation of input.reservationSources) {
        const candidates = collectCandidates(reservation, input)
        if (candidates.length === 0) {
            noMatches.push({
                reservationId: reservation.reservationId,
                reference: reservation.reference,
                sourceDocumentId: reservation.sourceDocumentId,
                candidateCount: 0,
                noMatchReason: 'noCandidate'
            })
            continue
        }

        const uniqueCandidates = candidates.filter((candidate) => candidate.uniqueDeterministic)

        if (uniqueCandidates.length === 0) {
            noMatches.push({
                reservationId: reservation.reservationId,
                reference: reservation.reference,
                sourceDocumentId: reservation.sourceDocumentId,
                candidateCount: candidates.length,
                noMatchReason: inferNoMatchReason(candidates)
            })
            continue
        }

        if (uniqueCandidates.length > 1) {
            noMatches.push({
                reservationId: reservation.reservationId,
                reference: reservation.reference,
                sourceDocumentId: reservation.sourceDocumentId,
                candidateCount: uniqueCandidates.length,
                noMatchReason: 'ambiguousCandidates'
            })
            continue
        }

        const winner = uniqueCandidates[0]!
        matches.push(winner.match)
    }

    return { matches, noMatches }
}

function collectCandidates(
    reservation: ReservationSourceRecord,
    input: MatchReservationSettlementsInput
): Array<{
    uniqueDeterministic: boolean
    match: ReservationSettlementMatch
    rejectionReason?: ReservationSettlementNoMatch['noMatchReason']
}> {
    const payoutCandidates = input.payoutRows
        .map((row) => toPayoutCandidate(row))
        .map((candidate) => evaluateCandidate(reservation, candidate))
        .filter((candidate) => candidate !== null)

    const directBankCandidates = input.directBankSettlements
        .map((settlement) => toDirectBankCandidate(settlement))
        .map((candidate) => evaluateCandidate(reservation, candidate))
        .filter((candidate) => candidate !== null)

    return [...payoutCandidates, ...directBankCandidates]
}

function evaluateCandidate(
    reservation: ReservationSourceRecord,
    candidate: Candidate
): {
    uniqueDeterministic: boolean
    match: ReservationSettlementMatch
    rejectionReason?: ReservationSettlementNoMatch['noMatchReason']
} | null {
    const evidence: ReservationSettlementMatch['evidence'] = []
    const reasons: string[] = []

    const reference = reservation.reference ?? reservation.reservationId
    const candidateReference = candidate.settlementKind === 'payout_row'
        ? candidate.reservationId ?? candidate.payoutReference
        : candidate.reservationId

    if (candidateReference && candidateReference === reservation.reservationId) {
        evidence.push({ key: 'reservationId', value: reservation.reservationId })
        reasons.push('reservationIdExact')
    } else if (candidateReference && reference && candidateReference === reference) {
        evidence.push({ key: 'reference', value: reference })
        reasons.push('referenceExact')
    } else {
        const derivedAirbnbIdentityMatch = matchDerivedAirbnbIdentity(reservation, candidate)

        if (!derivedAirbnbIdentityMatch) {
            return null
        }

        evidence.push({ key: derivedAirbnbIdentityMatch.key, value: derivedAirbnbIdentityMatch.value })
        reasons.push(derivedAirbnbIdentityMatch.reason)
    }

    if (candidate.currency !== reservation.currency) {
        return {
            uniqueDeterministic: false,
            match: buildMatch(reservation, candidate, reasons, evidence),
            rejectionReason: 'amountMismatch'
        }
    }

    if (candidate.amountMinor !== reservation.grossRevenueMinor) {
        return {
            uniqueDeterministic: false,
            match: buildMatch(reservation, candidate, reasons, evidence),
            rejectionReason: 'amountMismatch'
        }
    }

    evidence.push({ key: 'amountMinor', value: candidate.amountMinor })
    reasons.push('amountExact')

    const inferredChannels = inferReservationSettlementChannels(reservation)
    const expectedChannels = new Set(inferredChannels)
    if (expectedChannels.size > 0 && !expectedChannels.has(candidate.platform)) {
        return {
            uniqueDeterministic: false,
            match: buildMatch(reservation, candidate, reasons, evidence),
            rejectionReason: 'channelMismatch'
        }
    }

    if (expectedChannels.size > 0) {
        evidence.push({ key: 'settlementChannel', value: candidate.platform })
        reasons.push('channelAligned')
    }

    if (reservation.stayStartAt && isWithinDayTolerance(reservation.stayStartAt, candidate.bookedAt, STAY_DATE_TOLERANCE_DAYS)) {
        evidence.push({ key: 'dateAligned', value: candidate.bookedAt })
        reasons.push('dateAligned')
    }

    return {
        uniqueDeterministic: true,
        match: buildMatch(reservation, candidate, reasons, evidence)
    }
}

function buildMatch(
    reservation: ReservationSourceRecord,
    candidate: Candidate,
    reasons: string[],
    evidence: ReservationSettlementMatch['evidence']
): ReservationSettlementMatch {
    return {
        reservationId: reservation.reservationId,
        reference: reservation.reference,
        sourceDocumentId: reservation.sourceDocumentId,
        settlementKind: candidate.settlementKind,
        matchedRowId: candidate.settlementKind === 'payout_row' ? candidate.rowId : undefined,
        matchedSettlementId: candidate.settlementKind === 'direct_bank_settlement' ? candidate.settlementId : undefined,
        platform: candidate.platform,
        amountMinor: candidate.amountMinor,
        currency: candidate.currency,
        confidence: 1,
        reasons,
        evidence
    }
}

function inferNoMatchReason(
    candidates: Array<{ rejectionReason?: ReservationSettlementNoMatch['noMatchReason'] }>
): ReservationSettlementNoMatch['noMatchReason'] {
    const reasons = new Set(candidates.map((candidate) => candidate.rejectionReason).filter(Boolean))

    if (reasons.has('channelMismatch')) return 'channelMismatch'
    if (reasons.has('amountMismatch')) return 'amountMismatch'
    return 'ambiguousCandidates'
}

function toPayoutCandidate(row: PayoutRowExpectation): Candidate {
    return {
        settlementKind: 'payout_row',
        platform: row.platform,
        rowId: row.rowId,
        reservationId: row.reservationId,
        amountMinor: row.amountMinor,
        currency: row.currency,
        bookedAt: row.payoutDate,
        payoutReference: row.payoutReference
    }
}

function toDirectBankCandidate(settlement: DirectBankSettlementExpectation): Candidate {
    return {
        settlementKind: 'direct_bank_settlement',
        platform: 'expedia_direct_bank',
        settlementId: settlement.settlementId,
        reservationId: settlement.reservationId,
        amountMinor: settlement.amountMinor,
        currency: settlement.currency,
        bookedAt: settlement.bookedAt
    }
}

function isWithinDayTolerance(left: string, right: string, toleranceDays: number): boolean {
    const leftDate = new Date(`${left.slice(0, 10)}T00:00:00Z`)
    const rightDate = new Date(`${right.slice(0, 10)}T00:00:00Z`)
    const distance = Math.abs(Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000))
    return distance <= toleranceDays
}

function inferReservationSettlementChannels(
    reservation: ReservationSourceRecord
): Array<'booking' | 'airbnb' | 'comgate' | 'expedia_direct_bank'> {
    if (reservation.expectedSettlementChannels.length > 0) {
        return reservation.expectedSettlementChannels
    }

    const channel = (reservation.channel ?? '').trim().toLowerCase()
    if (channel === 'booking') return ['booking']
    if (channel === 'airbnb') return ['airbnb']
    if (channel === 'comgate') return ['comgate']
    if (channel === 'expedia_direct_bank') return ['expedia_direct_bank']
    if (channel === 'direct-web' || channel === 'direct') return ['comgate']

    const reference = `${reservation.reference ?? ''} ${reservation.reservationId}`.toLowerCase()
    if (reference.includes('booking')) return ['booking']
    if (reference.includes('airbnb')) return ['airbnb']
    if (reference.includes('comgate') || reference.includes('web')) return ['comgate']
    if (reference.includes('expedia')) return ['expedia_direct_bank']

    return []
}

function matchDerivedAirbnbIdentity(
    reservation: ReservationSourceRecord,
    candidate: Candidate
): { key: string, value: string, reason: string } | null {
    if (candidate.settlementKind !== 'payout_row' || candidate.platform !== 'airbnb') {
        return null
    }

    if (!inferReservationSettlementChannels(reservation).includes('airbnb')) {
        return null
    }

    const derivedReservationId = buildDerivedAirbnbReservationId(reservation)
    if (candidate.reservationId && derivedReservationId && candidate.reservationId === derivedReservationId) {
        return {
            key: 'derivedAirbnbReservationId',
            value: derivedReservationId,
            reason: 'reservationIdDerivedExact'
        }
    }

    const derivedReference = buildDerivedAirbnbReservationReference(reservation)
    if (derivedReference && candidate.payoutReference === derivedReference) {
        return {
            key: 'derivedAirbnbReference',
            value: derivedReference,
            reason: 'referenceDerivedExact'
        }
    }

    return null
}

function buildDerivedAirbnbReservationId(reservation: ReservationSourceRecord): string | undefined {
    const token = extractComparableAirbnbToken(reservation)

    if (!token || !reservation.stayStartAt || !reservation.stayEndAt) {
        return undefined
    }

    return `AIRBNB-RES:${token}:${reservation.stayStartAt}:${reservation.stayEndAt}:${reservation.grossRevenueMinor}`
}

function buildDerivedAirbnbReservationReference(reservation: ReservationSourceRecord): string | undefined {
    const token = extractComparableAirbnbToken(reservation)

    if (!token || !reservation.stayStartAt || !reservation.stayEndAt) {
        return undefined
    }

    return `AIRBNB-STAY:${token}:${reservation.stayStartAt}:${reservation.stayEndAt}`
}

function extractComparableAirbnbToken(reservation: ReservationSourceRecord): string | undefined {
    const candidates = [reservation.reference, reservation.reservationId]

    for (const candidate of candidates) {
        const token = normalizeComparableAirbnbToken(candidate)

        if (token) {
            return token
        }
    }

    return undefined
}

function normalizeComparableAirbnbToken(value: string | undefined): string | undefined {
    const raw = (value ?? '').trim()

    if (!raw) {
        return undefined
    }

    const fullReservationIdMatch = /^AIRBNB-RES:([^:]+):\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}:\d+$/i.exec(raw)
    if (fullReservationIdMatch) {
        return fullReservationIdMatch[1]!.trim().toLowerCase()
    }

    const fullReferenceMatch = /^AIRBNB-STAY:([^:]+):\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/i.exec(raw)
    if (fullReferenceMatch) {
        return fullReferenceMatch[1]!.trim().toLowerCase()
    }

    if (!/^[A-Za-z0-9-]+$/.test(raw)) {
        return undefined
    }

    return raw.toLowerCase()
}
