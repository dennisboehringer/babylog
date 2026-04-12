import jsPDF from 'jspdf';
import { db } from './db';
import type { BabyProfile } from './types';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function babyAgeDays(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / 86400000);
}

export async function exportPDF(baby: BabyProfile) {
  const feeds = await db.feeds.where('babyId').equals(baby.id).toArray();
  const diapers = await db.diapers.where('babyId').equals(baby.id).toArray();
  const pumps = await db.pumps.where('babyId').equals(baby.id).toArray();

  feeds.sort((a, b) => a.timestamp - b.timestamp);
  diapers.sort((a, b) => a.timestamp - b.timestamp);
  pumps.sort((a, b) => a.timestamp - b.timestamp);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  let y = 20;

  function checkPage() {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }

  // Header
  doc.setFontSize(18);
  doc.text('BabyLog Report', pw / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(12);
  doc.text(`${baby.name}`, pw / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.text(`Born: ${baby.dob} | Age: ${babyAgeDays(baby.dob)} days`, pw / 2, y, { align: 'center' });
  y += 6;

  const dateRange = feeds.length > 0
    ? `${formatDate(feeds[0].timestamp)} - ${formatDate(feeds[feeds.length - 1].timestamp)}`
    : 'No data';
  doc.text(`Date range: ${dateRange}`, pw / 2, y, { align: 'center' });
  y += 10;

  // Summary
  doc.setFontSize(14);
  doc.text('Summary', 15, y);
  y += 7;
  doc.setFontSize(10);

  const breastFeeds = feeds.filter(f => f.type === 'breast');
  const bottleFeeds = feeds.filter(f => f.type === 'bottle');
  const totalBottleOz = bottleFeeds.reduce((s, f) => s + (f.amount ?? 0), 0);
  const leftCount = breastFeeds.filter(f => f.lastSide === 'left').length;
  const rightCount = breastFeeds.filter(f => f.lastSide === 'right').length;
  const wetCount = diapers.filter(d => d.type === 'wet' || d.type === 'both').length;
  const stoolCount = diapers.filter(d => d.type === 'stool' || d.type === 'both').length;

  const summaryLines = [
    `Total feeds: ${feeds.length} (Breast: ${breastFeeds.length}, Bottle: ${bottleFeeds.length})`,
    `L/R breast balance: L:${leftCount} / R:${rightCount}`,
    `Total bottle volume: ${totalBottleOz.toFixed(1)} ${baby.unitPreference}`,
    `Wet diapers: ${wetCount} | Stools: ${stoolCount}`,
    `Pump sessions: ${pumps.length}`,
  ];

  summaryLines.forEach(line => {
    doc.text(line, 15, y);
    y += 5;
  });
  y += 5;

  // Feed log
  doc.setFontSize(14);
  doc.text('Feed Log', 15, y);
  y += 7;
  doc.setFontSize(8);

  // Table header
  doc.setFont('helvetica', 'bold');
  doc.text('Date', 15, y);
  doc.text('Time', 45, y);
  doc.text('Type', 70, y);
  doc.text('Details', 95, y);
  doc.text('Notes', 145, y);
  doc.setFont('helvetica', 'normal');
  y += 5;

  feeds.forEach(f => {
    checkPage();
    doc.text(formatDate(f.timestamp), 15, y);
    doc.text(formatTime(f.timestamp), 45, y);
    doc.text(f.type, 70, y);
    let detail = '';
    if (f.type === 'breast') {
      const parts = [];
      if (f.leftDurationSec) parts.push(`L:${Math.round(f.leftDurationSec / 60)}m`);
      if (f.rightDurationSec) parts.push(`R:${Math.round(f.rightDurationSec / 60)}m`);
      detail = parts.join(' ');
    } else {
      detail = f.amount ? `${f.amount} ${f.unit}` : '';
    }
    doc.text(detail, 95, y);
    doc.text(f.notes?.slice(0, 30) ?? '', 145, y);
    y += 4;
  });

  y += 5;
  checkPage();

  // Diaper log
  doc.setFontSize(14);
  doc.text('Diaper Log', 15, y);
  y += 7;
  doc.setFontSize(8);

  doc.setFont('helvetica', 'bold');
  doc.text('Date', 15, y);
  doc.text('Time', 45, y);
  doc.text('Type', 70, y);
  doc.text('Color', 95, y);
  doc.text('Consistency', 120, y);
  doc.setFont('helvetica', 'normal');
  y += 5;

  diapers.forEach(d => {
    checkPage();
    doc.text(formatDate(d.timestamp), 15, y);
    doc.text(formatTime(d.timestamp), 45, y);
    doc.text(d.type, 70, y);
    doc.text(d.stoolColor ?? '', 95, y);
    doc.text(d.stoolConsistency ?? '', 120, y);
    y += 4;
  });

  y += 8;
  checkPage();

  // Footer
  doc.setFontSize(9);
  doc.text('Lactation consultant: 954-844-9908', pw / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Generated ${new Date().toLocaleString()} by BabyLog`, pw / 2, y, { align: 'center' });

  doc.save(`babylog-${baby.name.toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function exportCSV(baby: BabyProfile) {
  const feeds = await db.feeds.where('babyId').equals(baby.id).toArray();
  const diapers = await db.diapers.where('babyId').equals(baby.id).toArray();
  const pumps = await db.pumps.where('babyId').equals(baby.id).toArray();

  const allEntries = [
    ...feeds.map(f => ({
      date: formatDate(f.timestamp),
      time: formatTime(f.timestamp),
      type: 'feed',
      subtype: f.type,
      detail: f.type === 'breast'
        ? `L:${f.leftDurationSec ? Math.round(f.leftDurationSec / 60) : 0}m R:${f.rightDurationSec ? Math.round(f.rightDurationSec / 60) : 0}m`
        : `${f.amount ?? ''} ${f.unit}`,
      stoolColor: '',
      stoolConsistency: '',
      notes: f.notes ?? '',
      timestamp: f.timestamp,
    })),
    ...diapers.map(d => ({
      date: formatDate(d.timestamp),
      time: formatTime(d.timestamp),
      type: 'diaper',
      subtype: d.type,
      detail: '',
      stoolColor: d.stoolColor ?? '',
      stoolConsistency: d.stoolConsistency ?? '',
      notes: d.notes ?? '',
      timestamp: d.timestamp,
    })),
    ...pumps.map(p => ({
      date: formatDate(p.timestamp),
      time: formatTime(p.timestamp),
      type: 'pump',
      subtype: p.side,
      detail: p.amount ? `${p.amount} ${p.unit}` : '',
      stoolColor: '',
      stoolConsistency: '',
      notes: p.notes ?? '',
      timestamp: p.timestamp,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const header = 'Date,Time,Type,Subtype,Detail,Stool Color,Stool Consistency,Notes\n';
  const rows = allEntries.map(e =>
    `${e.date},${e.time},${e.type},${e.subtype},"${e.detail}",${e.stoolColor},${e.stoolConsistency},"${e.notes}"`
  ).join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `babylog-${baby.name.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
