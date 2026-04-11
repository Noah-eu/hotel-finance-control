# Source Connectors

## Účel source connector vrstvy
Source connector vrstva odděluje variabilitu vstupních formátů od společného reconciliation jádra. Jejím cílem je absorbovat změny v exportech bez zásahu do core matching logiky.

## Rozdíl mezi file format support a business-source understanding
- **File format support**: umíme soubor technicky přečíst.
- **Business-source understanding**: víme, co data ekonomicky znamenají (payout row, bank inflow, invoice list line, ancillary atd.).

Obě vrstvy musí být oddělené a explicitní.

## Connector contract
Každý connector by měl mít konzistentní contract:

### classifier/signature
- detekce source family + varianty
- deterministická signatura (headers, sheet names, column families, fixed markers)

### parser
- převod raw inputu na strukturované source records
- bez domýšlení business vazeb mimo zdrojovou pravdu

### normalizer
- mapování do jednotného normalized modelu
- explicitní pole pro anchor hodnoty (reference, variable symbol, payout keys, client IDs)

### operator label
- čitelné labely pro UI/review (bez interního kódu)
- source varianta musí být dohledatelná v debug truth

### fixtures
- reprezentativní real-world fixture pro každý podporovaný variant
- fixture musí pokrýt i edge-cases (encoding, missing columns, shifted headers)

### tests
- parser tests (shape/field extraction)
- runtime integration tests (classification + normalized truth)
- regression tests pro historické bug patterny

### debug truth
- raw -> parsed -> normalized trace
- jasné failure reason při classification/parsing failure
- source variant marker v runtime exportu

## Příklady typů zdrojů
- bank statement
- PMS reservation export
- gateway settlement
- OTA payout report
- invoice list
- invoice/receipt document

## Jak přidávat nový connector
1. Definovat classifier signature.
2. Připravit parser s explicitními poli.
3. Namapovat normalizer contract.
4. Přidat fixtures a targeted testy.
5. Doplnit runtime debug truth pole.
6. Ověřit na uzavřeném měsíci s reálnými daty.

## Co má být generic a co source-specific
- **Generic**: orchestrace pipeline, normalized contracts, matching framework, audit/debug infrastructure.
- **Source-specific**: headers/signatures, parser varianty, mapping detailů ze zdroje na normalized pole.

## Failure modes a fallback strategy
- classifier mismatch -> explicit unsupported/unknown variant
- parser partial extraction -> explicit failure reason + no silent default mapping
- missing deterministic anchors -> zůstává unresolved
- OCR/AI fallback jen pro dokumenty a jen jako secondary path, ne primary zdroj pravdy
