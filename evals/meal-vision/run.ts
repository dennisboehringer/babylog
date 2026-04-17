// Meal-vision eval harness.
//
// Usage:
//   ENDPOINT=http://localhost:3000/api/meal-vision tsx evals/meal-vision/run.ts
//
// Iterates every case in cases/, posts each fixture image to the endpoint,
// scores against ground truth, prints a per-case + aggregate report, and
// exits non-zero if acceptance thresholds fail. See rubric.md for scoring.

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, 'cases');
const FIXTURES_DIR = join(HERE, 'fixtures');
const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:3000/api/meal-vision';

const THRESHOLDS = {
  recall: 0.80,
  precision: 0.80,
  portionAccuracy: 0.60,
  hallucinationRate: 0.10,   // hard cap
};

interface CaseFile {
  id: string;
  image: string;
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  context: { stage: string; ageMonths: number; locale: string };
  groundTruth: { foods: Array<{ name: string; grams: number; toleranceGrams: number }> };
}

interface AiFood { name: string; grams: number | null; confidence: number }
interface ApiResponse { foods: AiFood[]; aiConfidence: number; warnings: string[]; timing: { ai_ms: number; usda_ms: number } }

// ---------- fuzzy name match ----------

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
}

function nameOverlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.min(ta.size, tb.size);
}

const NAME_THRESHOLD = 0.5;  // ≥ half the tokens of the smaller name overlap

// ---------- per-case scoring ----------

interface CaseResult {
  id: string;
  recall: number;
  precision: number;
  portionAccuracy: number;
  hallucinationRate: number;
  aiConfidence: number;
  ai_ms: number;
  matched: number;
  truthCount: number;
  aiCount: number;
}

function scoreCase(c: CaseFile, resp: ApiResponse): CaseResult {
  const truth = c.groundTruth.foods;
  const ai = resp.foods;

  // Greedy bipartite match by name overlap, prefer best matches first.
  const usedAi = new Set<number>();
  const matches: Array<{ truth: typeof truth[number]; aiIdx: number }> = [];
  for (const t of truth) {
    let bestIdx = -1, bestScore = NAME_THRESHOLD;
    ai.forEach((a, i) => {
      if (usedAi.has(i)) return;
      const s = nameOverlap(t.name, a.name);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    if (bestIdx >= 0) {
      usedAi.add(bestIdx);
      matches.push({ truth: t, aiIdx: bestIdx });
    }
  }

  const matched = matches.length;
  const recall = truth.length > 0 ? matched / truth.length : 1;
  const precision = ai.length > 0 ? matched / ai.length : 0;

  const portionEval = matches.filter(m => ai[m.aiIdx]!.grams != null);
  const portionHits = portionEval.filter(m =>
    Math.abs((ai[m.aiIdx]!.grams ?? 0) - m.truth.grams) <= m.truth.toleranceGrams
  ).length;
  const portionAccuracy = portionEval.length > 0 ? portionHits / portionEval.length : 1;

  const hallucinationRate = ai.length > 0 ? (ai.length - matched) / ai.length : 0;

  return {
    id: c.id,
    recall, precision, portionAccuracy, hallucinationRate,
    aiConfidence: resp.aiConfidence,
    ai_ms: resp.timing.ai_ms,
    matched, truthCount: truth.length, aiCount: ai.length,
  };
}

// ---------- runner ----------

async function loadCases(): Promise<CaseFile[]> {
  let entries: string[];
  try { entries = await readdir(CASES_DIR); }
  catch { return []; }
  const cases: CaseFile[] = [];
  for (const f of entries.filter(f => f.endsWith('.json'))) {
    const txt = await readFile(join(CASES_DIR, f), 'utf-8');
    cases.push(JSON.parse(txt) as CaseFile);
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

async function runCase(c: CaseFile): Promise<ApiResponse | null> {
  const buf = await readFile(join(FIXTURES_DIR, c.image.replace(/^fixtures\//, '')));
  const image = buf.toString('base64');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, imageMimeType: c.imageMimeType, context: c.context }),
  });
  if (!res.ok) {
    console.error(`  ${c.id}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return await res.json() as ApiResponse;
}

function pct(n: number): string { return (n * 100).toFixed(0) + '%'; }

async function main() {
  const cases = await loadCases();
  if (cases.length === 0) {
    console.log('No cases in cases/. Add at least one .json + matching fixture before running.');
    process.exit(0);
  }
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Running ${cases.length} cases…\n`);

  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`  ${c.id} … `);
    const resp = await runCase(c);
    if (!resp) continue;
    const r = scoreCase(c, resp);
    results.push(r);
    console.log(
      `R=${pct(r.recall)} P=${pct(r.precision)} Portion=${pct(r.portionAccuracy)} ` +
      `Halluc=${pct(r.hallucinationRate)} conf=${r.aiConfidence.toFixed(2)} ` +
      `(${r.matched}/${r.truthCount} truth, ${r.aiCount} ai, ${r.ai_ms}ms)`
    );
  }

  if (results.length === 0) { console.error('\nAll cases failed to run.'); process.exit(2); }

  const avg = (k: keyof CaseResult) =>
    results.reduce((s, r) => s + (r[k] as number), 0) / results.length;

  const recall = avg('recall');
  const precision = avg('precision');
  const portionAccuracy = avg('portionAccuracy');
  const hallucinationRate = avg('hallucinationRate');
  const overall = 0.4 * recall + 0.3 * precision + 0.3 * portionAccuracy;

  console.log('\n— Aggregate —');
  console.log(`  Recall:            ${pct(recall)}            (≥ ${pct(THRESHOLDS.recall)})`);
  console.log(`  Precision:         ${pct(precision)}            (≥ ${pct(THRESHOLDS.precision)})`);
  console.log(`  Portion accuracy:  ${pct(portionAccuracy)}            (≥ ${pct(THRESHOLDS.portionAccuracy)})`);
  console.log(`  Hallucination rt:  ${pct(hallucinationRate)}            (≤ ${pct(THRESHOLDS.hallucinationRate)})`);
  console.log(`  Overall score:     ${pct(overall)}`);

  const fails = [
    hallucinationRate > THRESHOLDS.hallucinationRate && 'hallucination cap exceeded',
    recall < THRESHOLDS.recall && 'recall below threshold',
    precision < THRESHOLDS.precision && 'precision below threshold',
    portionAccuracy < THRESHOLDS.portionAccuracy && 'portion accuracy below threshold',
  ].filter(Boolean) as string[];

  if (fails.length > 0) {
    console.error(`\nFAIL: ${fails.join('; ')}`);
    process.exit(1);
  } else {
    console.log('\nPASS');
  }
}

main().catch(err => { console.error(err); process.exit(2); });
