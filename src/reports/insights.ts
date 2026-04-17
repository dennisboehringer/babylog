// Static "Did you know" tips keyed to day-of-life, plus localStorage cache
// for the one AI-generated observation per day. The Chat tab renders the
// static tip immediately; the AI observation arrives behind it and is cached
// so we don't pay a Claude round-trip every time the tab is opened.

export interface StaticTip {
  title: string;
  body: string;
}

/**
 * Pick the best-matching static tip for the given day-of-life.
 * Ranges are inclusive on both ends. The first match wins, so list them in
 * order of narrowest → broadest if they overlap (here they don't).
 */
export function pickStaticTip(dayOfLife: number): StaticTip {
  for (const row of STATIC_TIPS) {
    if (dayOfLife >= row.from && dayOfLife <= row.to) {
      return { title: row.title, body: row.body };
    }
  }
  return STATIC_TIPS[STATIC_TIPS.length - 1];
}

const STATIC_TIPS: { from: number; to: number; title: string; body: string }[] = [
  { from: 0, to: 1,
    title: 'Meconium days',
    body: 'Most babies pass meconium — dark, sticky, tar-like stools — in the first 24 hours. Expect at least one wet and one dirty diaper today.' },
  { from: 2, to: 2,
    title: 'Colostrum is enough',
    body: 'A baby\'s stomach on day 2 holds about a teaspoon. Colostrum is low-volume and high-potency by design. Expect 2+ wet diapers today.' },
  { from: 3, to: 4,
    title: 'Milk is coming in',
    body: 'Mature milk typically transitions in around day 3–4. Breast fullness, heavier feel, and more audible swallowing are normal signs.' },
  { from: 5, to: 6,
    title: '6 wet diapers a day',
    body: 'From day 5 onward the AAP minimum is 6 wet diapers per 24h. Stools should also shift from dark/sticky to looser yellow.' },
  { from: 7, to: 10,
    title: 'Cluster feeding is normal',
    body: 'Many short feeds back-to-back, especially in the evening, are a sign of regulation — not low supply. It often coincides with the first growth spurt.' },
  { from: 11, to: 14,
    title: 'Back to birth weight',
    body: 'Most babies regain their birth weight by day 14. If your pediatrician has weighed recently, this is the usual benchmark.' },
  { from: 15, to: 21,
    title: '3-week growth spurt',
    body: 'A growth spurt around weeks 2–3 is common — more feeding, more fussiness, more short naps. It passes within a few days.' },
  { from: 22, to: 35,
    title: 'Peak fussiness window',
    body: 'Daily fussiness peaks around week 6 for most babies and is not usually hunger-related. A 6-week growth spurt is also common here.' },
  { from: 36, to: 56,
    title: 'Finding a rhythm',
    body: 'Around 8 weeks most babies start stretching feeds to every 3–4 hours during the day. Day/night rhythm begins to emerge.' },
  { from: 57, to: 90,
    title: '3-month growth spurt',
    body: 'Another growth spurt often shows up near 3 months. Social smiling should be well established by now.' },
  { from: 91, to: 120,
    title: '4-month changes',
    body: 'The "4-month sleep regression" is real — feeds may briefly look disorganized again as the baby\'s sleep architecture matures.' },
  { from: 121, to: 179,
    title: 'Approaching solids',
    body: 'Signs of solids readiness — sitting with support, interest in food, loss of tongue-thrust reflex — typically appear between 4 and 6 months.' },
  { from: 180, to: 10_000,
    title: 'Solids alongside milk',
    body: 'Solids can begin around 6 months. Milk remains the primary source of nutrition through the first year — solids complement, not replace.' },
];

// ─── AI insight cache ────────────────────────────────────────────────────────

export interface CachedInsight {
  text: string;
  generatedAt: number;
}

const CACHE_PREFIX = 'babylog_insight_';

function cacheKey(babyId: string, dateISO: string): string {
  return `${CACHE_PREFIX}${babyId}_${dateISO}`;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCachedInsight(babyId: string): CachedInsight | null {
  try {
    const raw = localStorage.getItem(cacheKey(babyId, todayISO()));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedInsight(babyId: string, text: string): void {
  try {
    const entry: CachedInsight = { text, generatedAt: Date.now() };
    localStorage.setItem(cacheKey(babyId, todayISO()), JSON.stringify(entry));
    // Clean up stale entries for this baby (keep only today).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${CACHE_PREFIX}${babyId}_`) && k !== cacheKey(babyId, todayISO())) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore — non-critical */
  }
}

export function clearCachedInsight(babyId: string): void {
  try {
    localStorage.removeItem(cacheKey(babyId, todayISO()));
  } catch {
    /* ignore */
  }
}
