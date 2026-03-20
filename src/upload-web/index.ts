import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import {
  prepareUploadedMonthlyFiles,
  runMonthlyReconciliationBatch,
  type ImportedMonthlySourceFile,
  type MonthlyBatchResult,
  type UploadedMonthlyFile
} from '../monthly-batch'
import { buildExportArtifacts, type ExportArtifactsResult } from '../export'
import { buildReviewScreen, type ReviewScreenData } from '../review'
import type { ReconciliationReport } from '../reporting'
import { formatAmountMinorCs } from '../shared/money'
import { emitBrowserRuntimeBundle } from './browser-bundle'
import { buildBrowserRuntimeUploadStateFromFiles } from './browser-runtime-state'

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
  preparedFiles: Array<{
    fileName: string
    sourceDocumentId: string
    sourceSystem: string
    documentType: string
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
  reviewSummary: ReviewScreenData['summary']
  reviewSections: Pick<ReviewScreenData, 'matched' | 'payoutBatchMatched' | 'payoutBatchUnmatched' | 'unmatched' | 'suspicious' | 'missingDocuments'>
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
  text?: () => Promise<string>
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
  const browserRuntime = createBrowserRuntime();

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

        try {
          const state = await browserRuntime.buildRuntimeState({
            files,
            month: monthInput.value,
            generatedAt
          });

          runtimeOutput.className = 'runtime-panel';
          runtimeOutput.innerHTML = renderRuntimeState(state);
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
        return [
          '<h3>3. Výsledek sdíleného měsíčního běhu</h3>',
          '<p class="hint">Tento panel ukazuje jeden skutečný běh nad právě vybranými soubory: příprava, kontrola, náhled reportu i exportní předání. Bez backendu a bez paralelního browserového modelu.</p>',
          '<p><strong>Měsíc:</strong> ' + escapeHtml(state.monthLabel) + '</p>',
          '<p><strong>Run ID:</strong> <code>' + escapeHtml(state.runId) + '</code></p>',
          '<p><strong>Vygenerováno:</strong> ' + escapeHtml(state.generatedAt) + '</p>',
          '<div class="metric-grid">',
          '<div class="metric-tile"><strong>' + state.preparedFiles.length + '</strong><br />Připravené soubory</div>',
          '<div class="metric-tile"><strong>' + state.reportSummary.normalizedTransactionCount + '</strong><br />Normalizované transakce</div>',
          '<div class="metric-tile"><strong>' + state.reviewSummary.exceptionCount + '</strong><br />Položky ke kontrole</div>',
          '<div class="metric-tile"><strong>' + state.exportFiles.length + '</strong><br />Připravené exporty</div>',
          '</div>',
          '<div class="runtime-grid">',
          '<section class="runtime-card"><h4>1. Připravené soubory a trasování</h4><ul class="trace-list">' + state.preparedFiles.map((file) => '<li><strong>' + escapeHtml(file.fileName) + '</strong><br /><span class="hint">' + escapeHtml(file.sourceSystem) + ' / ' + escapeHtml(file.documentType) + '</span><br /><code>' + escapeHtml(file.sourceDocumentId) + '</code></li>').join('') + '</ul></section>',
          '<section class="runtime-card"><h4>2. Extrakce a příprava</h4><ul class="trace-list">' + state.extractedRecords.map((file) => '<li><strong>' + escapeHtml(file.fileName) + '</strong><br />Extrahováno: ' + file.extractedCount + '<br />' + (file.extractedRecordIds.length > 0 ? '<code>' + escapeHtml(file.extractedRecordIds.join(', ')) + '</code>' : '<span class="hint">Žádné extrahované záznamy.</span>') + '</li>').join('') + '</ul></section>',
          '<section class="runtime-card"><h4>3. Kontrola operátora</h4>' + renderRuntimeReviewSection(state.reviewSections) + '</section>',
          '<section class="runtime-card"><h4>4. Náhled reportu</h4>' + renderRuntimeReportSummary(state) + '</section>',
          '<section class="runtime-card"><h4>5. Vazby na podpůrné doklady</h4>' + renderSupportedExpenseLinks(state.supportedExpenseLinks) + '</section>',
          '<section class="runtime-card"><h4>6. Exportní předání</h4>' + renderRuntimeExportFiles(state.exportFiles) + '</section>',
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

function renderRuntimeReviewSection(sections: BrowserRuntimeUploadState['reviewSections']): string {
  const groups = [
    { label: 'Spárované', items: sections.matched },
    { label: 'Spárované payout dávky', items: sections.payoutBatchMatched },
    { label: 'Nespárované', items: sections.unmatched },
    { label: 'Podezřelé', items: sections.suspicious },
    { label: 'Chybějící doklady', items: sections.missingDocuments }
  ]

  return `<ul class="review-list">${groups.map((group) => `<li><strong>${escapeHtml(group.label)}:</strong> ${group.items.length}${group.items[0] ? `<br /><span class="hint">${escapeHtml(group.items[0].title)} — ${escapeHtml(group.items[0].detail)}</span>` : '<br /><span class="hint">Bez položek.</span>'}</li>`).join('')}</ul>`
}

function renderRuntimeReportSummary(state: BrowserRuntimeUploadState): string {
  return `
    <div class="metric-grid">
      <div class="metric-tile"><strong>${state.reportSummary.matchedGroupCount}</strong><br />Spárované skupiny</div>
      <div class="metric-tile"><strong>${state.reportSummary.payoutBatchMatchCount ?? 0}</strong><br />Spárované payout dávky</div>
      <div class="metric-tile"><strong>${state.reportSummary.unmatchedExpectedCount}</strong><br />Nespárované očekávané</div>
      <div class="metric-tile"><strong>${state.reportSummary.unmatchedActualCount}</strong><br />Nespárované skutečné</div>
    </div>
    <ul class="report-list">
      <li><strong>Souhrn kontroly:</strong> ${state.reviewSummary.exceptionCount} položek ke kontrole ve sdíleném reportu.</li>
      <li><strong>Praktická čitelnost:</strong> částky jsou v operátorském náhledu zobrazené jako české koruny tam, kde jsou přímo relevantní.</li>
    </ul>
  `
}

function renderSupportedExpenseLinks(
  links: BrowserRuntimeUploadState['supportedExpenseLinks']
): string {
  if (links.length === 0) {
    return '<p class="hint">V tomto běhu se neobjevily žádné doložené výdajové vazby mezi bankovní transakcí a fakturou nebo účtenkou.</p>'
  }

  return `<ul class="link-list">${links.map((link) => `<li><strong><code>${escapeHtml(link.expenseTransactionId)}</code></strong> → <code>${escapeHtml(link.supportTransactionId)}</code><br /><span class="hint">Skóre ${escapeHtml(link.matchScore.toFixed(2))}; důvody: ${escapeHtml(link.reasons.join(', '))}</span><br /><span class="hint">Zdrojové dokumenty: ${link.supportSourceDocumentIds.length > 0 ? `<code>${escapeHtml(link.supportSourceDocumentIds.join(', '))}</code>` : 'neuvedeno'}</span></li>`).join('')}</ul>`
}

function renderRuntimeExportFiles(
  files: BrowserRuntimeUploadState['exportFiles']
): string {
  if (files.length === 0) {
    return '<p class="hint">Pro tento běh zatím nevznikly žádné exporty.</p>'
  }

  return `<ul class="export-list">${files.map((file) => `<li><strong>${escapeHtml(file.labelCs)}</strong><br /><code>${escapeHtml(file.fileName)}</code></li>`).join('')}</ul>`
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
  const importedFiles = prepareUploadedMonthlyFiles(input.files)
  const batch = runMonthlyReconciliationBatch({
    files: importedFiles,
    reconciliationContext: {
      runId: input.runId,
      requestedAt: input.generatedAt
    },
    reportGeneratedAt: input.generatedAt
  })
  const review = buildReviewScreen({
    batch,
    generatedAt: input.generatedAt
  })

  return {
    importedFiles,
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
          <div class="metric"><strong>${run.importedFiles.length}</strong><br />Nahrané soubory</div>
          <div class="metric"><strong>${run.report.transactions.length}</strong><br />Řádků v reportu</div>
          <div class="metric"><strong>${run.exports.files.length}</strong><br />Připravené exporty</div>
        </div>
      </section>

      <section class="card">
  <h2>Trasování nahraných souborů</h2>
        <div class="trace-grid">
          ${run.importedFiles.map((file) => `
            <article class="trace-card">
              <h3>${escapeHtml(file.sourceDocument.fileName)}</h3>
              <p><strong>Zdroj:</strong> ${escapeHtml(file.sourceDocument.sourceSystem)}</p>
              <p><strong>Typ:</strong> ${escapeHtml(file.sourceDocument.documentType)}</p>
              <p><strong>ID zdrojového dokumentu:</strong> <code>${escapeHtml(file.sourceDocument.id)}</code></p>
              <p><strong>Extrahované záznamy:</strong> ${escapeHtml(String(findBatchFileExtractedCount(run.batch, file.sourceDocument.id)))}</p>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <h2>Kontrolní sekce</h2>
        <div class="section-grid">
          ${renderReviewSection('Spárované položky', 'matched', run.review.matched)}
          ${renderReviewSection('Nespárované položky', 'unmatched', run.review.unmatched)}
          ${renderReviewSection('Podezřelé položky', 'suspicious', run.review.suspicious)}
          ${renderReviewSection('Chybějící doklady', 'missing', run.review.missingDocuments)}
        </div>
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
          ${renderReviewSection('Nespárované payout dávky', 'unmatched', review.payoutBatchUnmatched)}
          ${renderReviewSection('Nespárované položky', 'unmatched', review.unmatched)}
          ${renderReviewSection('Podezřelé položky', 'suspicious', review.suspicious)}
          ${renderReviewSection('Chybějící doklady', 'missing', review.missingDocuments)}
        </div>
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
    : `<ul>${items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span class="badge ${badgeClass}">${escapeHtml(item.kind)}</span><br />${escapeHtml(item.detail)}${item.transactionIds.length > 0 ? `<br /><code>${escapeHtml(item.transactionIds.join(', '))}</code>` : ''}</li>`).join('')}</ul>`

  return `<section class="section-panel"><h3>${escapeHtml(title)}</h3>${body}</section>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
