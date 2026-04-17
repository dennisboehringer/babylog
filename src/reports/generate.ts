// Orchestrates a single report generation: stats → Claude → HTML → persist.
// Split from claude.ts and template.ts so the screen component can stay
// thin and the pipeline is testable end-to-end.

import { v4 as uuid } from 'uuid';
import { db } from '../db';
import type { BabyProfile, StoredReport } from '../types';
import { computeReportStats, type ReportStats } from './stats';
import { generateReportProse, ClaudeError } from './claude';
import { renderReportHTML, fallbackAIContent, type AIContent } from './template';

export interface GenerateResult {
  report: StoredReport;
  stats: ReportStats;
  aiContent: AIContent;
  aiGenerated: boolean;
  warning: string | null;  // shown subtly if we fell back to deterministic prose
}

function titleForRange(stats: ReportStats): string {
  if (stats.range.dayCount === 1) return `Day ${stats.baby.ageDaysAtReport} Report`;
  return `${stats.range.dayCount}-Day Feeding Report`;
}

function rangeLabel(stats: ReportStats): string {
  if (stats.range.startLabel === stats.range.endLabel) return stats.range.startLabel;
  // "Apr 12 – Apr 14, 2026"
  return `${stats.range.startLabel.replace(/,.*/, '')} – ${stats.range.endLabel}`;
}

export async function generateReport(
  baby: BabyProfile,
  rangeStartMs: number,
  rangeEndMs: number,
  opts: { forceFallback?: boolean } = {},
): Promise<GenerateResult> {
  const stats = await computeReportStats(baby, rangeStartMs, rangeEndMs);

  let ai: AIContent;
  let aiGenerated = false;
  let warning: string | null = null;

  if (opts.forceFallback) {
    ai = fallbackAIContent(stats);
  } else {
    try {
      ai = await generateReportProse(stats);
      aiGenerated = true;
    } catch (err) {
      ai = fallbackAIContent(stats);
      if (err instanceof ClaudeError) {
        warning = err.message;
      } else {
        warning = 'AI prose unavailable. Showing deterministic summary instead.';
      }
    }
  }

  const title = titleForRange(stats);
  const html = renderReportHTML(stats, ai, { reportTitle: title });

  const report: StoredReport = {
    id: uuid(),
    babyId: baby.id,
    generatedAt: Date.now(),
    rangeStart: rangeStartMs,
    rangeEnd: rangeEndMs,
    rangeLabel: rangeLabel(stats),
    title,
    html,
    statsJSON: JSON.stringify(stats),
    aiGenerated,
  };

  await db.reports.put(report);

  return { report, stats, aiContent: ai, aiGenerated, warning };
}

export async function listReports(babyId: string): Promise<StoredReport[]> {
  const rows = await db.reports.where('babyId').equals(babyId).toArray();
  return rows.sort((a, b) => b.generatedAt - a.generatedAt);
}

export async function deleteReport(id: string): Promise<void> {
  await db.reports.delete(id);
}

export function downloadReportHTML(report: StoredReport, babyName: string) {
  const blob = new Blob([report.html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date(report.generatedAt).toISOString().split('T')[0];
  a.download = `${babyName.toLowerCase()}-report-${dateStr}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printReportHTML(report: StoredReport) {
  // Open the HTML in a new window and trigger print. Users can save as PDF
  // from the browser print dialog, preserving the @page styles.
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(report.html);
  win.document.close();
  // Wait for fonts + layout before print
  win.addEventListener('load', () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  });
}
