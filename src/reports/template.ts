// Renders the one-pager HTML report.
// Layout and styling lifted from the lucas-day4-report.html demo — tuned for
// US Letter @media print. Numbers are computed deterministically in stats.ts;
// prose (summary / insights / assessment) is supplied by Claude via claude.ts.
// If AI content is not available we fall back to descriptive, non-interpretive
// placeholder strings so the report still renders.

import type { ReportStats } from './stats';

export interface AIContent {
  executiveSummary: string;
  volumeInsight: string;
  timelineInsight: string;
  diaperInsight: string;
  // Exactly six items, in the order below. Color is a traffic-light classification.
  assessment: {
    key: 'intake' | 'frequency' | 'hydration' | 'gutTransit' | 'volumeTrend' | 'supplyChain';
    title: string;
    body: string;
    color: 'green' | 'amber' | 'red';
  }[];
}

function esc(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function classForStoolClassification(c: string): string {
  if (c === 'favorable') return 'favorable';
  return 'normal';
}

function colorForFeedBar(ml: number, maxMl: number): string {
  // Bar color: grey baseline, navy mid, amber peak
  if (ml >= maxMl * 0.9 && maxMl >= 50) return 'var(--amber)';
  if (ml >= 40) return 'var(--navy)';
  return '#C8CDD6';
}

function renderVolumeChart(stats: ReportStats): string {
  const maxVol = Math.max(...stats.volumeTrend.map(v => v.volumeMl), 1);
  const bars = stats.volumeTrend.map((d, i) => {
    const isLast = i === stats.volumeTrend.length - 1;
    const height = Math.round((d.volumeMl / maxVol) * 80) + 10;
    const color = isLast ? 'var(--navy)' : '#C8CDD6';
    const dayInfo = stats.days[i];
    return `
      <div class="vol-bar-group">
        <div class="vol-bar-val">${esc(d.volumeMl)}</div>
        <div class="vol-bar" style="height:${height}px; background:${color};"></div>
        <div class="vol-bar-label">${esc(d.label)}</div>
        <div class="vol-bar-sub">DOL ${esc(dayInfo?.dayOfLife ?? '')} · ${esc(d.feedCount)}f</div>
      </div>`;
  }).join('');
  return `<div class="vol-chart">${bars}</div>`;
}

function renderFeedTimeline(stats: ReportStats): string {
  const allFeeds = stats.days.flatMap(d => d.feeds.map(f => ({ ...f, dayLabel: d.label, dayOfLife: d.dayOfLife })));
  const maxVol = Math.max(...allFeeds.map(f => f.volumeMl ?? 0), 1);

  let html = '';
  let lastLabel = '';
  for (const f of allFeeds) {
    if (f.dayLabel !== lastLabel) {
      html += `<div class="feed-day-label">${esc(f.dayLabel)} · DOL ${esc(f.dayOfLife)}</div>`;
      lastLabel = f.dayLabel;
    }
    const vol = f.volumeMl;
    if (vol != null) {
      const widthPct = Math.max(15, Math.round((vol / maxVol) * 100));
      const color = colorForFeedBar(vol, maxVol);
      html += `
        <div class="feed-row">
          <span class="feed-time">${esc(f.timeOfDay)}</span>
          <div class="feed-bar" style="width:${widthPct}%; background:${color};"></div>
          <span class="feed-ml">${esc(vol)}</span>
        </div>`;
    } else {
      html += `
        <div class="feed-row">
          <span class="feed-time">${esc(f.timeOfDay)}</span>
          <div class="feed-bar" style="width:30%; background:#C8CDD6; opacity:0.5;"></div>
          <span class="feed-ml" style="font-style:italic;">breast</span>
        </div>`;
    }
  }
  return `<div class="feed-timeline">${html}</div>`;
}

function renderDiaperGrid(stats: ReportStats): string {
  const cards = stats.days.map(d => {
    const wetThreshold = stats.wetDiaperThresholds.find(t => t.dayOfLife === d.dayOfLife);
    const wetOk = wetThreshold?.met ?? true;
    return `
      <div class="diaper-card">
        <div class="diaper-card-day">DOL ${esc(d.dayOfLife)} · ${esc(d.label)}</div>
        <div class="diaper-stat">
          <div><div class="diaper-num">${esc(d.wetCount)}</div><div class="diaper-type">Wet</div><div class="diaper-check ${wetOk ? 'ok' : 'warn'}">${wetOk ? '✓' : '!'}</div></div>
          <div><div class="diaper-num">${esc(d.stoolCount)}</div><div class="diaper-type">Stool</div><div class="diaper-check ok">✓</div></div>
        </div>
      </div>`;
  }).join('');
  return `<div class="diaper-grid">${cards}</div>`;
}

function renderStoolProgression(stats: ReportStats): string {
  if (stats.stoolProgression.length === 0) {
    return `<div style="font-size:9px; color:var(--muted); padding:6px 0;">No stool events logged in this range.</div>`;
  }
  return stats.stoolProgression.map(s => {
    const cls = classForStoolClassification(s.classification);
    const badgeLabel = s.classification === 'favorable' ? 'Favorable'
      : s.classification === 'transitional' ? 'Transitional'
      : s.classification === 'concerning' ? 'Review'
      : 'Normal';
    return `
      <div class="stool-row ${cls}">
        <span class="stool-day">${esc(s.label)}</span>
        <span class="stool-dol">DOL ${esc(s.dayOfLife)}</span>
        <span class="stool-desc">${esc(s.description)}</span>
        <span class="stool-badge ${cls}">${esc(badgeLabel)}</span>
      </div>`;
  }).join('');
}

function renderAssessment(ai: AIContent): string {
  return ai.assessment.map(item => {
    const cls = item.color === 'green' ? '' : item.color === 'amber' ? 'amber' : 'red';
    const dotCls = item.color;
    return `
      <div class="assess-item ${cls}">
        <div class="assess-title"><span class="assess-dot ${dotCls}"></span>${esc(item.title)}</div>
        <div class="assess-body">${esc(item.body)}</div>
      </div>`;
  }).join('');
}

function kpiRow(stats: ReportStats): string {
  const t = stats.totals;
  const firstDayVol = stats.volumeTrend[0]?.volumeMl ?? 0;
  const lastDayVol = stats.volumeTrend[stats.volumeTrend.length - 1]?.volumeMl ?? 0;
  const lastDayFeeds = stats.days[stats.days.length - 1]?.feedCount ?? 1;
  const avgLastDay = lastDayFeeds > 0 ? Math.round(lastDayVol / lastDayFeeds) : 0;
  const firstDayFeeds = stats.days[0]?.feedCount ?? 1;
  const avgFirstDay = firstDayFeeds > 0 ? Math.round(firstDayVol / firstDayFeeds) : 0;

  return `
    <div class="kpi">
      <div class="kpi-label">Total Volume</div>
      <div class="kpi-value">${esc(t.totalVolumeMl)}</div>
      <div class="kpi-sub">mL · ${esc(t.feedCount)} feeds</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Avg / Feed</div>
      <div class="kpi-value">${esc(t.avgPerFeedMl)}</div>
      <div class="kpi-sub">mL · ${avgFirstDay}→${avgLastDay} trend</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Peak Feed</div>
      <div class="kpi-value">${esc(t.peakFeedMl)}</div>
      <div class="kpi-sub">mL${t.peakFeedWhen ? ' · ' + esc(t.peakFeedWhen) : ''}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Wet Diapers</div>
      <div class="kpi-value">${esc(t.wetCount)}</div>
      <div class="kpi-sub">${stats.wetDiaperThresholds.every(x => x.met) ? 'AAP minimum ✓' : 'Below AAP minimum'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Stools</div>
      <div class="kpi-value">${esc(t.stoolCount)}</div>
      <div class="kpi-sub">${esc(stoolTransitionHint(stats))}</div>
    </div>
    <div class="kpi navy-border">
      <div class="kpi-label">Pump Sessions</div>
      <div class="kpi-value">${esc(t.pumpCount)}</div>
      <div class="kpi-sub">Supply establishment</div>
    </div>`;
}

function stoolTransitionHint(stats: ReportStats): string {
  const colors = stats.stoolProgression.map(s => s.description.toLowerCase());
  const hasYellow = colors.some(c => c.includes('yellow'));
  const hasBrown = colors.some(c => c.includes('brown'));
  if (hasYellow && hasBrown) return 'Brown → Yellow';
  if (hasYellow) return 'Yellow';
  if (hasBrown) return 'Brown';
  if (colors.length > 0) return 'Logged';
  return '—';
}

export function fallbackAIContent(stats: ReportStats): AIContent {
  const t = stats.totals;
  return {
    executiveSummary: `Descriptive summary (AI unavailable): ${t.totalVolumeMl} mL across ${t.feedCount} feeds over ${stats.range.dayCount} day(s). ${t.wetCount} wet diapers and ${t.stoolCount} stool events logged. ${t.pumpCount} pump sessions recorded. No interpretation provided — please consult your pediatrician or lactation consultant for clinical insight.`,
    volumeInsight: `${t.totalVolumeMl} mL total; avg ${t.avgPerFeedMl} mL per feed.`,
    timelineInsight: `${t.feedCount} feeds logged across the reporting window.`,
    diaperInsight: `${t.wetCount} wet, ${t.stoolCount} stool diapers logged.`,
    assessment: [
      { key: 'intake', title: 'Intake Volume', body: `${t.totalVolumeMl} mL across ${t.feedCount} feeds. Peak feed ${t.peakFeedMl} mL.`, color: 'green' },
      { key: 'frequency', title: 'Feed Frequency', body: `${t.feedCount} feeds / ${stats.range.dayCount} day(s).`, color: 'green' },
      { key: 'hydration', title: 'Hydration', body: `${t.wetCount} wet diapers logged. AAP minimum ${stats.wetDiaperThresholds.every(x => x.met) ? 'met' : 'not met'} across all days.`, color: stats.wetDiaperThresholds.every(x => x.met) ? 'green' : 'amber' },
      { key: 'gutTransit', title: 'Gut Transit', body: `${t.stoolCount} stool events.`, color: 'green' },
      { key: 'volumeTrend', title: 'Volume Trend', body: `${stats.volumeTrend.map(v => v.volumeMl).join(' → ')} mL per day.`, color: 'green' },
      { key: 'supplyChain', title: 'Supply Chain', body: `${t.pumpCount} pump sessions recorded.`, color: 'green' },
    ],
  };
}

export interface RenderOptions {
  reportTitle?: string; // e.g. "Day 4 Report"
  generatedAt?: Date;
  consultantPhone?: string;
}

export function renderReportHTML(
  stats: ReportStats,
  ai: AIContent,
  opts: RenderOptions = {},
): string {
  const title = opts.reportTitle ?? `${stats.range.dayCount}-Day Feeding Report`;
  const generated = (opts.generatedAt ?? new Date()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const consultantPhone = opts.consultantPhone ?? '954-844-9908';

  const feedingModelLabel = {
    'exclusive-breast': 'direct breastfeeding',
    'exclusive-bottle': 'bottle feeding',
    'mixed': 'mixed breast + bottle feeding',
    'breast-with-bottle-supplement': 'expressed breastmilk via bottle',
  }[stats.feedingModel];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(stats.baby.name)} — ${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A4A;
    --amber: #D4920B;
    --bg: #FFFFFF;
    --bg-muted: #F5F6F8;
    --text: #2C2C2C;
    --muted: #8891A0;
    --green: #1A7A3C;
    --green-bg: #EEFAF0;
    --red: #B81C1C;
    --red-bg: #FDECEC;
    --mixed: #C47F0A;
    --mixed-bg: #FFF8E1;
    --border: #E2E4E8;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: letter; margin: 0.5in 0.55in; }
  body { font-family: 'DM Sans', sans-serif; color: var(--text); background: var(--bg); -webkit-font-smoothing: antialiased; font-size: 11px; line-height: 1.45; }
  .page { max-width: 780px; margin: 0 auto; padding: 24px 28px 20px; }
  @media print { body { font-size: 10.5px; } .page { padding: 0; max-width: 100%; } .no-print { display: none !important; } }

  .ai-disclaimer {
    background: #FEF3C7;
    border: 2px solid #D97706;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 10px;
    line-height: 1.5;
    color: #78350F;
  }
  .ai-disclaimer strong {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #92400E;
    margin-bottom: 3px;
    font-weight: 700;
  }

  .header { border-top: 3px solid var(--navy); padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; }
  .header-left h1 { font-size: 22px; font-weight: 700; color: var(--navy); letter-spacing: -0.4px; line-height: 1.15; }
  .header-left .subtitle { font-size: 10px; font-weight: 600; letter-spacing: 1.2px; color: var(--muted); text-transform: uppercase; margin-bottom: 2px; }
  .header-right { text-align: right; font-size: 10px; color: var(--muted); line-height: 1.5; }

  .verdict { background: var(--bg-muted); border-left: 4px solid var(--amber); padding: 10px 14px; border-radius: 0 5px 5px 0; margin-bottom: 14px; }
  .verdict-label { font-size: 9px; font-weight: 700; color: var(--amber); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 2px; }
  .verdict p { font-size: 11.5px; font-weight: 600; color: var(--navy); line-height: 1.4; }

  .kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi { border-left: 3px solid var(--green); background: var(--bg-muted); padding: 8px 10px; border-radius: 0 4px 4px 0; }
  .kpi.navy-border { border-left-color: var(--navy); }
  .kpi.amber-border { border-left-color: var(--mixed); }
  .kpi-label { font-size: 8px; font-weight: 600; color: var(--muted); letter-spacing: 0.8px; text-transform: uppercase; }
  .kpi-value { font-size: 20px; font-weight: 700; color: var(--navy); font-family: 'DM Mono', monospace; line-height: 1.2; margin-top: 1px; }
  .kpi-sub { font-size: 8.5px; color: var(--muted); margin-top: 1px; }

  .section-header { font-size: 9px; font-weight: 700; color: var(--muted); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px solid var(--border); }
  .section-insight { font-size: 10px; font-weight: 600; color: var(--navy); margin-bottom: 8px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }

  .vol-chart { display: flex; align-items: flex-end; gap: 10px; min-height: 140px; padding: 0 4px; }
  .vol-bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .vol-bar-val { font-size: 11px; font-weight: 700; color: var(--navy); font-family: 'DM Mono', monospace; margin-bottom: 2px; }
  .vol-bar { width: 100%; max-width: 56px; border-radius: 3px 3px 0 0; }
  .vol-bar-label { font-size: 9px; font-weight: 600; color: var(--navy); margin-top: 3px; }
  .vol-bar-sub { font-size: 8px; color: var(--muted); }

  .feed-timeline { display: flex; flex-direction: column; gap: 2px; }
  .feed-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .feed-time { width: 50px; font-size: 9px; color: var(--muted); font-family: 'DM Mono', monospace; flex-shrink: 0; }
  .feed-bar { height: 8px; border-radius: 2px; min-width: 2px; }
  .feed-ml { font-size: 9px; font-weight: 600; color: var(--navy); font-family: 'DM Mono', monospace; }
  .feed-day-label { font-size: 8px; font-weight: 700; color: var(--amber); letter-spacing: 0.8px; text-transform: uppercase; margin-top: 4px; margin-bottom: 2px; }

  .diaper-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin-bottom: 10px; }
  .diaper-card { background: var(--bg-muted); border-radius: 4px; padding: 8px 10px; }
  .diaper-card-day { font-size: 8px; font-weight: 700; color: var(--amber); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px; }
  .diaper-stat { display: flex; gap: 12px; }
  .diaper-num { font-size: 18px; font-weight: 700; color: var(--navy); font-family: 'DM Mono', monospace; line-height: 1; }
  .diaper-type { font-size: 8px; color: var(--muted); }
  .diaper-check { font-size: 8px; font-weight: 600; }
  .diaper-check.ok { color: var(--green); }
  .diaper-check.warn { color: var(--red); }

  .stool-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-left: 3px solid var(--mixed); border-radius: 0 3px 3px 0; margin-bottom: 3px; background: var(--bg-muted); }
  .stool-row.favorable { border-left-color: var(--green); }
  .stool-day { font-size: 10px; font-weight: 700; color: var(--navy); width: 44px; }
  .stool-dol { font-size: 8px; color: var(--muted); width: 44px; }
  .stool-desc { font-size: 10px; color: var(--text); flex: 1; }
  .stool-badge { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; padding: 1px 6px; border-radius: 8px; }
  .stool-badge.normal { background: var(--mixed-bg); color: var(--mixed); }
  .stool-badge.favorable { background: var(--green-bg); color: var(--green); }

  .assessment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .assess-item { border-left: 3px solid var(--green); padding: 6px 10px; border-radius: 0 4px 4px 0; background: var(--bg-muted); }
  .assess-item.amber { border-left-color: var(--mixed); }
  .assess-item.red { border-left-color: var(--red); background: var(--red-bg); }
  .assess-title { font-size: 9.5px; font-weight: 700; color: var(--navy); display: flex; align-items: center; gap: 4px; }
  .assess-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .assess-dot.green { background: var(--green); }
  .assess-dot.amber { background: var(--mixed); }
  .assess-dot.red { background: var(--red); }
  .assess-body { font-size: 9px; color: var(--text); margin-top: 2px; line-height: 1.4; }

  .footer { margin-top: 12px; padding-top: 6px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: var(--muted); }
  .footer-consult { font-weight: 600; color: var(--navy); }
  .footer-ai-note {
    margin-top: 8px;
    padding: 6px 10px;
    background: #FEF3C7;
    border-radius: 4px;
    font-size: 9px;
    color: #78350F;
    font-weight: 600;
    text-align: center;
  }
</style>
</head>
<body>
<div class="page">

  <div class="ai-disclaimer">
    <strong>⚠ AI-generated interpretation — not medical advice</strong>
    The prose in this report (executive summary, insights, and assessment commentary) is generated by an AI model from your logged data. Numbers and charts are computed directly from your entries. AI can misinterpret patterns or miss clinically relevant context. <strong style="display:inline; text-transform:none; letter-spacing:0; font-size:10px;">Always consult your pediatrician or lactation consultant for medical decisions.</strong>
  </div>

  <div class="header">
    <div class="header-left">
      <div class="subtitle">Feeding Tracker by db · AI-assisted report</div>
      <h1>${esc(stats.baby.name)} — ${esc(title)}</h1>
    </div>
    <div class="header-right">
      Born ${esc(new Date(stats.baby.dob + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}<br>
      Data: ${esc(stats.range.startLabel)}–${esc(stats.range.endLabel)}<br>
      Age at report: ${esc(stats.baby.ageDaysAtReport)} days
    </div>
  </div>

  <div class="verdict">
    <div class="verdict-label">Executive Summary · AI-generated</div>
    <p>${esc(ai.executiveSummary)}</p>
  </div>

  <div class="kpi-row">
    ${kpiRow(stats)}
  </div>

  <div class="two-col">
    <div>
      <div class="section-header">Daily Intake Volume</div>
      <div class="section-insight">${esc(ai.volumeInsight)}</div>
      ${renderVolumeChart(stats)}
      <div style="font-size:8px; color:var(--muted); margin-top:4px;">Feeding model: ${esc(feedingModelLabel)}</div>
    </div>

    <div>
      <div class="section-header">Feed-by-Feed Timeline</div>
      <div class="section-insight">${esc(ai.timelineInsight)}</div>
      ${renderFeedTimeline(stats)}
    </div>
  </div>

  <div class="two-col">
    <div>
      <div class="section-header">Diaper Output</div>
      <div class="section-insight">${esc(ai.diaperInsight)}</div>
      ${renderDiaperGrid(stats)}

      <div class="section-header" style="margin-top:6px;">Stool Color Progression</div>
      ${renderStoolProgression(stats)}
    </div>

    <div>
      <div class="section-header">Clinical Assessment · AI-generated</div>
      <div class="section-insight">Six-dimension check. AI-interpreted — verify with your clinician.</div>
      <div class="assessment-grid">
        ${renderAssessment(ai)}
      </div>
    </div>
  </div>

  <div class="footer-ai-note">
    ⚠ This report contains AI-generated interpretation. Always consult your pediatrician or lactation consultant before acting on anything written here.
  </div>

  <div class="footer">
    <div>Feeding Tracker by db · Generated ${esc(generated)} · Not medical advice</div>
    <div>Lactation consultant: <span class="footer-consult">${esc(consultantPhone)}</span></div>
  </div>

</div>
</body>
</html>`;
}
