# Onboarding New Hotel

## Cíl onboardingu nového hotelu
Bezpečně připojit nový hotel do společného reconciliation produktu tak, aby výstupy byly auditovatelné, reprodukovatelné a operátorsky použitelné od prvního ostrého měsíce.

## Jaké podklady je potřeba dodat
- reprezentativní exporty za uzavřený měsíc (banka, PMS, gateway, OTA, invoice list, dokumenty)
- popis settlement toků (který zdroj jde na který účet)
- seznam účtů a měn
- pravidla ancillary položek (včetně parking included/not included)
- business pravidla evidence úhrady

## Jak identifikovat zdroje
- rozpad vstupů na source families
- identifikace variant formátů uvnitř jedné family
- mapování, které varianty jsou povinné pro měsíční workflow

## Kdy stačí reuse existujících connectorů
- signatura a sloupce/sheet shape odpovídají existujícímu connectoru
- business význam polí je stejný
- fixture replay na historickém měsíci projde bez degradace truth

## Kdy je potřeba nový connector
- odlišná signatura nebo struktura, kterou nelze bezpečně pokrýt stávajícím parserem
- jiný business význam klíčových polí
- chybějící deterministické anchor pole ve stávajícím mapování

## Jak probíhá validace na uzavřeném měsíci
1. Spustit ingest/extraction/normalization nad reálnými soubory.
2. Ověřit matching výsledky a exception buckety.
3. Ověřit debug truth (reasons, anchors, source variants).
4. Potvrdit exporty/reporting proti očekávání operátora.

## Go-live checklist
- connectors + fixtures + regression testy hotové
- hotel configuration schválena
- uzavřený měsíc ověřen bez kritických mismatchů
- operator review flow pochopitelný (včetně manual override)
- audit/debug export připravený pro support

## Rizika při onboardingu
- skryté varianty formátů, které nebyly v pilotních datech
- chybějící anchor pole pro deterministic linking
- nejasná ancillary pravidla
- směšování multi-month datasetu bez jasného month scope

## Doporučený onboarding workflow krok za krokem
1. Discovery workshop nad zdroji a settlement mapou.
2. Sběr a katalogizace datových exportů.
3. Connector reuse/new connector decision.
4. Implementace a testy connectorů.
5. Definice hotel configuration.
6. End-to-end validace na uzavřeném měsíci.
7. Operator UAT + audit review.
8. Controlled go-live a první měsíc pod zvýšeným dohledem.
