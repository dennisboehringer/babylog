import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useAiGate } from '../hooks/useAiGate';
import { recordReportAi } from './AccuracyFeedbackPrompt';
import { exportPDF, exportCSV } from '../export';
import {
  generateReport,
  listReports,
  deleteReport,
  downloadReportHTML,
  printReportHTML,
  type GenerateResult,
} from '../reports/generate';
import { hasByoKey } from '../reports/claude';
import type { StoredReport } from '../types';

type RangePreset = '24h' | '3d' | '7d' | 'custom';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function presetRange(preset: RangePreset): { start: number; end: number } {
  const now = new Date();
  const end = now.getTime();
  if (preset === '24h') return { start: end - 86400000, end };
  if (preset === '3d') return { start: startOfDay(new Date(end - 2 * 86400000)).getTime(), end };
  if (preset === '7d') return { start: startOfDay(new Date(end - 6 * 86400000)).getTime(), end };
  return { start: startOfDay(new Date(end - 2 * 86400000)).getTime(), end };
}

function toInputDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ReportsScreen() {
  const { activeBaby } = useApp();
  const { t } = useLanguage();
  const [preset, setPreset] = useState<RangePreset>('3d');
  const [customStart, setCustomStart] = useState<string>(toInputDate(Date.now() - 2 * 86400000));
  const [customEnd, setCustomEnd] = useState<string>(toInputDate(Date.now()));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [forceFallback, setForceFallback] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredReport[]>([]);
  const [previewReport, setPreviewReport] = useState<StoredReport | null>(null);
  const usingByoKey = hasByoKey();
  const { gate: gateAi, modal: aiGateModal } = useAiGate();

  useEffect(() => {
    if (!activeBaby) return;
    listReports(activeBaby.id).then(setHistory);
  }, [activeBaby, result]);

  function handleGenerate() {
    // Lazy-gate via the unified AI disclosure (Pediatric Safety + AI Lead).
    gateAi(() => doGenerate());
  }

  async function doGenerate() {
    if (!activeBaby) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const range = preset === 'custom'
        ? { start: startOfDay(new Date(customStart)).getTime(), end: endOfDay(new Date(customEnd)).getTime() }
        : presetRange(preset);
      const res = await generateReport(activeBaby, range.start, range.end, { forceFallback });
      setResult(res);
      setPreviewReport(res.report);
      // CPO + AI Lead: every 3rd report → 1-tap accuracy vote, feeds the eval log.
      // Skip when the deterministic fallback was used (no AI to rate).
      if (res.report.aiGenerated && recordReportAi(res.report.id)) {
        window.dispatchEvent(new CustomEvent('babylog:feedback-prompt', {
          detail: { refId: res.report.id, surface: 'report' },
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reports.error.generic'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteReport(id);
    if (activeBaby) setHistory(await listReports(activeBaby.id));
  }

  if (!activeBaby) return null;

  return (
    <div className="flex-1 scrollable px-4 pt-4 pb-6">
      {aiGateModal}
      {/* Title */}
      <div className="mb-5">
        <h2 className="text-[22px] font-semibold tracking-tight">{t('reports.title')}</h2>
        <p className="text-sm text-text-muted mt-0.5">{t('reports.subtitle')}</p>
      </div>

      {/* Calm informational note — universal disclosure handles the heavy lift. */}
      <div className="rounded-2xl p-3.5 mb-5 bg-bg-card border border-border">
        <p className="text-[12px] text-text-secondary leading-relaxed">
          {t('reports.disclaimer')}
        </p>
      </div>

      {/* Generate section */}
      <SectionLabel>{t('reports.generate.section')}</SectionLabel>
      <div className="glass-card rounded-2xl p-4 mb-5">
        <p className="text-sm text-text-secondary mb-4 leading-relaxed">{t('reports.generate.description')}</p>

        {/* Preset range selector */}
        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-2 block">{t('reports.range.label')}</label>
        <div className="grid grid-cols-4 gap-2 mb-4 bg-bg-card rounded-xl p-1">
          {(['24h', '3d', '7d', 'custom'] as RangePreset[]).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`py-2 rounded-lg text-[12px] font-medium transition-all min-h-[36px] ${
                preset === p ? 'bg-accent-blue text-white shadow-sm' : 'text-text-secondary active:bg-fill-4'
              }`}
            >
              {t(`reports.range.${p}`)}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <label className="text-text-muted text-[10px] font-medium uppercase tracking-wider mb-1 block">{t('reports.range.from')}</label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary text-sm outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
            <div className="flex-1">
              <label className="text-text-muted text-[10px] font-medium uppercase tracking-wider mb-1 block">{t('reports.range.to')}</label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary text-sm outline-none focus:ring-2 focus:ring-accent-blue"
              />
            </div>
          </div>
        )}

        {/* Primary action */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-3.5 rounded-2xl btn-primary text-white font-semibold text-[15px] disabled:opacity-50 flex items-center justify-center gap-2 min-h-[52px]"
        >
          {generating ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{t('reports.generate.generating')}</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <span>{t('reports.generate.button')}</span>
            </>
          )}
        </button>

        {/* Advanced disclosure */}
        <button
          onClick={() => setAdvancedOpen(v => !v)}
          className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs text-text-muted py-2 active:text-text-secondary"
        >
          <span>{t('reports.advanced.toggle')}</span>
          <svg
            width="10" height="10" viewBox="0 0 12 12" fill="none"
            className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {advancedOpen && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <span className="relative inline-block flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={forceFallback}
                  onChange={e => setForceFallback(e.target.checked)}
                  className="peer appearance-none w-5 h-5 rounded border border-border-light bg-bg-input checked:bg-accent-blue checked:border-accent-blue transition-colors cursor-pointer"
                />
                <svg className="absolute top-0.5 left-0.5 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>
                <span className="block text-sm text-text-primary">{t('reports.advanced.forceFallback')}</span>
                <span className="block text-xs text-text-muted mt-0.5 leading-snug">{t('reports.advanced.forceFallback.hint')}</span>
              </span>
            </label>
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${usingByoKey ? 'bg-accent-blue' : 'bg-text-muted'}`} />
              <span className="text-text-muted">
                {usingByoKey ? t('settings.ai.keyActive') : t('settings.ai.keyHosted')}
              </span>
            </div>
          </div>
        )}

        {/* Error + fallback warnings */}
        {error && (
          <div className="mt-3 rounded-xl p-3 bg-accent-red/10 border border-accent-red/30">
            <p className="text-[12px] text-accent-red font-medium">{error}</p>
          </div>
        )}
        {result?.warning && (
          <div className="mt-3 rounded-xl p-3 bg-accent-amber/10 border border-accent-amber/40">
            <p className="text-[12px] text-accent-amber font-medium">{result.warning}</p>
          </div>
        )}
      </div>

      {/* History */}
      <SectionLabel>{t('reports.history.section')}</SectionLabel>
      {history.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 mb-5 text-center">
          <p className="text-sm text-text-muted">{t('reports.history.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {history.map(r => (
            <ReportRow
              key={r.id}
              report={r}
              onView={() => setPreviewReport(r)}
              onDownload={() => downloadReportHTML(r, activeBaby.name)}
              onPrint={() => printReportHTML(r)}
              onDelete={() => handleDelete(r.id)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Raw exports — moved from Settings */}
      <SectionLabel>{t('reports.rawExport.section')}</SectionLabel>
      <p className="text-xs text-text-muted px-1 mb-2 leading-relaxed">{t('reports.rawExport.description')}</p>
      <div className="glass-card rounded-2xl divide-y divide-border mb-5">
        <button
          onClick={() => exportPDF(activeBaby)}
          className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
        >
          <span className="text-sm font-medium">{t('btn.exportPDF')}</span>
          <span className="text-sm text-accent-blue font-medium">{t('btn.download')}</span>
        </button>
        <button
          onClick={() => exportCSV(activeBaby)}
          className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
        >
          <span className="text-sm font-medium">{t('btn.exportCSV')}</span>
          <span className="text-sm text-accent-blue font-medium">{t('btn.download')}</span>
        </button>
      </div>

      {/* Preview modal */}
      {previewReport && (
        <PreviewModal
          report={previewReport}
          onClose={() => setPreviewReport(null)}
          onDownload={() => downloadReportHTML(previewReport, activeBaby.name)}
          onPrint={() => printReportHTML(previewReport)}
          t={t}
        />
      )}
    </div>
  );
}

function ReportRow({
  report, onView, onDownload, onPrint, onDelete, t,
}: {
  report: StoredReport;
  onView: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onDelete: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onView} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-[15px] truncate">{report.title}</p>
            {report.aiGenerated ? (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-blue/15 text-accent-blue">
                {t('reports.history.aiBadge')}
              </span>
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-fill-3 text-text-muted">
                {t('reports.history.noAiBadge')}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">{report.rangeLabel}</p>
          <p className="text-[10px] text-text-muted mt-0.5 opacity-70">
            {formatTimestamp(report.generatedAt)}
          </p>
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onView}
          className="flex-1 py-2 rounded-xl bg-bg-input text-text-secondary text-xs font-medium min-h-[36px] active:opacity-70"
        >
          {t('reports.history.view')}
        </button>
        <button
          onClick={onPrint}
          className="flex-1 py-2 rounded-xl bg-bg-input text-text-secondary text-xs font-medium min-h-[36px] active:opacity-70"
        >
          {t('reports.history.print')}
        </button>
        <button
          onClick={onDownload}
          className="flex-1 py-2 rounded-xl bg-accent-blue/15 text-accent-blue text-xs font-medium min-h-[36px] active:opacity-70"
        >
          {t('reports.history.downloadHTML')}
        </button>
        {confirmDelete ? (
          <button
            onClick={onDelete}
            className="px-3 py-2 rounded-xl bg-accent-red text-white text-xs font-medium min-h-[36px]"
          >
            {t('btn.confirmDelete')}
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-2 rounded-xl bg-bg-input text-accent-red text-xs font-medium min-h-[36px] active:opacity-70"
            aria-label={t('reports.history.delete')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function PreviewModal({
  report, onClose, onDownload, onPrint, t,
}: {
  report: StoredReport;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  t: (key: string) => string;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-border-light bg-bg-surface">
        <h3 className="text-[15px] font-semibold truncate">{report.title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrint}
            className="px-3 py-1.5 rounded-lg bg-bg-input text-text-secondary text-xs font-medium min-h-[32px]"
          >
            {t('reports.history.print')}
          </button>
          <button
            onClick={onDownload}
            className="px-3 py-1.5 rounded-lg bg-accent-blue/15 text-accent-blue text-xs font-medium min-h-[32px]"
          >
            {t('reports.history.downloadHTML')}
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-card text-text-muted"
            aria-label={t('reports.preview.close')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <iframe
        srcDoc={report.html}
        title={report.title}
        className="flex-1 w-full bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2.5">{children}</h3>;
}
