# Hotel Configuration

## Účel hotel configuration vrstvy
Hotel configuration vrstva umožňuje provozovat stejný core engine pro více hotelů s rozdílnými účty, providery a business pravidly bez forkování kódu.

## Co má být nastavitelné per hotel
- bank accounts (hlavní účty, payout účty, interní transfer účty)
- currencies (primární měna, povolené měny)
- payment channels (OTA/gateway/direct bank)
- PMS/provider mapping
- which source settles to which bank
- ancillary rules
- parking included/not included
- evidence-of-payment rules
- document expectations

## Co nemá být hardcoded do core engine
- konkrétní čísla účtů
- konkrétní channel názvy jednoho hotelu
- source-to-bank routing výjimky specifické pro jediný provoz
- per-hotel ancillary semantics
- per-hotel dokumentové policy

Tyto věci patří do konfigurace, ne do deterministic core matcheru.

## Doporučený směr budoucího config modelu
- Jeden versionovaný hotel profile (např. `hotelKey`, `configVersion`).
- Jasné oddělení:
  - identity & accounts
  - source mappings
  - settlement policy
  - evidence policy
  - ancillary policy
- Validace configu při načtení (schema + business constraints).
- Auditní stopa změn konfigurace.

## Příklady konfigurací pro různé hotely

### Hotel A (gateway-heavy)
- většina Reservation+ plateb přes gateway payout
- parking často jako samostatná charge
- strict dokumentová evidence pro vybrané toky

### Hotel B (direct-bank-heavy)
- více manuálních Reservation+ převodů
- vysoký podíl incoming bank matching
- ancillary často included v hlavní rezervaci

### Hotel C (mixed OTA/PMS ecosystem)
- více OTA payout zdrojů současně
- PMS export s odlišným polem reference
- potřeba víc source connector variant, stejné core matching rules
