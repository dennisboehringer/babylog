// Shared time formatters for timeline rows. Florencia at midnight and a
// caregiver during a handoff both want absolute time, not just "ago" math.

type TFn = (key: string, params?: Record<string, string | number>) => string;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Absolute time of an entry, scoped intelligently:
 *   - today                → "2:34 PM"
 *   - yesterday            → "Yesterday 2:34 PM"
 *   - within last 7 days   → "Mon 2:34 PM"
 *   - older                → "Apr 12, 2:34 PM"
 * Locale-aware via toLocaleTimeString.
 */
export function formatEntryTime(timestamp: number, _t: TFn): string {
  const now = Date.now();
  const today = startOfDay(now);
  const entryDay = startOfDay(timestamp);
  const dayDiff = Math.round((today - entryDay) / 86400000);

  const time = new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff > 1 && dayDiff < 7) {
    const weekday = new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short' });
    return `${weekday} ${time}`;
  }
  const date = new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date}, ${time}`;
}

/**
 * Relative time ("3m ago", "1h 12m ago", "Yesterday"). Used as a secondary,
 * subtle subtitle below the absolute timestamp.
 */
export function formatRelativeShort(timestamp: number, t: TFn): string {
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('time.hoursMinutesAgo', { h, m: min % 60 });
  return t('time.daysAgo', { n: Math.floor(h / 24) });
}
