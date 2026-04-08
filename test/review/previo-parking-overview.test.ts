import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { MonthlyBatchResult } from '../../src/monthly-batch'
import type { DocumentId } from '../../src/domain/value-types'
import { parsePrevioReservationExport } from '../../src/extraction'
import { buildReconciliationWorkflowPlan } from '../../src/reconciliation'
import { buildReservationPaymentOverview } from '../../src/review'

interface PrevioWorkbookRow {
  createdAt: string
  voucher: string
  channel: string
  amountText: string
  outstandingText: string
  roomName: string
  stayStartAt?: string
  stayEndAt?: string
  guestName?: string
  companyName?: string
}

function buildPrevioWorkbookBase64(rows: PrevioWorkbookRow[]): string {
  const workbook = XLSX.utils.book_new()
  const reservationSheet = XLSX.utils.aoa_to_sheet([
    ['Seznam rezervací'],
    [
      'Vytvořeno',
      'Termín od',
      'Termín do',
      'Nocí',
      'Voucher',
      'Počet hostů',
      'Hosté',
      'Check-In dokončen',
      'Market kody',
      'Firma',
      'PP',
      'Stav',
      'Cena',
      'Saldo',
      'Pokoj'
    ],
    ...rows.map((row) => [
      row.createdAt,
      row.stayStartAt ?? '',
      row.stayEndAt ?? '',
      row.stayStartAt && row.stayEndAt ? '1' : '',
      row.voucher,
      row.guestName ? '1' : '',
      row.guestName ?? '',
      row.guestName ? 'Ano' : '',
      '',
      row.companyName ?? '',
      row.channel,
      'confirmed',
      row.amountText,
      row.outstandingText,
      row.roomName
    ])
  ])

  XLSX.utils.book_append_sheet(workbook, reservationSheet, 'Seznam rezervací')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Přehled rezervací'],
    ['Počet rezervací', String(rows.length)]
  ]), 'Přehled rezervací')

  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' })
}

function buildBatchFromPrevioRows(rows: PrevioWorkbookRow[]): MonthlyBatchResult {
  const extractedRecords = parsePrevioReservationExport({
    sourceDocument: {
      id: 'doc-previo-parking-overview' as DocumentId,
      sourceSystem: 'previo',
      documentType: 'reservation_export',
      fileName: 'previo-parking-overview.xlsx',
      uploadedAt: '2026-04-07T10:00:00.000Z'
    },
    content: 'previo-parking-overview',
    binaryContentBase64: buildPrevioWorkbookBase64(rows),
    extractedAt: '2026-04-07T10:00:00.000Z'
  })

  const workflowPlan = buildReconciliationWorkflowPlan({
    extractedRecords,
    normalizedTransactions: [],
    requestedAt: '2026-04-07T10:00:05.000Z'
  })

  return {
    extractedRecords,
    reconciliation: {
      normalizedTransactions: [],
      workflowPlan,
      reservationSettlementMatches: [],
      reservationSettlementNoMatches: [],
      payoutBatchMatches: [],
      payoutBatchNoMatchDiagnostics: []
    },
    report: {
      summary: {
        matchedCount: 0,
        unmatchedCount: 0,
        suspiciousCount: 0,
        missingDocumentCount: 0,
        unsupportedCount: 0
      },
      transactions: [],
      supportedExpenseLinks: []
    }
  } as unknown as MonthlyBatchResult
}

describe('Previo parking overview', () => {
  it('puts explicit Previo parking add-ons into Parkování while leaving ordinary add-ons in Reservation+', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '13.03.2026 09:15',
        stayStartAt: '14.03.2026',
        stayEndAt: '16.03.2026',
        voucher: 'PREVIO-STAY-1',
        guestName: 'Jan Novak',
        companyName: 'Acme Travel',
        channel: 'direct-web',
        amountText: '420,00',
        outstandingText: '30,00',
        roomName: 'A101'
      },
      {
        createdAt: '13.03.2026 09:20',
        voucher: 'PREVIO-STAY-1',
        channel: 'comgate',
        amountText: '200,00',
        outstandingText: '0,00',
        roomName: 'Parkování 1'
      },
      {
        createdAt: '13.03.2026 09:21',
        voucher: 'PREVIO-STAY-2',
        channel: 'direct-web',
        amountText: '180,00',
        outstandingText: '0,00',
        roomName: 'Parkování 2'
      },
      {
        createdAt: '13.03.2026 09:22',
        voucher: 'PREVIO-STAY-3',
        channel: 'comgate',
        amountText: '250,00',
        outstandingText: '0,00',
        roomName: 'Parking Deck A'
      },
      {
        createdAt: '13.03.2026 09:23',
        voucher: 'PREVIO-STAY-4',
        channel: 'direct-web',
        amountText: '220,00',
        outstandingText: '0,00',
        roomName: 'Parkovaci misto P3'
      },
      {
        createdAt: '13.03.2026 09:24',
        voucher: 'PREVIO-STAY-5',
        channel: 'direct-web',
        amountText: '150,00',
        outstandingText: '0,00',
        roomName: 'Pozdní check-out'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const parkingBlock = overview.blocks.find((block) => block.key === 'parking')
    const reservationPlusBlock = overview.blocks.find((block) => block.key === 'reservation_plus')
    const parkingItem = parkingBlock?.items.find((item) => item.title === 'Parkování 1')

    expect(parkingBlock?.itemCount).toBe(4)
    expect(parkingBlock?.items.map((item) => item.title)).toEqual(expect.arrayContaining([
      'Parkování 1',
      'Parkování 2',
      'Parking Deck A',
      'Parkovaci misto P3'
    ]))
    expect(parkingItem?.detailEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelCs: 'Host', value: 'Jan Novak' }),
      expect.objectContaining({ labelCs: 'Pobyt', value: '2026-03-14 – 2026-03-16' }),
      expect.objectContaining({ labelCs: 'Jednotka', value: 'A101' })
    ]))
    expect(reservationPlusBlock?.itemCount).toBe(2)
    expect(reservationPlusBlock?.items.map((item) => item.title)).toEqual(expect.arrayContaining([
      'Jan Novak',
      'Pozdní check-out'
    ]))
  })

  it('keeps fallback parking detail when no unique linked main reservation exists', () => {
    const batch = buildBatchFromPrevioRows([
      {
        createdAt: '13.03.2026 09:15',
        stayStartAt: '14.03.2026',
        stayEndAt: '16.03.2026',
        voucher: 'PREVIO-STAY-OTHER',
        guestName: 'Jana Svobodova',
        companyName: 'Acme Travel',
        channel: 'direct-web',
        amountText: '420,00',
        outstandingText: '30,00',
        roomName: 'B202'
      },
      {
        createdAt: '13.03.2026 09:20',
        voucher: 'PREVIO-PARK-ONLY',
        channel: 'comgate',
        amountText: '200,00',
        outstandingText: '0,00',
        roomName: 'Parkování bez pobytu'
      }
    ])

    const overview = buildReservationPaymentOverview(batch)
    const parkingItem = overview.blocks.find((block) => block.key === 'parking')?.items[0]

    expect(parkingItem).toEqual(expect.objectContaining({
      title: 'Parkování bez pobytu',
      primaryReference: 'PREVIO-PARK-ONLY'
    }))
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Host')
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Pobyt')
    expect(parkingItem?.detailEntries.map((entry) => entry.labelCs)).not.toContain('Jednotka')
  })
})