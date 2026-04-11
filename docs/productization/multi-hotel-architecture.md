# Multi-hotel Architecture

## Účel dokumentu
Tento dokument popisuje cílovou architekturu pro posun současné aplikace z jednoho hotelu na robustní multi-hotel produkt, bez ztráty auditovatelnosti a deterministického chování.

## Cíl produktu
- Udržet jedno společné jádro finančního reconciliation engine.
- Umožnit připojovat různé hotely s různými zdroji dat bez forkování core logiky.
- Zachovat browser-first operator workflow a transparentní debug truth.

## Co je společné jádro systému
Společné jádro (core engine) má zůstat jednotné pro všechny hotely:
- ingest orchestrace
- extraction pipeline contracty
- normalizační model transakcí a dokumentů
- deterministic matching pravidla a priority
- review/exception model
- export/reporting skeleton
- audit trail, debug truth a manual override model

## Co je vyměnitelné mezi hotely
Per-hotel vyměnitelné části:
- source connectors (PMS, banky, gateways, OTA, invoice-list formáty)
- mapping a konfigurace channelů
- evidence pravidla a očekávání dokumentů
- ancillary pravidla (např. parking included vs samostatná položka)
- operátorské labely a lokální terminologie

## Architektonické vrstvy

### import
- Načtení souborů z browser workflow.
- Klasifikace vstupů na typ zdroje + variantu.

### extraction
- Source-specific parsery převádějí raw soubory na strukturované records.
- Output drží source truth (neprovádí business guessing).

### normalization
- Převod records do jednotného domain modelu pro matching.
- Normalized pole musí být stabilní napříč zdroji.

### matching
- Deterministické párování očekávaných vs skutečných plateb/dokladů.
- Přesné anchor-based vazby (reference, VS, voucher, document IDs, intervaly).

### exceptions/review
- Unmatched/ambiguous případy do operator review bucketů.
- Přesné důvody blocked state, bez tichých fallbacků.

### reporting/export
- Stabilní výstupní vrstvy (overview, exporty, debug truth).
- Auditovatelná reprodukce rozhodnutí z konkrétního měsíce.

## Core Engine vs Source Connectors vs Hotel Configuration
- **Core Engine**: jednotná business orchestrace a matching framework.
- **Source Connectors**: zdrojově specifické classifier/parser/normalizer adaptéry.
- **Hotel Configuration**: per-hotel mapping a policy pravidla (bez změn core kódu).

## Source classifier / adapter / normalizer princip
Doporučený pattern:
1. **Classifier**: detekuje source family + variantu pomocí signatur (hlavičky, sheet shape, formát).
2. **Adapter (parser)**: převede konkrétní formát na source records.
3. **Normalizer**: mapuje records na jednotný normalized model.

Cíl: změny ve zdrojích řešit v connector vrstvě, ne v core matching engine.

## Auditovatelnost a deterministic matching
- Matching rozhodnutí musí být reprodukovatelné ze stejných vstupních dat.
- Každé rozhodnutí má mít explicitní reason a použité anchor pole.
- Ambiguity musí být explicitně surfaced (`ambiguous_*`), ne skryté fallbackem.

## Manual matching jako operator override layer
- Manual matching zůstává override vrstva nad deterministic enginem.
- Musí být month-scoped, auditovaný a reverzibilní (undo whole group).
- Override nesmí potichu měnit extractor/normalizer truth.

## Co musí být per-hotel konfigurovatelné
- účty a měny
- channel mapping (gateway/OTA/direct bank)
- vazby source -> settlement target bank
- ancillary policy (včetně parking included)
- evidence-of-payment policy
- očekávání dokumentů a minimální required fields

## Jak onboardovat nový hotel
- Zmapovat zdroje a jejich formáty.
- Rozlišit reuse existing connectorů vs potřebu nových.
- Definovat hotel configuration profil.
- Ověřit na uzavřeném historickém měsíci.
- Teprve pak rollout do produkčního workflow.

## Rizika a hranice systému
- Nestabilní exporty třetích stran (změny hlaviček/formátů).
- Smíšené měsíce a duplicity napříč soubory.
- Přetížení fuzzy heuristikami (musí zůstat deterministic-first).
- OCR/AI chyby při low-quality dokumentech.

## Doporučená roadmapa productization
1. Stabilizovat connector contract a test harness pro nové zdroje.
2. Zavést explicitní hotel configuration model oddělený od core.
3. Formalizovat compatibility matrix (zdroj × varianta × hotel).
4. Posílit audit/debug export standardy napříč vrstvami.
5. Připravit onboarding kit pro nový hotel (data checklist + validation protocol).
