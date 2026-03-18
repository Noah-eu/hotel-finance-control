import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  prepareUploadedMonthlyFiles,
  runMonthlyReconciliationBatch,
  type ImportedMonthlySourceFile,
  type UploadedMonthlyFile
} from '../monthly-batch'
import { buildReviewScreen, type ReviewScreenData } from '../review'

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
  batch: ReturnType<typeof runMonthlyReconciliationBatch>
  review: ReviewScreenData
}

export interface UploadWebFlowResult {
  html: string
  generatedAt: string
  outputPath?: string
}

export interface BrowserReviewScreenResult {
  html: string
  preview: UploadedBatchPreviewResult
  outputPath?: string
}

export function buildUploadWebFlow(options: BuildUploadWebFlowOptions = {}): UploadWebFlowResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const html = renderUploadWebFlowHtml(generatedAt)

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
        <span class="pill">Místní upload</span>
        <h1>Hotel Finance Control – nahrání měsíčních souborů</h1>
        <p>Tato první verze umožňuje nahrát skutečné měsíční soubory přímo v prohlížeči, zkontrolovat jejich přehled a připravit je pro další deterministické zpracování.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(generatedAt)}</p>
      </section>

      <section class="card">
        <h2>1. Vyberte soubory za měsíc</h2>
        <div class="grid">
          <div>
            <label for="monthly-files">Soubory k nahrání</label>
            <input id="monthly-files" type="file" multiple />
      <p class="hint">Podporované vstupy: bankovní výpisy, OTA exporty, Comgate, faktury a účtenky.</p>
      <p class="hint">Rozpoznání typu souboru používá stejnou sdílenou přípravu jako následné zpracování v <code>monthly-batch</code>.</p>
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
      </section>

      <section class="card">
        <h2>Co bude následovat</h2>
        <ul>
          <li>Nahrané soubory lze napojit do sdíleného pipeline <code>monthly-batch</code> a <code>extraction</code>.</li>
          <li>Na stejných datech lze zobrazit prohlížečovou kontrolní obrazovku pro spárované, nespárované a podezřelé položky.</li>
          <li>Tato verze zůstává čistě lokální a bez backendu, aby byl tok souborů snadno auditovatelný.</li>
        </ul>
      </section>
    </main>

    <script>
      const fileInput = document.getElementById('monthly-files');
      const monthInput = document.getElementById('month-label');
      const button = document.getElementById('prepare-upload');
      const summary = document.getElementById('upload-summary');

      function renderSummary() {
        const files = Array.from(fileInput.files || []);
        const month = monthInput.value || 'neuvedeno';

        if (files.length === 0) {
          summary.className = 'summary empty';
          summary.textContent = 'Zatím nebyly vybrány žádné soubory.';
          return;
        }

        summary.className = 'summary';
        summary.innerHTML = [
          '<strong>Měsíc:</strong> ' + escapeHtml(month),
          '<br /><strong>Počet souborů:</strong> ' + files.length,
          '<ul>' + files.map((file) => '<li><strong>' + escapeHtml(file.name) + '</strong> — ' + file.size + ' B</li>').join('') + '</ul>',
          '<p class="hint">Soubory jsou připravené pro sdílený deterministický vstup do importu, extrakce a měsíčního běhu.</p>'
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

      button.addEventListener('click', renderSummary);
      fileInput.addEventListener('change', renderSummary);
      monthInput.addEventListener('change', renderSummary);
    </script>
  </body>
</html>
`
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

export function placeholder() {
  return {
    name: 'upload-web',
    mode: 'local-static',
    buildUploadWebFlow,
    buildUploadedBatchPreview,
    buildBrowserReviewScreen
  }
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
        <p>Tato lokální obrazovka zobrazuje stejné sdílené výsledky z uploadu, extrakce, párování a review workflow bez backendu a bez paralelního modelu.</p>
        <p><strong>Vygenerováno:</strong> ${escapeHtml(review.generatedAt)}</p>
      </section>

      <section class="card">
        <h2>Souhrn měsíce</h2>
        <div class="summary-grid">
          <div class="metric"><strong>${review.summary.normalizedTransactionCount}</strong><br />Normalizované transakce</div>
          <div class="metric"><strong>${review.summary.matchedGroupCount}</strong><br />Spárované skupiny</div>
          <div class="metric"><strong>${review.summary.exceptionCount}</strong><br />Položky ke kontrole</div>
          <div class="metric"><strong>${batch.files.length}</strong><br />Zpracované soubory</div>
        </div>
      </section>

      <section class="card">
        <h2>Přehled kontrolních sekcí</h2>
        <div class="section-grid">
          ${renderReviewSection('Spárované položky', 'matched', review.matched)}
          ${renderReviewSection('Nespárované položky', 'unmatched', review.unmatched)}
          ${renderReviewSection('Podezřelé položky', 'suspicious', review.suspicious)}
          ${renderReviewSection('Chybějící doklady', 'missing', review.missingDocuments)}
        </div>
      </section>

      <section class="card">
        <h2>Trace souborů</h2>
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