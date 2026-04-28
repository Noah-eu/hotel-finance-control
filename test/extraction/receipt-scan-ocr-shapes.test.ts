import { describe, expect, it } from 'vitest'
import { inspectReceiptDocumentExtractionSummary } from '../../src/extraction/parsers/receipt-document.parser'

interface ReceiptScanOcrShapeCase {
  name: string
  rawText: string
  expected: {
    issuerPattern: RegExp
    totalAmountMinor: number
    vatAmountMinor: number
    vatBaseAmountMinor: number
    paymentDate: string
    referenceNumber: string
    paymentMethodPattern?: RegExp
  }
}

const cases: ReceiptScanOcrShapeCase[] = [
  {
    name: 'Lidl Zdiby oil receipt with DPH z gross recap',
    rawText: [
      'Lidl provozovna:',
      'Zdiby, Ke Zdibsku 272',
      '508970 Olej 299,90 C',
      'K PLATBE 299,90',
      'Karta 299,90',
      'Celkova zaplacena castka 299,90',
      '19/04/26 12:56 Uctenka cislo 01521',
      'PRODEJ 299.90 Kc',
      'C 21% DPH z 299,90 52,05'
    ].join('\n'),
    expected: {
      issuerPattern: /Lidl/i,
      totalAmountMinor: 29990,
      vatAmountMinor: 5205,
      vatBaseAmountMinor: 24785,
      paymentDate: '2026-04-19',
      referenceNumber: '01521',
      paymentMethodPattern: /kartou/i
    }
  },
  {
    name: 'Lidl Kralupy oil receipt with short receipt number',
    rawText: [
      'Lidl provozovna:',
      'Kralupy nad Vltavou',
      'Olej 299,90 C',
      'K PLATBE 299,90',
      'Karta 299,90',
      '19/04/26 18:08 Uctenka cislo 00091',
      'C 21% DPH z 299,90 52,05'
    ].join('\n'),
    expected: {
      issuerPattern: /Lidl/i,
      totalAmountMinor: 29990,
      vatAmountMinor: 5205,
      vatBaseAmountMinor: 24785,
      paymentDate: '2026-04-19',
      referenceNumber: '00091',
      paymentMethodPattern: /kartou/i
    }
  },
  {
    name: 'Lidl Zdiby second oil receipt with same VAT shape',
    rawText: [
      'Lidl provozovna:',
      'Zdiby',
      '508970 Olej 299,90 C',
      'K PLATBE 299,90',
      'Karta 299,90',
      '19/04/26 13:17 Uctenka cislo 01527',
      'C 21% DPH z 299,90 52,05'
    ].join('\n'),
    expected: {
      issuerPattern: /Lidl/i,
      totalAmountMinor: 29990,
      vatAmountMinor: 5205,
      vatBaseAmountMinor: 24785,
      paymentDate: '2026-04-19',
      referenceNumber: '01527',
      paymentMethodPattern: /kartou/i
    }
  },
  {
    name: 'Tesco receipt with VAT then gross recap columns',
    rawText: [
      'TESCO',
      'Tesco Stores CR a.s.',
      'Hypermarket Praha Eden',
      'Nakupni taska 9,90A',
      'ADAPTER 3X KULATY 319,60A',
      'Zasuvka kulata 3x16A 399,50A',
      'CELKEM 729,00',
      'Platebni karta 729,00',
      'Sazba DPH Celkem',
      '21% 126,52 729,00A',
      '20.04.2026 09:08:12',
      'Uctenka cislo 202604200908',
      'CZK 729,00'
    ].join('\n'),
    expected: {
      issuerPattern: /TESCO/i,
      totalAmountMinor: 72900,
      vatAmountMinor: 12652,
      vatBaseAmountMinor: 60248,
      paymentDate: '2026-04-20',
      referenceNumber: '202604200908',
      paymentMethodPattern: /kartou/i
    }
  },
  {
    name: 'Tesco receipt keeps discounted total over body subtotals',
    rawText: [
      'TESCO',
      'Tesco Stores CR a.s.',
      'Hypermarket Praha Eden',
      'MEZISOUCET 3454,70',
      'CC PAS -300,00',
      'Celkova uspora -912,47',
      'CELKEM 2542,23',
      'Platebni karta 2542,23',
      'Sazba DPH Celkem',
      '21% 441,21 2542,23A',
      '20.04.2026 08:38:04',
      'Uctenka cislo 202604200838',
      'CZK 2542,23'
    ].join('\n'),
    expected: {
      issuerPattern: /TESCO/i,
      totalAmountMinor: 254223,
      vatAmountMinor: 44121,
      vatBaseAmountMinor: 210102,
      paymentDate: '2026-04-20',
      referenceNumber: '202604200838',
      paymentMethodPattern: /kartou/i
    }
  },
  {
    name: 'Bauhaus receipt ignores cash tendered and returned amounts',
    rawText: [
      'BAUHAUS',
      'BAUHAUS k.s.',
      'Strazni 7,639 00 Brno',
      'SILIKON SANITARNI ST 318,00 Z',
      'Celkem CZK 318,00',
      'CZK hotovost 400,00',
      'VRACENO 82,00',
      'Hruby obrat 318,00',
      'obrat netto 262,81',
      '% DPHZ 21,00% 318,00 55,19',
      'Suma DPH 318,00 55,19',
      'EET: pokladna/doklad: 0004/00861784',
      '01681998 12.04.26 14:13:17 1096'
    ].join('\n'),
    expected: {
      issuerPattern: /BAUHAUS k\.s\./i,
      totalAmountMinor: 31800,
      vatAmountMinor: 5519,
      vatBaseAmountMinor: 26281,
      paymentDate: '2026-04-12',
      referenceNumber: '0004/00861784',
      paymentMethodPattern: /hotov/i
    }
  },
  {
    name: 'Locksystems receipt is merchant receipt not handwritten key note',
    rawText: [
      'STVRZENKA - DANOVY DOKLAD: 0006169/26',
      'LOCKSYSTEMS s.r.o.',
      'Korunni 913/28',
      '120 00 Praha 2',
      'IC: 29048702 DIC: CZ29048702',
      '17.4.2026 10:14:16',
      'Cislo Nazev zbozi Cena Pocet',
      'J004434 Zamek nab. CORBIN 180,00 1',
      'C E L K E M [Kc] 180,00',
      'Zaklad DPH 21% 148,76',
      'DPH 21% 31,24',
      'Forma uhrady: Platebni karta'
    ].join('\n'),
    expected: {
      issuerPattern: /LOCKSYSTEMS s\.r\.o\./i,
      totalAmountMinor: 18000,
      vatAmountMinor: 3124,
      vatBaseAmountMinor: 14876,
      paymentDate: '2026-04-17',
      referenceNumber: '0006169/26',
      paymentMethodPattern: /kartou/i
    }
  },
  {
    name: 'dm receipt ignores cash tendered and returned amounts with zero-rate rounding row',
    rawText: [
      'dm drogerie markt s.r.o.',
      'Ceska republika',
      '28.04.2026 09:46:33',
      'Doklad 0159/004/262716',
      'Sazba DPH Celkem Zaklad DPH DPH',
      '0-0,00% 0,50 0,50 0,00',
      '1-21,00% 126,50 104,55 21,95',
      'Celkem 127,00',
      'Hotovost 2000,00',
      'Vraceno 1873,00'
    ].join('\n'),
    expected: {
      issuerPattern: /dm drogerie markt/i,
      totalAmountMinor: 12700,
      vatAmountMinor: 2195,
      vatBaseAmountMinor: 10455,
      paymentDate: '2026-04-28',
      referenceNumber: '0159/004/262716',
      paymentMethodPattern: /hotov/i
    }
  }
]

describe('receipt scan OCR shapes', () => {
  it.each(cases)('extracts totals, VAT, dates, and references from $name', ({ rawText, expected }) => {
    const summary = inspectReceiptDocumentExtractionSummary({
      content: '',
      ocrOrVisionFallback: {
        adapter: 'ocr',
        parsedFields: { rawText }
      }
    })

    expect(summary.ocrDetected).toBe(true)
    expect(summary.finalStatus).toBe('parsed')
    expect(summary.issuerOrCounterparty).toMatch(expected.issuerPattern)
    expect(summary.totalAmountMinor).toBe(expected.totalAmountMinor)
    expect(summary.totalCurrency).toBe('CZK')
    expect(summary.vatAmountMinor).toBe(expected.vatAmountMinor)
    expect(summary.vatBaseAmountMinor).toBe(expected.vatBaseAmountMinor)
    expect(summary.paymentDate).toBe(expected.paymentDate)
    expect(summary.referenceNumber).toBe(expected.referenceNumber)

    if (expected.paymentMethodPattern) {
      expect(summary.paymentMethod).toMatch(expected.paymentMethodPattern)
    }
  })
})
