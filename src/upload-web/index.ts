import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import {
  ingestUploadedMonthlyFiles,
  type ImportedMonthlySourceFile,
  type MonthlyBatchResult,
  type UploadedMonthlyFileRoute,
  type UploadedMonthlyFile
} from '../monthly-batch'
import { buildExportArtifacts, type ExportArtifactsResult } from '../export'
import {
  buildReviewScreen,
  type ReviewEvidenceEntry,
  type ReviewExpenseComparisonSide,
  type ReviewScreenData,
  type ReviewSectionItem
} from '../review'
import type { ReconciliationReport } from '../reporting'
import { formatAmountMinorCs } from '../shared/money'
import { emitBrowserRuntimeBundle } from './browser-bundle'
import { buildBrowserRuntimeUploadStateFromFiles } from './browser-runtime-state'
import type { DeterministicDocumentExtractionSummary } from '../extraction'
export {
  buildBrowserRuntimeStateFromSelectedFiles,
  createBrowserRuntime,
  prepareBrowserRuntimeUploadedFilesFromSelectedFiles
} from './browser-runtime'

export interface BuildUploadWebFlowOptions {
  generatedAt?: string
  outputPath?: string
}

export interface BuildBrowserReviewScreenOptions extends BuildUploadedBatchPreviewInput {
  outputPath?: string
}

export interface BuildUploadedBatchPreviewInput {
  files: UploadedMonthlyFile[]
  runId: string
  generatedAt: string
}

export interface UploadedBatchPreviewResult {
  importedFiles: ImportedMonthlySourceFile[]
  fileRoutes: UploadedMonthlyFileRoute[]
  batch: MonthlyBatchResult
  review: ReviewScreenData
}

export interface UploadedMonthlyRunResult extends UploadedBatchPreviewResult {
  report: ReconciliationReport
  exports: ExportArtifactsResult
}

export interface UploadWebFlowResult {
  html: string
  generatedAt: string
  outputPath?: string
}

export interface BrowserRuntimeUploadState {
  generatedAt: string
  runId: string
  monthLabel: string
  reconciliationSnapshot: {
    sourceFunction: string
    objectPath: string
    matchedCount: number
    unmatchedCount: number
    matchedPayoutBatchKeys: string[]
    unmatchedPayoutBatchKeys: string[]
    payoutBatchDecisions: Array<{
      payoutBatchKey: string
      platform: string
      expectedTotalMinor: number
      documentTotalMinor?: number
      expectedBankAmountMinor: number
      currency: string
      documentCurrency?: string
      expectedBankCurrency: string
      matchingAmountSource: 'batch_total' | 'booking_local_total'
      selectionMode?: 'eligible_candidate' | 'unique_exact_amount_fallback'
      exactAmountMatchExistsBeforeDateEvidence: boolean
      sameCurrencyCandidateAmountMinors: number[]
      nearestAmountDeltaMinor?: number
      componentRowCount: number
      componentRowAmountMinors: number[]
      payoutDate: string
      bankCandidateCountBeforeFiltering: number
      bankCandidateCountAfterAmountCurrency: number
      bankCandidateCountAfterDateWindow: number
      bankCandidateCountAfterEvidenceFiltering: number
      matched: boolean
      matchedBankTransactionId?: string
      noMatchReason?: string
    }>
    airbnbUnmatchedHistogram: {
      noExactAmount: number
      dateRejected: number
      evidenceRejected: number
      ambiguous: number
      other: number
    }
    inboundBankTransactions: Array<{
      transactionId: string
      bookedAt: string
      amountMinor: number
      currency: string
      counterparty?: string
      reference?: string
      accountId: string
    }>
  }
  routingSummary: {
    uploadedFileCount: number
    supportedFileCount: number
    unsupportedFileCount: number
    errorFileCount: number
  }
  runtimeAudit: {
    payoutDiagnostics: {
      extractedAirbnbPayoutRowRefs: string[]
      extractedAirbnbRawReferences: string[]
      extractedAirbnbDataReferences: string[]
      extractedAirbnbReferenceCodes: string[]
      extractedAirbnbPayoutReferences: string[]
      workflowPayoutBatchKeys: string[]
      workflowPayoutReferences: string[]
      reportMatchedPayoutReferences: string[]
      reportUnmatchedPayoutReferences: string[]
      runtimeMatchedTitleSourceValues: string[]
      runtimeUnmatchedTitleSourceValues: string[]
    }
    fileIntakeDiagnostics: Array<{
      fileName: string
      mimeType?: string
      textExtractionMode?: 'text' | 'pdf-text' | 'binary-workbook' | 'binary'
      textExtractionStatus?: 'extracted' | 'failed' | 'not-attempted'
      extractedTextPresent: boolean
      textLength: number
      textPreview?: string
      textTailPreview?: string
      keywordHits: string[]
      capabilityProfile: 'structured_tabular' | 'text_document' | 'pdf_text_layer' | 'pdf_image_only' | 'image_receipt_like' | 'unsupported_binary' | 'unknown'
      capabilityTransportProfile: 'structured_csv' | 'structured_workbook' | 'text_pdf' | 'image_pdf' | 'text_document' | 'image_document' | 'unsupported_binary' | 'unknown_document'
      capabilityDocumentHints: Array<'invoice_like' | 'receipt_like' | 'payout_statement_like'>
      capabilityConfidence: 'none' | 'hint' | 'strong'
      capabilityEvidence: string[]
      ingestionBranch: 'structured-parser' | 'text-document-parser' | 'text-pdf-parser' | 'ocr-required' | 'unsupported'
      ingestionReason?: string
      detectedSignals: string[]
      detectedSignatures: string[]
      matchedRules: string[]
      missingSignals: string[]
      parserSupported: boolean
      decisionConfidence: 'none' | 'hint' | 'strong'
      documentExtractionSummary?: DeterministicDocumentExtractionSummary
      airbnbHeaderDiagnostics?: {
        parserVariant: 'structured-export' | 'real-mixed-export'
        rawHeaderRow: string
        normalizedHeaders: string[]
        normalizedHeaderMap: string[]
        requiredCanonicalHeaders: string[]
        mappedCanonicalHeaders: Partial<Record<'payoutDate' | 'amountMinor' | 'currency' | 'payoutReference' | 'reservationId' | 'listingId', string>>
        candidateSourceHeaders: string[]
        missingCanonicalHeaders: string[]
      }
      parserExtractedPaymentId?: string
      parserExtractedPayoutDate?: string
      parserExtractedPayoutTotal?: string
      parserExtractedLocalTotal?: string
      parserExtractedIbanHint?: string
      parserExtractedExchangeRate?: string
      validatorInputPaymentId?: string
      validatorInputPayoutDate?: string
      validatorInputPayoutTotal?: string
      parsedPaymentId?: string
      parsedPayoutDate?: string
      parsedPayoutTotal?: string
      parsedLocalTotal?: string
      parsedIbanHint?: string
      parsedExchangeRate?: string
      requiredFieldsCheck?: 'passed' | 'failed'
      missingFields?: string[]
      sourceSystem: string
      documentType: string
      classificationBasis: string
      status: 'supported' | 'unsupported' | 'error'
      intakeStatus: 'parsed' | 'unsupported' | 'unclassified' | 'error'
      role: 'primary' | 'supplemental'
    }>
  }
  preparedFiles: Array<{
    fileName: string
    sourceDocumentId: string
    sourceSystem: string
    documentType: string
    parserId?: string
    classificationBasis: string
    role: 'primary' | 'supplemental'
    warnings: string[]
  }>
  fileRoutes: Array<{
    fileName: string
    status: 'supported' | 'unsupported' | 'error'
    intakeStatus: 'parsed' | 'unsupported' | 'unclassified' | 'error'
    sourceSystem: string
    documentType: string
    sourceDocumentId?: string
    parserId?: string
    classificationBasis: string
    role: 'primary' | 'supplemental'
    extractedCount: number
    extractedRecordIds: string[]
    warnings: string[]
    reason?: string
    errorMessage?: string
      decision: {
        capability: {
          profile: 'structured_tabular' | 'text_document' | 'pdf_text_layer' | 'pdf_image_only' | 'image_receipt_like' | 'unsupported_binary' | 'unknown'
          transportProfile: 'structured_csv' | 'structured_workbook' | 'text_pdf' | 'image_pdf' | 'text_document' | 'image_document' | 'unsupported_binary' | 'unknown_document'
          documentHints: Array<'invoice_like' | 'receipt_like' | 'payout_statement_like'>
          confidence: 'none' | 'hint' | 'strong'
          evidence: string[]
        }
      ingestionBranch: 'structured-parser' | 'text-document-parser' | 'text-pdf-parser' | 'ocr-required' | 'unsupported'
      ingestionReason: string
      detectedSignals: string[]
      matchedRules: string[]
      missingSignals: string[]
      parserSupported: boolean
      confidence: 'none' | 'hint' | 'strong'
      resolvedSourceSystem: string
      resolvedDocumentType: string
      resolvedRole: 'primary' | 'supplemental'
      resolvedBucket: 'recognized-supported' | 'supplemental-supported' | 'unsupported' | 'unclassified' | 'ingest-error'
    }
  }>
  extractedRecords: Array<{
    fileName: string
    extractedCount: number
    extractedRecordIds: string[]
    accountLabelCs: string
    parserDebugLabel?: string
  }>
  supportedExpenseLinks: Array<{
    expenseTransactionId: string
    supportTransactionId: string
    supportSourceDocumentIds: string[]
    matchScore: number
    reasons: string[]
  }>
  reportSummary: UploadedMonthlyRunResult['report']['summary']
  reportTransactions: Array<{
    transactionId: string
    labelCs: string
    source: string
    subtype?: string
    amount: string
    status: string
  }>
  reviewSummary: ReviewScreenData['summary']
  reviewSections: Pick<ReviewScreenData, 'matched' | 'reservationSettlementOverview' | 'ancillarySettlementOverview' | 'unmatchedReservationSettlements' | 'payoutBatchMatched' | 'payoutBatchUnmatched' | 'expenseMatched' | 'expenseNeedsReview' | 'expenseUnmatchedDocuments' | 'expenseUnmatchedOutflows' | 'unmatched' | 'suspicious' | 'missingDocuments'>
  exportFiles: Array<{
    labelCs: string
    fileName: string
  }>
}

export interface BrowserReviewScreenResult {
  html: string
  preview: UploadedBatchPreviewResult
  outputPath?: string
}

export interface BuildUploadedMonthlyRunOptions extends BuildBrowserExportPackageOptions {
  outputPath?: string
}

export interface BrowserUploadedMonthlyRunResult {
  html: string
  run: UploadedMonthlyRunResult
  outputPath?: string
}

export interface BuildBrowserExportPackageOptions extends BuildUploadedBatchPreviewInput {
  outputDir?: string
}

export interface BrowserExportPackageResult {
  preview: UploadedBatchPreviewResult
  exports: ExportArtifactsResult
}

export function buildUploadWebFlow(options: BuildUploadWebFlowOptions = {}): UploadWebFlowResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const html = renderUploadWebFlowHtmlInternal(generatedAt)

  if (options.outputPath) {
    const resolved = resolve(options.outputPath)
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, html, 'utf8')

    return {
      html,
      generatedAt,
      outputPath: resolved
    }
  }

  return {
    html,
    generatedAt
  }
}

export function renderUploadWebFlowHtml(generatedAt: string): string {
  return renderUploadWebFlowHtmlInternal(generatedAt)
}

export function buildBrowserRuntimeUploadState(input: BuildUploadedBatchPreviewInput): BrowserRuntimeUploadState {
  return buildBrowserRuntimeUploadStateFromFiles(input)
}

export interface BrowserRuntimeInputFile {
  name: string
  type?: string
  text?: () => Promise<string>
  arrayBuffer?: () => Promise<ArrayBuffer>
}

export interface BrowserRuntimeBuilder {
  buildRuntimeState(input: {
    files: BrowserRuntimeInputFile[]
    month?: string
    generatedAt: string
  }): Promise<BrowserRuntimeUploadState>
}

export function renderBrowserRuntimeClientBootstrap(runtimeAssetPath = './browser-runtime.js'): string {
  return `
      import(${JSON.stringify(runtimeAssetPath)}).then((module) => {
        window.__hotelFinanceCreateBrowserRuntime = module.createBrowserRuntime;
        window.__hotelFinanceBuildWorkspaceExcelExport = module.buildBrowserRuntimeWorkspaceExcelExport;
        window.__hotelFinanceBuildBrowserRuntimeState = async function buildBrowserRuntimeState(input) {
          const runtime = module.createBrowserRuntime();
          return runtime.buildRuntimeState({
            files: (input.files || []).map((file) => ({
              name: file.name,
              text: async () => file.content
            })),
            month: input.runId.replace('browser-runtime-upload-', ''),
            generatedAt: input.generatedAt
          });
        };
      });
    `
}

export async function emitBrowserRuntimeAssets(outputPath: string): Promise<string[]> {
  const { runtimeAssetPath } = await emitBrowserRuntimeBundle(outputPath)

  return [runtimeAssetPath]
}

function renderUploadWebFlowHtmlInternal(generatedAt: string): string {
  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hotel Finance Control – Nahrání měsíčních souborů</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
        background: #f3f6fb;
        color: #142033;
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
      }
      .hero, .card {
        background: white;
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 10px 35px rgba(20, 32, 51, 0.08);
        margin-bottom: 20px;
      }
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #eaf2ff;
        color: #174ea6;
        font-size: 12px;
        font-weight: 600;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .flow-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .flow-step {
        border: 1px solid #dce6f5;
        border-radius: 14px;
        padding: 16px;
        background: #fbfdff;
      }
      .flow-step strong {
        display: block;
        margin-bottom: 6px;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-weight: 700;
      }
      input[type="file"] {
        width: 100%;
      }
      button {
        border: 0;
        border-radius: 12px;
        background: #174ea6;
        color: white;
        font-size: 15px;
        font-weight: 700;
        padding: 12px 18px;
        cursor: pointer;
      }
      ul {
        padding-left: 20px;
      }
      .hint {
        color: #52627a;
        font-size: 14px;
      }
      .summary {
        background: #f7f9fc;
        border-radius: 14px;
        padding: 16px;
        min-height: 120px;
      }
      .summary.empty {
        color: #6a7891;
      }
      .runtime-panel {
        border: 1px solid #dce6f5;
        border-radius: 14px;
        padding: 16px;
        margin-top: 16px;
        background: #fbfdff;
      }
      .runtime-panel.loading {
        opacity: 0.75;
      }
      .runtime-panel h3 {
        margin-top: 0;
      }
      .runtime-panel.error {
        border-color: #f3c6cf;
        background: #fff6f7;
      }
      .runtime-panel h4 {
        margin-bottom: 8px;
      }
      .runtime-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .runtime-card {
        border: 1px solid #e4ebf6;
        border-radius: 14px;
        padding: 16px;
        background: white;
      }
      .runtime-card ul {
        margin: 0;
      }
      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
      }
      .metric-tile {
        border-radius: 12px;
        background: #f7f9fc;
        padding: 12px;
      }
      .trace-list li,
      .review-list li,
      .link-list li,
      .export-list li,
      .report-list li {
        margin-bottom: 10px;
      }
      .amount {
        font-weight: 700;
      }
      .expense-review-group {
        margin-bottom: 16px;
      }
      .expense-review-group h5 {
        margin: 0 0 8px;
      }
      .expense-item {
        border: 1px solid #e4ebf6;
        border-radius: 12px;
        background: #fbfdff;
        padding: 12px;
        margin-bottom: 10px;
      }
      .expense-comparison {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(180px, 220px) minmax(0, 1fr);
        gap: 12px;
      }
      .expense-side,
      .expense-status {
        border-radius: 10px;
        background: #f7f9fc;
        padding: 10px 12px;
      }
      .expense-side h6,
      .expense-status h6 {
        margin: 0 0 8px;
        font-size: 13px;
      }
      .expense-side ul,
      .expense-status ul {
        margin: 0;
        padding-left: 18px;
      }
      .status-badge {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .status-badge.confirmed { background: #e7f6ec; color: #0f7a32; }
      .status-badge.weak { background: #fff4dd; color: #946200; }
      .status-badge.review { background: #fff4dd; color: #946200; }
      .status-badge.unmatched { background: #ffe3e8; color: #b42318; }
      code {
        background: #f1f4f8;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
  <span class="pill">Místní nahrání</span>
        <h1>Hotel Finance Control – nahrání měsíčních souborů</h1>
        <p>Tato lokální obrazovka vede operátora jedním skutečným tokem: výběr souborů, příprava sdíleného měsíčního běhu, kontrola výsledků, náhled reportu a předání exportů.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(generatedAt)}</p>
      </section>

      <section class="card">
        <h2>Pracovní postup operátora</h2>
        <div class="flow-grid">
          <div class="flow-step"><strong>1. Vyberte soubory</strong><span class="hint">Banka, OTA exporty, platební brány, faktury a účtenky za jeden měsíc.</span></div>
          <div class="flow-step"><strong>2. Připravte běh</strong><span class="hint">Souborům se přiřadí zdrojový systém, typ dokumentu a trace identifikátory.</span></div>
          <div class="flow-step"><strong>3. Zkontrolujte výstup</strong><span class="hint">Ve stejném sdíleném běhu uvidíte kontrolní sekce, výjimky a vazby na doklady.</span></div>
          <div class="flow-step"><strong>4. Předejte exporty</strong><span class="hint">CSV/XLSX vzniká ze stejného výsledku bez backendu a bez paralelního UI modelu.</span></div>
        </div>
      </section>

      <section class="card">
        <h2>1. Vyberte soubory za měsíc</h2>
        <div class="grid">
          <div>
            <label for="monthly-files">Soubory k nahrání</label>
            <input id="monthly-files" type="file" multiple />
      <p class="hint">Podporované vstupy: bankovní výpisy, OTA exporty, Comgate, faktury a účtenky.</p>
  <p class="hint">Rozpoznání typu souboru používá stejnou sdílenou přípravu jako následné zpracování v <code>monthly-batch</code>, <code>review</code>, <code>reporting</code> a <code>export</code>.</p>
          </div>
          <div>
            <label for="month-label">Označení měsíce</label>
            <input id="month-label" type="month" />
            <p class="hint">Např. <code>2026-03</code> pro březen 2026.</p>
          </div>
        </div>
        <p>
          <button id="prepare-upload" type="button">Připravit soubory ke zpracování</button>
        </p>
      </section>

      <section class="card">
        <h2>2. Přehled připravených souborů</h2>
        <div id="upload-summary" class="summary empty">Zatím nebyly vybrány žádné soubory.</div>
        <div id="runtime-output" class="runtime-panel" hidden>
          <p class="hint">Měsíční workflow čeká na skutečně vybrané soubory a jejich zpracování ve sdíleném toku.</p>
        </div>
      </section>

      <section class="card">
        <h2>Co bude následovat</h2>
        <ul>
          <li>Po přípravě běží stejný sdílený tok pro import, extrakci, normalizaci, párování, výjimky, kontrolu a export.</li>
          <li>Viditelně zůstává zachované trasování na ID transakcí, extrahovaných záznamů a zdrojových dokumentů.</li>
          <li>Tato verze zůstává čistě lokální a bez backendu, aby byl tok souborů snadno auditovatelný i při ruční operátorské kontrole.</li>
        </ul>
      </section>
    </main>

    <script>
      window.__hotelFinanceBuildBrowserRuntimeState = async function buildBrowserRuntimeState(input) {
        throw new Error('Browser runtime bridge není v této statické HTML verzi připojený. Spusťte tuto funkci přes sdílený TypeScript runtime.');
      };

      window.__hotelFinanceSharedUploadWebRuntime = {
        buildBrowserRuntimeStateFromUploadedFiles(input) {
          throw new Error('Sdílený upload-web browser runtime bridge není v této statické HTML verzi připojený.');
        }
      };

${renderBrowserRuntimeClientBootstrap()}

      const fileInput = document.getElementById('monthly-files');
      const monthInput = document.getElementById('month-label');
      const button = document.getElementById('prepare-upload');
      const summary = document.getElementById('upload-summary');
      const runtimeOutput = document.getElementById('runtime-output');
      const generatedAt = ${JSON.stringify(generatedAt)};
      let browserRuntime;
      let currentExpenseReviewState = null;

      function renderSummary() {
        const files = Array.from(fileInput.files || []);
        const month = monthInput.value || 'neuvedeno';

        if (files.length === 0) {
          summary.className = 'summary empty';
          summary.textContent = 'Zatím nebyly vybrány žádné soubory.';
          runtimeOutput.hidden = false;
          runtimeOutput.className = 'runtime-panel';
          runtimeOutput.innerHTML = '<p class="hint">Měsíční workflow čeká na skutečně vybrané soubory a jejich zpracování ve sdíleném toku.</p>';
          return;
        }

        summary.className = 'summary';
        summary.innerHTML = [
          '<strong>Měsíc:</strong> ' + escapeHtml(month),
          '<br /><strong>Počet souborů:</strong> ' + files.length,
          '<ul>' + files.map((file) => '<li><strong>' + escapeHtml(file.name) + '</strong> — ' + file.size + ' B</li>').join('') + '</ul>',
          '<p class="hint">Soubory jsou připravené pro sdílený deterministický vstup do importu, extrakce a měsíčního běhu.</p>',
          '<p class="hint">Po kliknutí na tlačítko se ke sdílenému běhu použijí právě tyto skutečně vybrané soubory.</p>',
          '<p class="hint">Dalším krokem je příprava vstupů, kontrola sekcí, náhled reportu a exportní předání ze stejného výsledku.</p>'
        ].join('');
      }

      async function prepareAndRenderRuntime() {
        renderSummary();

        const files = Array.from(fileInput.files || []);
        if (files.length === 0) {
          return;
        }

        runtimeOutput.hidden = false;
        runtimeOutput.className = 'runtime-panel loading';
  runtimeOutput.innerHTML = '<h3>3. Připravuji sdílený měsíční běh</h3><p class="hint">Načítám skutečně vybrané soubory a převádím je do sdíleného upload kontraktu <code>{ name, content, uploadedAt }</code>, ze kterého vznikne kontrola, report i export.</p>';

        if (!browserRuntime && typeof window.__hotelFinanceCreateBrowserRuntime === 'function') {
          browserRuntime = window.__hotelFinanceCreateBrowserRuntime();
        }

        if (!browserRuntime) {
          runtimeOutput.className = 'runtime-panel error';
          runtimeOutput.innerHTML = [
            '<h3>3. Připravuji sdílený měsíční běh</h3>',
            '<p><strong>Zpracování se nepodařilo dokončit.</strong></p>',
            '<p class="hint">Sdílený browser runtime se ještě načítá. Zkuste akci za okamžik znovu.</p>'
          ].join('');
          return;
        }

        try {
          const state = await browserRuntime.buildRuntimeState({
            files,
            month: monthInput.value,
            generatedAt
          });

          runtimeOutput.className = 'runtime-panel';
          runtimeOutput.innerHTML = renderRuntimeState(state);
          currentExpenseReviewState = state;
          wireRuntimeExpenseReviewLauncher();
        } catch (error) {
          runtimeOutput.className = 'runtime-panel error';
          runtimeOutput.innerHTML = [
            '<h3>3. Připravuji sdílený měsíční běh</h3>',
            '<p><strong>Zpracování se nepodařilo dokončit.</strong></p>',
            '<p class="hint">' + escapeHtml(error instanceof Error ? error.message : String(error)) + '</p>',
            '<p class="hint">Tato stránka zůstává bez backendu. Pokud některý vybraný soubor ještě nemá podporovaný parser, zobrazí se chyba přímo tady.</p>'
          ].join('');
        }
      }

      function renderRuntimeState(state) {
        const payoutCounts = buildRuntimeVisiblePayoutCounts(state);

        return [
          '<h3>3. Výsledek sdíleného měsíčního běhu</h3>',
          '<p class="hint">Tento panel ukazuje jeden skutečný běh nad právě vybranými soubory: příprava, kontrola, náhled reportu i exportní předání. Bez backendu a bez paralelního browserového modelu.</p>',
          '<p><strong>Měsíc:</strong> ' + escapeHtml(state.monthLabel) + '</p>',
          '<p><strong>Run ID:</strong> <code>' + escapeHtml(state.runId) + '</code></p>',
          '<p><strong>Vygenerováno:</strong> ' + escapeHtml(state.generatedAt) + '</p>',
          '<div class="metric-grid">',
          '<div class="metric-tile"><strong>' + state.routingSummary.supportedFileCount + '</strong><br />Rozpoznané soubory</div>',
          '<div class="metric-tile"><strong>' + state.routingSummary.unsupportedFileCount + '</strong><br />Nepodporované soubory</div>',
          '<div class="metric-tile"><strong>' + state.routingSummary.errorFileCount + '</strong><br />Soubory se selháním ingestu</div>',
          '<div class="metric-tile"><strong>' + state.reportSummary.normalizedTransactionCount + '</strong><br />Normalizované transakce</div>',
          '<div class="metric-tile"><strong>' + state.reviewSummary.exceptionCount + '</strong><br />Položky ke kontrole</div>',
          '<div class="metric-tile"><strong>' + state.exportFiles.length + '</strong><br />Připravené exporty</div>',
          '</div>',
          '<div class="runtime-grid">',
          '<section class="runtime-card"><h4>1. Připravené soubory a trasování</h4>' + buildRuntimeFileRouting(state) + '</section>',
          '<section class="runtime-card"><h4>2. Extrakce a příprava</h4><ul class="trace-list">' + state.extractedRecords.map((file) => '<li><strong>' + escapeHtml(file.fileName) + '</strong><br />Extrahováno: ' + file.extractedCount + '<br />' + (file.extractedRecordIds.length > 0 ? '<code>' + escapeHtml(file.extractedRecordIds.join(', ')) + '</code>' : '<span class="hint">Žádné extrahované záznamy.</span>') + '</li>').join('') + '</ul></section>',
          '<section class="runtime-card"><h4>3. Kontrola operátora</h4>' + renderRuntimeReviewSection(state.reviewSections, payoutCounts) + '</section>',
          '<section class="runtime-card"><h4>4. Kontrola výdajů a dokladů</h4>' + buildRuntimeExpenseReviewSummaryMarkup(state.reviewSections) + '</section>',
          '<section class="runtime-card"><h4>5. Náhled reportu</h4>' + renderRuntimeReportSummary(state, payoutCounts) + '</section>',
          '<section class="runtime-card"><h4>6. Vazby na podpůrné doklady</h4>' + renderSupportedExpenseLinks(state.supportedExpenseLinks, state.fileRoutes) + '</section>',
          '<section class="runtime-card"><h4>7. Exportní předání</h4>' + renderRuntimeExportFiles(state.exportFiles) + '</section>',
          '</div>',
          '<p class="hint">Každý krok zůstává navázaný na sdílené výsledky z <code>upload-web</code>, <code>monthly-batch</code>, <code>review</code>, <code>reporting</code> a <code>export</code>.</p>'
        ].join('');
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function buildClassificationBasisLabel(value) {
        if (value === 'content') {
          return 'podle obsahu';
        }

        if (value === 'binary-workbook') {
          return 'podle workbook exportu';
        }

        if (value === 'file-name') {
          return 'podle názvu souboru';
        }

        return 'bez rozpoznání';
      }

      function buildRuntimeFileSourceLabel(sourceSystem, documentType) {
        if (sourceSystem === 'bank') {
          return 'Bankovní výpis';
        }

        if (sourceSystem === 'booking' && documentType === 'payout_statement') {
          return 'Booking payout statement PDF';
        }

        if (sourceSystem === 'booking') {
          return 'Booking payout report';
        }

        if (sourceSystem === 'airbnb') {
          return 'Airbnb payout report';
        }

        if (sourceSystem === 'comgate') {
          return 'Comgate platební report';
        }

        if (sourceSystem === 'expedia') {
          return 'Expedia payout report';
        }

        if (sourceSystem === 'previo') {
          return 'Previo rezervační export';
        }

        if (documentType === 'invoice' || sourceSystem === 'invoice') {
          return 'Dodavatelská faktura';
        }

        if (documentType === 'receipt' || sourceSystem === 'receipt') {
          return 'Výdajový doklad';
        }

        return 'Nepřiřazený vstup';
      }

      function buildRuntimeFileOutcomeLabel(file) {
        if (file.status === 'supported') {
          return file.role === 'supplemental'
            ? 'Podporovaný doplňkový payout dokument'
            : 'Rozpoznaný a zpracovaný zdroj';
        }

        if (file.status === 'error') {
          return 'Selhání ingestu';
        }

        if (file.intakeStatus === 'unsupported') {
          return 'Rozpoznaný, ale nepodporovaný vstup';
        }

        return 'Nerozpoznaný vstup';
      }

      function buildRuntimeFileRouting(state) {
        const fileRoutes = Array.isArray(state.fileRoutes) ? state.fileRoutes : [];

        if (fileRoutes.length === 0) {
          return '<p class="hint">V tomto běhu zatím nejsou žádné připravené ani odmítnuté soubory.</p>';
        }

        return '<ul class="trace-list">' + fileRoutes.map((file) => {
          const statusLine = file.status === 'supported'
            ? escapeHtml(buildRuntimeFileOutcomeLabel(file))
              + ' · ' + escapeHtml(buildRuntimeFileSourceLabel(file.sourceSystem, file.documentType))
            : file.status === 'error'
              ? 'Rozpoznaný vstup se selháním ingestu'
              : file.intakeStatus === 'unsupported'
                ? 'Rozpoznaný, ale nepodporovaný vstup'
                : 'Nerozpoznaný vstup';
          const routingLine = 'Klasifikace: ' + escapeHtml(buildClassificationBasisLabel(file.classificationBasis));
          const identityLine = file.sourceDocumentId
            ? '<br /><code>' + escapeHtml(file.sourceDocumentId) + '</code>'
            : '';
          const extractedLine = file.status === 'supported'
            ? '<br /><span class="hint">Extrahováno: ' + escapeHtml(String(file.extractedCount || 0)) + '</span>'
            : '';
          const reasonLine = file.reason
            ? '<br /><span class="hint">' + escapeHtml(file.reason) + '</span>'
            : '';
          const warningLine = file.warnings && file.warnings.length > 0
            ? '<br /><span class="hint">Varování: ' + escapeHtml(file.warnings.join(' ')) + '</span>'
            : '';

          return '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">' + statusLine + '</span><br /><span class="hint">' + routingLine + '</span>' + identityLine + extractedLine + reasonLine + warningLine + '</li>';
        }).join('') + '</ul>';
      }

      function buildRuntimeVisiblePayoutCounts(state) {
        const matchedFromReview = state.reviewSections && Array.isArray(state.reviewSections.payoutBatchMatched)
          ? state.reviewSections.payoutBatchMatched.length
          : undefined;
        const unmatchedFromReview = state.reviewSections && Array.isArray(state.reviewSections.payoutBatchUnmatched)
          ? state.reviewSections.payoutBatchUnmatched.length
          : undefined;

        return {
          matched: typeof matchedFromReview === 'number'
            ? matchedFromReview
            : Number(state.reportSummary && state.reportSummary.payoutBatchMatchCount ? state.reportSummary.payoutBatchMatchCount : 0),
          unmatched: typeof unmatchedFromReview === 'number'
            ? unmatchedFromReview
            : Number(state.reportSummary && state.reportSummary.unmatchedPayoutBatchCount ? state.reportSummary.unmatchedPayoutBatchCount : 0)
        };
      }

      function renderRuntimeReviewSection(sections, payoutCounts) {
        const groups = [
          { label: 'Spárované', items: sections.matched },
          { label: 'Nespárované rezervace k úhradě', items: sections.unmatchedReservationSettlements },
          { label: 'Spárované payout dávky', items: sections.payoutBatchMatched, count: payoutCounts.matched },
          { label: 'Nespárované payout dávky', items: sections.payoutBatchUnmatched, count: payoutCounts.unmatched },
          { label: 'Nespárované', items: sections.unmatched },
          { label: 'Podezřelé', items: sections.suspicious },
          { label: 'Chybějící doklady', items: sections.missingDocuments }
        ];

        return '<ul class="review-list">' + groups.map((group) => {
          const count = typeof group.count === 'number' ? group.count : group.items.length;
          return '<li><strong>' + escapeHtml(group.label) + ':</strong> ' + count
            + (group.items[0]
              ? buildRuntimeReviewItemMarkup(group.items[0])
              : '<br /><span class="hint">Bez položek.</span>')
            + '</li>';
        }).join('') + '</ul>';
      }

      function buildRuntimeExpenseReviewBuckets(sections) {
        const normalizedSections = sections || {};

        return [
          { label: 'Spárované výdaje', items: Array.isArray(normalizedSections.expenseMatched) ? normalizedSections.expenseMatched : [], emptyLabel: 'Žádné spárované výdaje.' },
          { label: 'Výdaje ke kontrole', items: Array.isArray(normalizedSections.expenseNeedsReview) ? normalizedSections.expenseNeedsReview : [], emptyLabel: 'Žádné výdaje ke kontrole.' },
          { label: 'Nespárované doklady', items: Array.isArray(normalizedSections.expenseUnmatchedDocuments) ? normalizedSections.expenseUnmatchedDocuments : [], emptyLabel: 'Žádné nespárované doklady.' },
          { label: 'Nespárované odchozí platby', items: Array.isArray(normalizedSections.expenseUnmatchedOutflows) ? normalizedSections.expenseUnmatchedOutflows : [], emptyLabel: 'Žádné nespárované odchozí platby.' }
        ];
      }

      function buildRuntimeExpenseReviewSummaryMarkup(sections) {
        const groups = buildRuntimeExpenseReviewBuckets(sections);

        return [
          '<p class="hint">Detailní kontrola dokladů a odchozích plateb se otevírá do samostatného tabu, aby hlavní stránka zůstala přehledná.</p>',
          '<ul>',
          groups.map((group) => '<li><strong>' + escapeHtml(group.label) + ':</strong> ' + escapeHtml(String(group.items.length)) + '</li>').join(''),
          '</ul>',
          '<p><button id="open-expense-review-button" type="button">Kontrola výdajů a dokladů</button></p>',
          '<p class="hint">Otevře samostatnou stránku s porovnáním Doklad / Stav a důkazy / Banka.</p>'
        ].join('');
      }

      function renderRuntimeExpenseReviewSection(sections) {
        const groups = buildRuntimeExpenseReviewBuckets(sections);

        return groups.map((group) => buildRuntimeExpenseReviewGroupMarkup(group.label, group.items)).join('');
      }

      function buildRuntimeExpenseReviewGroupMarkup(label, items) {
        const body = !items || items.length === 0
          ? '<p class="hint">Žádné položky v této sekci.</p>'
          : items.map((item) => buildRuntimeExpenseReviewItemMarkup(item)).join('');

        return '<div class="expense-review-group"><h5>' + escapeHtml(label) + ' (' + escapeHtml(String(items ? items.length : 0)) + ')</h5>' + body + '</div>';
      }

      function buildRuntimeExpenseReviewItemMarkup(item) {
        const comparison = item && item.expenseComparison ? item.expenseComparison : {};
        const statusClass = buildRuntimeMatchStrengthClass(item && item.matchStrength);

        return [
          '<article class="expense-item">',
          '<strong>' + escapeHtml(String((item && item.title) || 'Výdaj')) + '</strong>',
          '<div class="expense-comparison">',
          buildRuntimeExpenseSideMarkup('Doklad', comparison.document, true),
          '<div class="expense-status">',
          '<h6>Stav a důkazy</h6>',
          '<span class="status-badge ' + escapeHtml(statusClass) + '">' + escapeHtml(String((item && item.matchStrength) || 'neuvedeno')) + '</span>',
          item && item.operatorExplanation ? '<div class="hint"><strong>Vyhodnocení:</strong> ' + escapeHtml(String(item.operatorExplanation)) + '</div>' : '',
          buildRuntimeExpenseEvidenceListMarkup(item),
          item && item.documentBankRelation ? '<div class="hint"><strong>Doklad ↔ banka:</strong> ' + escapeHtml(String(item.documentBankRelation)) + '</div>' : '',
          item && item.operatorCheckHint ? '<div class="hint"><strong>Ruční kontrola:</strong> ' + escapeHtml(String(item.operatorCheckHint)) + '</div>' : '',
          '</div>',
          buildRuntimeExpenseSideMarkup('Banka', comparison.bank, false),
          '</div>',
          '</article>'
        ].join('');
      }

      function buildRuntimeExpenseReviewStandalonePageMarkup(state) {
        const normalizedState = state || { monthLabel: 'neuvedeno', runId: 'bez runtime běhu', reviewSections: {} };
        const groups = buildRuntimeExpenseReviewBuckets(normalizedState.reviewSections);
        const sectionsMarkup = groups.map((group) => [
          '<section class="expense-page-bucket">',
          '<div class="expense-page-bucket-header">',
          '<h2>' + escapeHtml(group.label) + '</h2>',
          '<span class="expense-page-count">' + escapeHtml(String(group.items.length)) + '</span>',
          '</div>',
          (!group.items || group.items.length === 0
            ? '<p class="hint">' + escapeHtml(group.emptyLabel) + '</p>'
            : group.items.map((item) => buildRuntimeExpenseReviewItemMarkup(item)).join('')),
          '</section>'
        ].join('')).join('');

        return [
          '<!doctype html>',
          '<html lang="cs">',
          '<head>',
          '<meta charset="utf-8" />',
          '<meta name="viewport" content="width=device-width, initial-scale=1" />',
          '<title>Hotel Finance Control – Kontrola výdajů a dokladů</title>',
          '<style>',
          ':root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
          'body { margin: 0; padding: 28px; background: #eef3f9; color: #142033; }',
          'main { max-width: 1560px; margin: 0 auto; }',
          '.expense-page-hero, .expense-page-bucket { background: #ffffff; border-radius: 20px; padding: 24px; box-shadow: 0 12px 36px rgba(20, 32, 51, 0.08); margin-bottom: 18px; }',
          '.expense-page-bucket-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }',
          '.expense-page-bucket-header h2 { margin: 0; font-size: 22px; }',
          '.expense-page-count { display: inline-block; min-width: 38px; text-align: center; border-radius: 999px; padding: 6px 12px; background: #eaf2ff; color: #174ea6; font-weight: 700; }',
          '.expense-item { border: 1px solid #dce6f5; border-radius: 16px; background: #fbfdff; padding: 18px; margin-bottom: 14px; }',
          '.expense-item strong { font-size: 17px; line-height: 1.4; display: block; margin-bottom: 12px; }',
          '.expense-comparison { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(300px, 360px) minmax(280px, 1fr); gap: 18px; align-items: start; }',
          '.expense-side, .expense-status { border-radius: 14px; background: #f6f9fc; padding: 16px; overflow-wrap: anywhere; word-break: break-word; }',
          '.expense-side h6, .expense-status h6 { margin: 0 0 10px; font-size: 14px; }',
          '.expense-side ul, .expense-status ul { margin: 0; padding-left: 20px; }',
          '.expense-side li, .expense-status li { margin-bottom: 6px; }',
          '.hint { color: #52627a; line-height: 1.5; }',
          '.status-badge { display: inline-block; border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 700; margin-bottom: 10px; }',
          '.status-badge.confirmed { background: #e7f6ec; color: #0f7a32; }',
          '.status-badge.weak { background: #fff4dd; color: #946200; }',
          '.status-badge.review { background: #fff4dd; color: #946200; }',
          '.status-badge.unmatched { background: #ffe3e8; color: #b42318; }',
          '@media (max-width: 1080px) { .expense-comparison { grid-template-columns: 1fr; } body { padding: 18px; } }',
          '</style>',
          '</head>',
          '<body>',
          '<main>',
          '<section class="expense-page-hero">',
          '<h1>Kontrola výdajů a dokladů</h1>',
          '<p><strong>Měsíc:</strong> ' + escapeHtml(normalizedState.monthLabel || 'neuvedeno') + '</p>',
          '<p><strong>Run ID:</strong> <code>' + escapeHtml(normalizedState.runId || 'bez runtime běhu') + '</code></p>',
          '<p class="hint">Tato stránka ukazuje pouze doklady, kandidátní odchozí bankovní platby a jejich důkazy. Payout matching zůstává na hlavním přehledu.</p>',
          '</section>',
          sectionsMarkup,
          '</main>',
          '</body>',
          '</html>'
        ].join('');
      }

      function wireRuntimeExpenseReviewLauncher() {
        const expenseReviewButton = document.getElementById('open-expense-review-button');

        if (!expenseReviewButton) {
          return;
        }

        expenseReviewButton.addEventListener('click', () => {
          const popup = typeof window.open === 'function'
            ? window.open('', '_blank', 'noopener,noreferrer')
            : null;

          if (!popup || !popup.document) {
            return;
          }

          popup.document.open();
          popup.document.write(buildRuntimeExpenseReviewStandalonePageMarkup(currentExpenseReviewState));
          popup.document.close();
        });
      }

      function buildRuntimeExpenseSideMarkup(title, side, isDocument) {
        const fields = isDocument
          ? [
              ['Dodavatel', side && side.supplierOrCounterparty],
              ['Číslo faktury / reference', side && side.reference],
              ['Datum vystavení', side && side.issueDate],
              ['Datum splatnosti', side && side.dueDate],
              ['Částka', side && side.amount],
              ['Měna', side && side.currency],
              ['IBAN hint', side && side.ibanHint]
            ]
          : [
              ['Datum pohybu', side && side.bookedAt],
              ['Částka', side && side.amount],
              ['Měna', side && side.currency],
              ['Protistrana / název účtu', side && side.supplierOrCounterparty],
              ['Reference / zpráva / VS', side && side.reference],
              ['Bankovní účet', side && side.bankAccount]
            ];
        const visibleFields = fields.filter((entry) => Boolean(entry[1]));

        return '<div class="expense-side"><h6>' + escapeHtml(title) + '</h6>'
          + (visibleFields.length === 0
            ? '<p class="hint">' + escapeHtml(isDocument ? 'Zatím bez načteného dokladu.' : 'Zatím bez kandidátního bankovního pohybu.') + '</p>'
            : '<ul>' + visibleFields.map((entry) =>
              '<li><strong>' + escapeHtml(String(entry[0])) + ':</strong> ' + escapeHtml(String(entry[1])) + '</li>'
            ).join('') + '</ul>')
          + '</div>';
      }

      function buildRuntimeExpenseEvidenceListMarkup(item) {
        const evidence = item && Array.isArray(item.evidenceSummary) ? item.evidenceSummary : [];

        if (evidence.length === 0) {
          return '<p class="hint">Bez doplňujících důkazů.</p>';
        }

        return '<ul>' + evidence.map((entry) =>
          '<li><strong>' + escapeHtml(String(entry.label || '')) + ':</strong> ' + escapeHtml(String(entry.value || '')) + '</li>'
        ).join('') + '</ul>';
      }

      function buildRuntimeMatchStrengthClass(matchStrength) {
        if (matchStrength === 'potvrzená shoda') {
          return 'confirmed';
        }

        if (matchStrength === 'slabší shoda') {
          return 'weak';
        }

        if (matchStrength === 'vyžaduje kontrolu') {
          return 'review';
        }

        return 'unmatched';
      }

      function buildRuntimeReviewItemMarkup(item) {
        const evidence = Array.isArray(item.evidenceSummary) && item.evidenceSummary.length > 0
          ? item.evidenceSummary.map((entry) => String(entry.label || '') + ': ' + String(entry.value || '')).join(' · ')
          : '';
        const explanation = item.operatorExplanation ? String(item.operatorExplanation) : '';
        const checkHint = item.operatorCheckHint ? String(item.operatorCheckHint) : '';
        const documentRelation = item.documentBankRelation ? String(item.documentBankRelation) : '';

        return [
          '<br /><span class="hint"><strong>' + escapeHtml(String(item.title || 'Položka')) + '</strong> · ' + escapeHtml(String(item.matchStrength || item.kind || 'stav neuveden')) + '</span>',
          explanation ? '<br /><span class="hint"><strong>Vyhodnocení:</strong> ' + escapeHtml(explanation) + '</span>' : '',
          evidence ? '<br /><span class="hint"><strong>Důkazy:</strong> ' + escapeHtml(evidence) + '</span>' : '',
          documentRelation ? '<br /><span class="hint"><strong>Doklad ↔ banka:</strong> ' + escapeHtml(documentRelation) + '</span>' : '',
          checkHint ? '<br /><span class="hint"><strong>Ruční kontrola:</strong> ' + escapeHtml(checkHint) + '</span>' : ''
        ].join('');
      }

      function renderRuntimeReportSummary(state, payoutCounts) {
        return [
          '<div class="metric-grid">',
          '<div class="metric-tile"><strong>' + state.reportSummary.matchedGroupCount + '</strong><br />Spárované skupiny</div>',
          '<div class="metric-tile"><strong>' + payoutCounts.matched + '</strong><br />Spárované payout dávky</div>',
          '<div class="metric-tile"><strong>' + payoutCounts.unmatched + '</strong><br />Nespárované payout dávky</div>',
          '<div class="metric-tile"><strong>' + state.reportSummary.unmatchedExpectedCount + '</strong><br />Nespárované očekávané</div>',
          '<div class="metric-tile"><strong>' + state.reportSummary.unmatchedActualCount + '</strong><br />Nespárované skutečné</div>',
          '</div>',
          '<ul class="report-list">',
          '<li><strong>Souhrn kontroly:</strong> ' + state.reviewSummary.exceptionCount + ' položek ke kontrole ve sdíleném reportu.</li>',
          '<li><strong>Praktická čitelnost:</strong> částky jsou v operátorském náhledu zobrazené jako české koruny tam, kde jsou přímo relevantní.</li>',
          '</ul>'
        ].join('');
      }

      function renderSupportedExpenseLinks(links, fileRoutes) {
        const documentRoutes = Array.isArray(fileRoutes)
          ? fileRoutes.filter((file) =>
            file.status === 'supported'
            && (file.documentType === 'invoice' || file.documentType === 'receipt')
          )
          : [];
        const linkedDocumentIds = new Set((links || []).flatMap((link) => link.supportSourceDocumentIds || []));
        const unresolvedDocuments = documentRoutes.filter((file) => file.sourceDocumentId && !linkedDocumentIds.has(file.sourceDocumentId));

        const confirmedMarkup = !links || links.length === 0
          ? '<p class="hint">V tomto běhu se neobjevily žádné potvrzené vazby mezi bankovním výdajem a fakturou nebo účtenkou.</p>'
          : '<ul class="link-list">' + links.map((link) =>
            '<li><strong>potvrzená shoda</strong> · <code>' + escapeHtml(link.expenseTransactionId) + '</code> → <code>' + escapeHtml(link.supportTransactionId) + '</code>'
              + '<br /><span class="hint"><strong>Důkazy:</strong> ' + escapeHtml(localizeSupportReasons(link.reasons || []).join(' · ')) + '</span>'
              + '<br /><span class="hint"><strong>Doklad ↔ banka:</strong> potvrzená pravděpodobná vazba doklad–banka</span>'
              + '<br /><span class="hint"><strong>Ruční kontrola:</strong> Zkontrolujte ručně jen při sporné částce nebo protiúčtu.</span>'
              + '<br /><span class="hint">Zdrojové dokumenty: ' + (link.supportSourceDocumentIds.length > 0 ? '<code>' + escapeHtml(link.supportSourceDocumentIds.join(', ')) + '</code>' : 'neuvedeno') + '</span>'
              + '</li>'
          ).join('') + '</ul>';
        const unresolvedMarkup = unresolvedDocuments.length === 0
          ? '<p class="hint">Žádný načtený doklad nezůstal bez potvrzené bankovní vazby.</p>'
          : '<h5>Načtené doklady bez potvrzené bankovní vazby</h5><ul class="link-list">' + unresolvedDocuments.map((file) =>
            '<li><strong>' + escapeHtml(file.fileName) + '</strong>'
              + '<br /><span class="hint"><strong>Stav:</strong> vyžaduje kontrolu</span>'
              + '<br /><span class="hint"><strong>Doklad ↔ banka:</strong> pouze načtený doklad, bez potvrzené bankovní vazby</span>'
              + '<br /><span class="hint"><strong>Ruční kontrola:</strong> Zkontrolujte ručně, zda dokument odpovídá některému bankovnímu výdaji.</span>'
              + '</li>'
          ).join('') + '</ul>';

        return confirmedMarkup + unresolvedMarkup;
      }

      function localizeSupportReasons(reasons) {
        return (reasons || []).map((reason) => {
          if (String(reason).startsWith('amountExact:')) {
            return 'částka sedí'
          }

          if (String(reason).startsWith('dateDistance:')) {
            return 'datum je v toleranci'
          }

          if (reason === 'counterpartyAligned') {
            return 'protistrana odpovídá'
          }

          if (reason === 'referenceAligned') {
            return 'reference odpovídá'
          }

          if (String(reason).startsWith('currency:')) {
            return 'měna sedí'
          }

          return String(reason)
        });
      }

      function renderRuntimeExportFiles(files) {
        if (files.length === 0) {
          return '<p class="hint">Pro tento běh zatím nevznikly žádné exporty.</p>';
        }

        return '<ul class="export-list">' + files.map((file) =>
          '<li><strong>' + escapeHtml(file.labelCs) + '</strong><br /><code>' + escapeHtml(file.fileName) + '</code></li>'
        ).join('') + '</ul>';
      }

      button.addEventListener('click', () => {
        void prepareAndRenderRuntime();
      });
      fileInput.addEventListener('change', renderSummary);
      monthInput.addEventListener('change', renderSummary);
      renderSummary();
    </script>
  </body>
</html>
`
}

function buildBrowserRuntimeRunId(month?: string): string {
  const suffix = month && month.trim() ? month.trim() : 'local'
  return `browser-runtime-upload-${suffix}`
}

function deriveMonthLabel(runId: string): string {
  const prefix = 'browser-runtime-upload-'
  if (!runId.startsWith(prefix)) {
    return 'neuvedeno'
  }

  const suffix = runId.slice(prefix.length)
  return suffix === 'local' ? 'neuvedeno' : suffix
}

export function buildUploadedBatchPreview(input: BuildUploadedBatchPreviewInput): UploadedBatchPreviewResult {
  const ingestion = ingestUploadedMonthlyFiles({
    files: input.files,
    reconciliationContext: {
      runId: input.runId,
      requestedAt: input.generatedAt
    },
    reportGeneratedAt: input.generatedAt
  })
  const batch = ingestion.batch
  const review = buildReviewScreen({
    batch,
    generatedAt: input.generatedAt,
    fileRoutes: ingestion.fileRoutes
  })

  return {
    importedFiles: ingestion.importedFiles,
    fileRoutes: ingestion.fileRoutes,
    batch,
    review
  }
}

export function buildBrowserReviewScreen(
  options: BuildBrowserReviewScreenOptions
): BrowserReviewScreenResult {
  const preview = buildUploadedBatchPreview(options)
  const html = renderBrowserReviewScreenHtml(preview)

  if (options.outputPath) {
    const resolved = resolve(options.outputPath)
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, html, 'utf8')

    return {
      html,
      preview,
      outputPath: resolved
    }
  }

  return {
    html,
    preview
  }
}

export function buildBrowserExportPackage(
  options: BuildBrowserExportPackageOptions
): BrowserExportPackageResult {
  const run = buildUploadedMonthlyRun(options)

  return {
    preview: {
      importedFiles: run.importedFiles,
      fileRoutes: run.fileRoutes,
      batch: run.batch,
      review: run.review
    },
    exports: run.exports
  }
}

export function buildUploadedMonthlyRun(
  options: BuildBrowserExportPackageOptions
): UploadedMonthlyRunResult {
  const preview = buildUploadedBatchPreview(options)
  const exports = buildExportArtifacts({
    batch: preview.batch,
    review: preview.review,
    outputDir: options.outputDir
  })

  return {
    ...preview,
    report: preview.batch.report,
    exports
  }
}

export function buildBrowserUploadedMonthlyRun(
  options: BuildUploadedMonthlyRunOptions
): BrowserUploadedMonthlyRunResult {
  const run = buildUploadedMonthlyRun(options)
  const html = renderBrowserUploadedMonthlyRunHtml(run)

  if (options.outputPath) {
    const resolved = resolve(options.outputPath)
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, html, 'utf8')

    return {
      html,
      run,
      outputPath: resolved
    }
  }

  return {
    html,
    run
  }
}

export function placeholder() {
  return {
    name: 'upload-web',
    mode: 'local-static',
    buildUploadWebFlow,
    buildUploadedBatchPreview,
    buildBrowserReviewScreen,
    buildBrowserExportPackage,
    buildUploadedMonthlyRun,
    buildBrowserUploadedMonthlyRun
  }
}

function renderBrowserUploadedMonthlyRunHtml(run: UploadedMonthlyRunResult): string {
  const payoutBatchMatchedCount = run.review.payoutBatchMatched.length
  const payoutBatchUnmatchedCount = run.review.payoutBatchUnmatched.length
  const supportedFileCount = run.fileRoutes.filter((file) => file.status === 'supported').length
  const unsupportedFileCount = run.fileRoutes.filter((file) => file.status === 'unsupported').length
  const errorFileCount = run.fileRoutes.filter((file) => file.status === 'error').length

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hotel Finance Control – Měsíční běh z nahraných souborů</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
        background: #edf3fb;
        color: #142033;
      }
      main {
        max-width: 1240px;
        margin: 0 auto;
      }
      .hero, .card {
        background: white;
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 10px 35px rgba(20, 32, 51, 0.08);
        margin-bottom: 20px;
      }
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #eaf2ff;
        color: #174ea6;
        font-size: 12px;
        font-weight: 700;
      }
      .summary-grid, .trace-grid, .section-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .metric, .trace-card, .section-panel {
        background: #f7f9fc;
        border-radius: 14px;
        padding: 16px;
      }
      .section-panel ul,
      .trace-card ul {
        padding-left: 20px;
      }
      .section-panel h3,
      .trace-card h3 {
        margin-top: 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid #e6edf8;
        vertical-align: top;
      }
      code {
        background: #f1f4f8;
        padding: 2px 6px;
        border-radius: 6px;
      }
      .hint {
        color: #52627a;
      }
      .badge {
        display: inline-block;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 700;
        margin-left: 8px;
      }
      .badge.matched { background: #e7f6ec; color: #0f7a32; }
      .badge.unmatched { background: #fff4dd; color: #946200; }
      .badge.suspicious { background: #ffe3e8; color: #b42318; }
      .badge.missing { background: #ede9fe; color: #6d28d9; }
      .expense-item {
        border: 1px solid #e4ebf6;
        border-radius: 12px;
        background: #fbfdff;
        padding: 12px;
        margin-bottom: 10px;
      }
      .expense-comparison {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(180px, 220px) minmax(0, 1fr);
        gap: 12px;
      }
      .expense-side,
      .expense-status {
        border-radius: 10px;
        background: #f7f9fc;
        padding: 10px 12px;
      }
      .expense-side h6,
      .expense-status h6 {
        margin: 0 0 8px;
        font-size: 13px;
      }
      .expense-side ul,
      .expense-status ul {
        margin: 0;
        padding-left: 18px;
      }
      .status-badge {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .status-badge.confirmed { background: #e7f6ec; color: #0f7a32; }
      .status-badge.weak { background: #fff4dd; color: #946200; }
      .status-badge.review { background: #fff4dd; color: #946200; }
      .status-badge.unmatched { background: #ffe3e8; color: #b42318; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="pill">Měsíční běh z uploadu</span>
        <h1>Výsledek měsíčního zpracování z nahraných souborů</h1>
  <p>Tato stránka ukazuje jeden skutečný deterministický běh nad nahranými soubory: přípravu vstupů, extrakci, normalizaci, párování, výjimky, kontrolu i exporty ze stejného sdíleného postupu.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(run.review.generatedAt)}</p>
      </section>

      <section class="card">
        <h2>Souhrn běhu</h2>
        <div class="summary-grid">
          <div class="metric"><strong>${run.batch.reconciliation.summary.normalizedTransactionCount}</strong><br />Normalizované transakce</div>
          <div class="metric"><strong>${run.batch.reconciliation.summary.matchedGroupCount}</strong><br />Spárované skupiny</div>
          <div class="metric"><strong>${run.batch.reconciliation.summary.exceptionCount}</strong><br />Položky ke kontrole</div>
          <div class="metric"><strong>${payoutBatchMatchedCount}</strong><br />Spárované Airbnb / OTA payout dávky</div>
          <div class="metric"><strong>${payoutBatchUnmatchedCount}</strong><br />Nespárované payout dávky</div>
          <div class="metric"><strong>${supportedFileCount}</strong><br />Rozpoznané soubory</div>
          <div class="metric"><strong>${unsupportedFileCount}</strong><br />Nepodporované soubory</div>
          <div class="metric"><strong>${errorFileCount}</strong><br />Soubory se selháním ingestu</div>
          <div class="metric"><strong>${run.fileRoutes.length}</strong><br />Nahrané soubory</div>
          <div class="metric"><strong>${run.report.transactions.length}</strong><br />Řádků v reportu</div>
          <div class="metric"><strong>${run.exports.files.length}</strong><br />Připravené exporty</div>
        </div>
      </section>

      <section class="card">
  <h2>Trasování nahraných souborů</h2>
        <div class="trace-grid">
          ${run.fileRoutes.map((file) => `
            <article class="trace-card">
              <h3>${escapeHtml(file.fileName)}</h3>
              <p><strong>Stav:</strong> ${escapeHtml(buildUploadedFileOutcomeLabel(file))}</p>
              <p><strong>Zdroj:</strong> ${escapeHtml(buildUploadedFileSourceLabel(file))}</p>
              <p><strong>Klasifikace:</strong> ${escapeHtml(buildUploadedFileClassificationLabel(file.classificationBasis))}</p>
              ${file.sourceDocumentId ? `<p><strong>ID zdrojového dokumentu:</strong> <code>${escapeHtml(file.sourceDocumentId)}</code></p>` : ''}
              ${file.sourceDocumentId ? `<p><strong>Extrahované záznamy:</strong> ${escapeHtml(String(file.extractedCount ?? findBatchFileExtractedCount(run.batch, file.sourceDocumentId)))}</p>` : ''}
              ${file.reason ? `<p class="hint">${escapeHtml(file.reason)}</p>` : ''}
              ${file.warnings.length > 0 ? `<p class="hint">Varování: ${escapeHtml(file.warnings.join(' '))}</p>` : ''}
            </article>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <h2>Kontrolní sekce</h2>
        <div class="section-grid">
          ${renderReviewSection('Spárované položky', 'matched', run.review.matched)}
          ${renderReviewSection('Spárované Airbnb / OTA payout dávky', 'matched', run.review.payoutBatchMatched)}
          ${renderReviewSection('Nespárované položky', 'unmatched', run.review.unmatched)}
          ${renderReviewSection('Nespárované payout dávky', 'unmatched', run.review.payoutBatchUnmatched)}
          ${renderReviewSection('Podezřelé položky', 'suspicious', run.review.suspicious)}
          ${renderReviewSection('Chybějící doklady', 'missing', run.review.missingDocuments)}
        </div>
      </section>

      <section class="card">
        <h2>Kontrola výdajů a dokladů</h2>
        ${renderExpenseReviewSectionHtml(run.review)}
      </section>

      <section class="card">
        <h2>Přehled reportu</h2>
        <table>
          <thead>
            <tr>
              <th>Transakce</th>
              <th>Zdroj</th>
              <th>Směr</th>
              <th>Částka</th>
              <th>Stav</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            ${run.report.transactions.map((transaction) => `
              <tr>
                <td><code>${escapeHtml(transaction.transactionId)}</code></td>
                <td>${escapeHtml(transaction.source)}</td>
                <td>${escapeHtml(transaction.direction)}</td>
                <td>${escapeHtml(formatAmountMinorCs(transaction.amountMinor, transaction.currency))}</td>
                <td>${escapeHtml(transaction.status)}</td>
                <td>${escapeHtml(transaction.reference ?? '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Exporty připravené ke stažení</h2>
        <ul>
          ${run.exports.files.map((file) => `<li><strong>${escapeHtml(file.labelCs)}</strong> — <code>${escapeHtml(file.fileName)}</code>${file.outputPath ? ` — ${escapeHtml(file.outputPath)}` : ''}</li>`).join('')}
        </ul>
  <p class="hint">Exporty vznikají ze stejného sdíleného výsledku měsíčního běhu, bez paralelního modelu nebo serverové vrstvy.</p>
      </section>
    </main>
  </body>
</html>
`
}

function buildUploadedFileClassificationLabel(value: UploadedMonthlyFileRoute['classificationBasis']): string {
  switch (value) {
    case 'content':
      return 'podle obsahu'
    case 'binary-workbook':
      return 'podle workbook exportu'
    case 'file-name':
      return 'podle názvu souboru'
    default:
      return 'bez rozpoznání'
  }
}

function buildUploadedFileSourceLabel(file: UploadedMonthlyFileRoute): string {
  if (file.sourceSystem === 'bank') {
    return 'Bankovní výpis'
  }

  if (file.sourceSystem === 'booking' && file.documentType === 'payout_statement') {
    return 'Booking payout statement PDF'
  }

  if (file.sourceSystem === 'booking') {
    return 'Booking payout report'
  }

  if (file.sourceSystem === 'airbnb') {
    return 'Airbnb payout report'
  }

  if (file.sourceSystem === 'comgate') {
    return 'Comgate platební report'
  }

  if (file.sourceSystem === 'expedia') {
    return 'Expedia payout report'
  }

  if (file.sourceSystem === 'previo') {
    return 'Previo rezervační export'
  }

  if (file.documentType === 'invoice' || file.sourceSystem === 'invoice') {
    return 'Dodavatelská faktura'
  }

  if (file.documentType === 'receipt' || file.sourceSystem === 'receipt') {
    return 'Výdajový doklad'
  }

  return 'Nepřiřazený vstup'
}

function buildUploadedFileOutcomeLabel(file: UploadedMonthlyFileRoute): string {
  if (file.status === 'supported') {
    return file.role === 'supplemental'
      ? 'Podporovaný doplňkový payout dokument'
      : 'Rozpoznaný a zpracovaný zdroj'
  }

  if (file.status === 'error') {
    return 'Selhání ingestu'
  }

  if (file.intakeStatus === 'unsupported') {
    return 'Rozpoznaný, ale nepodporovaný vstup'
  }

  return 'Nerozpoznaný vstup'
}

function findBatchFileExtractedCount(batch: MonthlyBatchResult, sourceDocumentId: string): number {
  return batch.files.find((file) => file.sourceDocumentId === sourceDocumentId)?.extractedCount ?? 0
}

function findBatchFileExtractedIds(batch: MonthlyBatchResult, sourceDocumentId: string): string[] {
  return batch.files.find((file) => file.sourceDocumentId === sourceDocumentId)?.extractedRecordIds ?? []
}

function renderBrowserReviewScreenHtml(preview: UploadedBatchPreviewResult): string {
  const { review, batch } = preview

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hotel Finance Control – Kontrola měsíce</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
        background: #eef3fb;
        color: #142033;
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
      }
      .hero, .card {
        background: white;
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 10px 35px rgba(20, 32, 51, 0.08);
        margin-bottom: 20px;
      }
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #eaf2ff;
        color: #174ea6;
        font-size: 12px;
        font-weight: 700;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
      }
      .metric {
        padding: 16px;
        background: #f7f9fc;
        border-radius: 14px;
      }
      .section-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .section-panel {
        border: 1px solid #e4ebf6;
        border-radius: 14px;
        padding: 16px;
        background: #fbfdff;
      }
      .section-panel h3 {
        margin-top: 0;
      }
      ul {
        padding-left: 20px;
      }
      .empty {
        color: #6a7891;
      }
      .badge {
        display: inline-block;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 700;
        margin-left: 8px;
      }
      .badge.matched { background: #e7f6ec; color: #0f7a32; }
      .badge.unmatched { background: #fff4dd; color: #946200; }
      .badge.suspicious { background: #ffe3e8; color: #b42318; }
      .badge.missing { background: #ede9fe; color: #6d28d9; }
      .expense-item {
        border: 1px solid #e4ebf6;
        border-radius: 12px;
        background: #fbfdff;
        padding: 12px;
        margin-bottom: 10px;
      }
      .expense-comparison {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(180px, 220px) minmax(0, 1fr);
        gap: 12px;
      }
      .expense-side,
      .expense-status {
        border-radius: 10px;
        background: #f7f9fc;
        padding: 10px 12px;
      }
      .expense-side h6,
      .expense-status h6 {
        margin: 0 0 8px;
        font-size: 13px;
      }
      .expense-side ul,
      .expense-status ul {
        margin: 0;
        padding-left: 18px;
      }
      .status-badge {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .status-badge.confirmed { background: #e7f6ec; color: #0f7a32; }
      .status-badge.weak { background: #fff4dd; color: #946200; }
      .status-badge.review { background: #fff4dd; color: #946200; }
      .status-badge.unmatched { background: #ffe3e8; color: #b42318; }
      code {
        background: #f1f4f8;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <span class="pill">Kontrola měsíce</span>
        <h1>První kontrolní obrazovka měsíčního zpracování</h1>
  <p>Tato lokální obrazovka zobrazuje stejné sdílené výsledky z nahrání, extrakce, párování a kontrolního workflow bez serverové vrstvy a bez paralelního modelu.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(review.generatedAt)}</p>
      </section>

      <section class="card">
        <h2>Souhrn měsíce</h2>
        <div class="summary-grid">
          <div class="metric"><strong>${review.summary.normalizedTransactionCount}</strong><br />Normalizované transakce</div>
          <div class="metric"><strong>${review.summary.matchedGroupCount}</strong><br />Spárované skupiny</div>
          <div class="metric"><strong>${review.summary.unmatchedPayoutBatchCount ?? 0}</strong><br />Nespárované payout dávky</div>
          <div class="metric"><strong>${review.summary.exceptionCount}</strong><br />Položky ke kontrole</div>
          <div class="metric"><strong>${batch.files.length}</strong><br />Zpracované soubory</div>
        </div>
      </section>

      <section class="card">
        <h2>Přehled kontrolních sekcí</h2>
        <div class="section-grid">
          ${renderReviewSection('Spárované položky', 'matched', review.matched)}
          ${renderReviewSection('Nespárované rezervace k úhradě', 'unmatched', review.unmatchedReservationSettlements)}
          ${renderReviewSection('Nespárované payout dávky', 'unmatched', review.payoutBatchUnmatched)}
          ${renderReviewSection('Nespárované položky', 'unmatched', review.unmatched)}
          ${renderReviewSection('Podezřelé položky', 'suspicious', review.suspicious)}
          ${renderReviewSection('Chybějící doklady', 'missing', review.missingDocuments)}
        </div>
      </section>

      <section class="card">
        <h2>Kontrola výdajů a dokladů</h2>
        ${renderExpenseReviewSectionHtml(review)}
      </section>

      <section class="card">
  <h2>Trasování souborů</h2>
        <ul>
          ${batch.files.map((file) => `<li><strong>${escapeHtml(file.sourceDocumentId)}</strong> — ${file.extractedCount} extrahovaných záznamů</li>`).join('')}
        </ul>
      </section>
    </main>
  </body>
</html>
`
}

function renderReviewSection(
  title: string,
  badgeClass: 'matched' | 'unmatched' | 'suspicious' | 'missing',
  items: ReviewScreenData['matched']
): string {
  const body = items.length === 0
    ? '<p class="empty">Žádné položky v této sekci.</p>'
    : `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span class="badge ${badgeClass}">${escapeHtml(item.matchStrength)}</span><br />${escapeHtml(item.detail)}${renderStaticReviewAuditMarkup(item)}${item.transactionIds.length > 0 ? `<br /><code>${escapeHtml(item.transactionIds.join(', '))}</code>` : ''}</li>`).join('')}</ul>`

  return `<section class="section-panel"><h3>${escapeHtml(title)}</h3>${body}</section>`
}

function renderStaticReviewAuditMarkup(item: ReviewScreenData['matched'][number]): string {
  const evidence = item.evidenceSummary.length > 0
    ? item.evidenceSummary.map((entry) => `${entry.label}: ${entry.value}`).join(' · ')
    : ''

  return [
    item.operatorExplanation ? `<br /><span class="empty"><strong>Vyhodnocení:</strong> ${escapeHtml(item.operatorExplanation)}</span>` : '',
    evidence ? `<br /><span class="empty"><strong>Důkazy:</strong> ${escapeHtml(evidence)}</span>` : '',
    item.documentBankRelation ? `<br /><span class="empty"><strong>Doklad ↔ banka:</strong> ${escapeHtml(item.documentBankRelation)}</span>` : '',
    item.operatorCheckHint ? `<br /><span class="empty"><strong>Ruční kontrola:</strong> ${escapeHtml(item.operatorCheckHint)}</span>` : ''
  ].join('')
}

function renderExpenseReviewSectionHtml(review: Pick<ReviewScreenData, 'expenseMatched' | 'expenseNeedsReview' | 'expenseUnmatchedDocuments' | 'expenseUnmatchedOutflows'>): string {
  const groups: Array<{ title: string; items: ReviewSectionItem[] }> = [
    { title: 'Spárované výdaje', items: review.expenseMatched ?? [] },
    { title: 'Výdaje ke kontrole', items: review.expenseNeedsReview ?? [] },
    { title: 'Nespárované doklady', items: review.expenseUnmatchedDocuments ?? [] },
    { title: 'Nespárované odchozí platby', items: review.expenseUnmatchedOutflows ?? [] }
  ]

  return groups.map((group) => {
    const body = group.items.length === 0
      ? '<p class="empty">Žádné položky v této sekci.</p>'
      : group.items.map((item) => renderExpenseReviewItemHtml(item)).join('')

    return `<section class="section-panel"><h3>${escapeHtml(group.title)}</h3>${body}</section>`
  }).join('')
}

function renderExpenseReviewItemHtml(item: ReviewSectionItem): string {
  const comparison = item.expenseComparison ?? { document: {} }
  const comparisonVariant = comparison.variant === 'bank-bank' ? 'bank-bank' : 'document-bank'
  const leftLabel = comparison.leftLabel ?? (comparisonVariant === 'bank-bank' ? 'Odchozí účet' : 'Doklad')
  const rightLabel = comparison.rightLabel ?? (comparisonVariant === 'bank-bank' ? 'Příchozí účet' : 'Banka')

  return [
    '<article class="expense-item">',
    `<strong>${escapeHtml(item.title)}</strong>`,
    '<div class="expense-comparison">',
    renderExpenseComparisonSideHtml(leftLabel, comparison.document, comparisonVariant === 'document-bank' ? 'document' : 'bank'),
    '<div class="expense-status">',
    '<h6>Stav a důkazy</h6>',
    `<span class="status-badge ${escapeHtml(mapMatchStrengthToStatusClass(item.matchStrength))}">${escapeHtml(item.matchStrength)}</span>`,
    item.operatorExplanation ? `<div class="empty"><strong>Vyhodnocení:</strong> ${escapeHtml(item.operatorExplanation)}</div>` : '',
    renderExpenseEvidenceHtml(item.evidenceSummary),
    item.documentBankRelation ? `<div class="empty"><strong>Doklad ↔ banka:</strong> ${escapeHtml(item.documentBankRelation)}</div>` : '',
    item.operatorCheckHint ? `<div class="empty"><strong>Ruční kontrola:</strong> ${escapeHtml(item.operatorCheckHint)}</div>` : '',
    '</div>',
    renderExpenseComparisonSideHtml(rightLabel, comparison.bank, 'bank'),
    '</div>',
    '</article>'
  ].join('')
}

function renderExpenseComparisonSideHtml(
  title: string,
  side: ReviewExpenseComparisonSide | undefined,
  sideMode: 'document' | 'bank'
): string {
  const isDocument = sideMode === 'document'
  const fields = isDocument
    ? [
        ['Dodavatel', side?.supplierOrCounterparty],
        ['Číslo faktury / reference', side?.reference],
        ['Datum vystavení', side?.issueDate],
        ['Datum splatnosti', side?.dueDate],
        ['Částka', side?.amount],
        ['Měna', side?.currency],
        ['IBAN hint', side?.ibanHint]
      ]
    : [
        ['Datum pohybu', side?.bookedAt],
        ['Částka', side?.amount],
        ['Měna', side?.currency],
        ['Protistrana / název účtu', side?.supplierOrCounterparty],
        ['Reference / zpráva / VS', side?.reference],
        ['Bankovní účet', side?.bankAccount]
      ]
  const visibleFields = fields.filter((entry) => Boolean(entry[1]))

  return [
    '<div class="expense-side">',
    `<h6>${escapeHtml(title)}</h6>`,
    visibleFields.length === 0
      ? `<p class="empty">${escapeHtml(isDocument ? 'Zatím bez načteného dokladu.' : 'Zatím bez kandidátního bankovního pohybu.')}</p>`
      : `<ul>${visibleFields.map((entry) => `<li><strong>${escapeHtml(String(entry[0]))}:</strong> ${escapeHtml(String(entry[1]))}</li>`).join('')}</ul>`,
    '</div>'
  ].join('')
}

function renderExpenseEvidenceHtml(evidence: ReviewEvidenceEntry[]): string {
  if (evidence.length === 0) {
    return '<p class="empty">Bez doplňujících důkazů.</p>'
  }

  return `<ul>${evidence.map((entry) => `<li><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</li>`).join('')}</ul>`
}

function mapMatchStrengthToStatusClass(matchStrength: ReviewSectionItem['matchStrength']): string {
  switch (matchStrength) {
    case 'potvrzená shoda':
      return 'confirmed'
    case 'slabší shoda':
      return 'weak'
    case 'vyžaduje kontrolu':
      return 'review'
    default:
      return 'unmatched'
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
