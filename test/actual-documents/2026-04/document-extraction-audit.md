# Document extraction audit

Scope: pre-fix current runtime extraction audit for `test/actual-documents/2026-04/input`.

| fileName | parserId | branch | expected supplier | actual supplier | expected document | actual document | expected reference | actual reference | expected amount | actual amount | expected issue date | actual issue date | mismatch types | first divergence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| 1022225545.pdf |  | text-pdf-parser | Vodafone Czech Republic a.s. |  | 1022225545 |  | 1022225545 |  | 128900 |  | 2026-03-16 |  | supplier_mismatch, document_number_mismatch, reference_mismatch, issue_date_mismatch, amount_mismatch, currency_mismatch | browser_intake |
| 141848652_1.pdf | invoice | text-pdf-parser | ARVAL CZ s.r.o. | JOKELAND s.r.o. | 26069453 |  | 26069453 |  | 1942926 | 337202 | 2026-04-15 | 2026-04-15 | supplier_mismatch, document_number_mismatch, reference_mismatch, amount_mismatch | invoice_parser |
| 141848652_2.pdf | invoice | text-pdf-parser | ARVAL CZ s.r.o. | JOKELAND s.r.o. | 26069454 |  | 26069454 |  | 156688 | 27194 | 2026-04-15 | 2026-04-15 | supplier_mismatch, document_number_mismatch, reference_mismatch, amount_mismatch | invoice_parser |
| 4017179840.pdf | invoice | text-pdf-parser | Alza.cz a.s. |  | 4017179840 | 5938515961 | 5938515961 | 5938515961 | 264500 |  | 2026-04-26 | 2026-04-26 | supplier_mismatch, document_number_mismatch, amount_mismatch, currency_mismatch | invoice_parser |
| Booking.pdf | booking | text-pdf-parser | Booking.com B.V. |  | 1650536863 |  | 1650536863 |  | 4703948 |  | 2026-04-03 |  | supplier_mismatch, document_number_mismatch, reference_mismatch, issue_date_mismatch, amount_mismatch, currency_mismatch | browser_intake |
| DM388.7.PDF | receipt | text-pdf-parser |  | dm drogerie markt s.r.o. |  |  |  |  |  | 38870 |  |  | missing_expected_manifest | browser_intake |
| DOK17_202601867.PDF | invoice | text-pdf-parser | La-Vin s.r.o. |  | 202601867 |  | 202601867 |  | 540000 |  | 2026-03-25 |  | supplier_mismatch, document_number_mismatch, reference_mismatch, issue_date_mismatch, amount_mismatch, currency_mismatch | invoice_parser |
| Faktura_Datainfo_c_JOKELAND_sro_260050_202642_12730.isdoc.pdf | invoice | text-pdf-parser | DATAINFO, spol. s r.o. | DATAINFO, spol. s r.o. | 1260050 | 1260050 | 1260050 | 1260050 | 2178000 | 2178000 | 2026-03-31 | 2026-03-31 |  | review_render |
| Potraviny640.pdf | receipt | ocr-required |  |  |  |  |  |  |  |  |  |  | missing_expected_manifest | browser_intake |
| PRE_187131229.pdf | invoice | text-pdf-parser | Pražská energetika, a. s. |  | 187131229 | 30422308 | 30422308 | 30422308 | 667000 |  | 2026-04-07 |  | supplier_mismatch, document_number_mismatch, issue_date_mismatch, amount_mismatch, currency_mismatch | invoice_parser |
| Previo.pdf | invoice | text-pdf-parser | PREVIO s.r.o. | PREVIO s.r.o. | 2026704996 | 2026704996 | 2026704996 | 2026704996 | 329477 | 329477 | 2026-04-08 | 2026-04-08 |  | review_render |
| ScanTesco.PDF | receipt | text-pdf-parser |  | TESCO |  |  |  |  |  | 378250 |  |  | missing_expected_manifest | browser_intake |
| Sonet.pdf | invoice | text-pdf-parser | SONET, společnost s.r.o. | Příkazem | 1002604478 |  | 1002604478 |  | 50820 | 50820 | 2026-04-01 | 2026-04-15 | supplier_mismatch, document_number_mismatch, reference_mismatch, issue_date_mismatch | invoice_parser |
| Tesco2153.PDF | receipt | text-pdf-parser |  | Tesco |  |  |  |  |  | 215300 |  |  | missing_expected_manifest | browser_intake |
| Tmobile.pdf | invoice | text-pdf-parser | T-Mobile Czech Republic a.s. | T-Mobile Czech Republic a.s. | SB-4352965310 | SB-4352965310 | SB-4352965310 | SB-4352965310 | 28900 | 28900 | 2026-04-09 | 2026-04-09 |  | review_render |
| Vydana faktura 2616762.pdf | invoice | ocr-required | Balírny Praha - Holešovice s.r.o. |  | 2616762 |  | 2616762 |  | 430000 |  | 2026-04-14 |  | supplier_mismatch, document_number_mismatch, reference_mismatch, issue_date_mismatch, amount_mismatch, currency_mismatch | pdf_text_layer |

