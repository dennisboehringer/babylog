// Nutrition lookup helper — USDA FoodData Central (primary) + Open Food Facts
// (fallback). Used by /api/meal-vision to populate FoodItem nutrition fields.
//
// Source order: USDA Foundation/SR Legacy → USDA Branded → Open Food Facts.
// USDA wins for whole foods (authoritative); OFF covers European/branded gaps.
//
// Required env vars:
//   USDA_FDC_API_KEY  — free at https://api.data.gov/signup/

// =============================================================================
// Types matching the FoodItem shape in src/types.ts (kept in sync manually —
// this is an Edge function so we cannot import from src/).
// =============================================================================

export interface NutritionResult {
  nutritionSource: 'usda' | 'off' | null;
  fdcId: number | null;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  vitD_iu: number | null;
}

const EMPTY: NutritionResult = {
  nutritionSource: null,
  fdcId: null,
  kcal: null,
  protein_g: null,
  fat_g: null,
  carbs_g: null,
  fiber_g: null,
  sugar_g: null,
  iron_mg: null,
  calcium_mg: null,
  vitD_iu: null,
};

// In-memory caches. Edge function lifecycle is short, but cuts cost during
// a single user's session.
const usdaSearchCache = new Map<string, number | null>();   // query → fdcId
const usdaNutrCache = new Map<number, NutritionResult>();   // fdcId → per-100g
const offCache = new Map<string, NutritionResult>();        // query → per-100g

// =============================================================================
// Public entry point
// =============================================================================

/** Look up nutrition for a food name and scale to the given portion in grams. */
export async function lookupNutrition(
  name: string,
  grams: number | null,
): Promise<NutritionResult> {
  const per100 = await lookupPer100g(name);
  if (grams == null) return per100;
  return scale(per100, grams / 100);
}

async function lookupPer100g(name: string): Promise<NutritionResult> {
  const usda = await tryUsda(name);
  // Always pull OFF too — cheap parallel call, lets us merge when either source
  // returns a sparse entry (e.g. USDA's "Grapes, raw" record only carries kcal).
  // USDA wins on conflict (research-grade), OFF fills only what USDA left null.
  const off = await tryOff(name);

  if (usda.nutritionSource === 'usda' && isSparse(usda) && off.nutritionSource === 'off') {
    return mergePreferringFirst(usda, off);
  }
  if (usda.nutritionSource === 'usda') return usda;
  if (off.nutritionSource === 'off') return off;
  return EMPTY;
}

// Considered sparse when fewer than 4 of the 6 core macros/micros are populated.
// kcal alone is not enough — that's the case the user hit with grapes.
function isSparse(r: NutritionResult): boolean {
  const core: Array<keyof NutritionResult> = ['kcal', 'protein_g', 'fat_g', 'carbs_g', 'iron_mg', 'calcium_mg'];
  const populated = core.filter(k => r[k] != null).length;
  return populated < 4;
}

function mergePreferringFirst(a: NutritionResult, b: NutritionResult): NutritionResult {
  const pick = <K extends keyof NutritionResult>(k: K): NutritionResult[K] =>
    (a[k] != null ? a[k] : b[k]);
  return {
    nutritionSource: a.nutritionSource,  // attribute to the primary source
    fdcId: a.fdcId,
    kcal:       pick('kcal'),
    protein_g:  pick('protein_g'),
    fat_g:      pick('fat_g'),
    carbs_g:    pick('carbs_g'),
    fiber_g:    pick('fiber_g'),
    sugar_g:    pick('sugar_g'),
    iron_mg:    pick('iron_mg'),
    calcium_mg: pick('calcium_mg'),
    vitD_iu:    pick('vitD_iu'),
  };
}

// =============================================================================
// USDA FoodData Central
// =============================================================================

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

// Nutrient IDs we care about (per 100g unless noted by USDA's unitName).
const USDA_NUTRIENT_IDS = {
  kcal:       1008,
  protein_g:  1003,
  fat_g:      1004,
  carbs_g:    1005,
  fiber_g:    1079,
  sugar_g:    2000,
  iron_mg:    1089,  // mg
  calcium_mg: 1087,  // mg
  vitD_ug:    1114,  // μg — convert to IU (×40)
};

async function tryUsda(name: string): Promise<NutritionResult> {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) return EMPTY;

  // 1. Search → fdcId.
  const cachedId = usdaSearchCache.get(name);
  let fdcId: number | null;
  if (cachedId !== undefined) {
    fdcId = cachedId;
  } else {
    fdcId = await usdaSearch(name, key);
    usdaSearchCache.set(name, fdcId);
  }
  if (fdcId == null) return EMPTY;

  // 2. Per-100g nutrient lookup.
  const cached = usdaNutrCache.get(fdcId);
  if (cached) return cached;

  const detail = await usdaDetail(fdcId, key);
  usdaNutrCache.set(fdcId, detail);
  return detail;
}

async function usdaSearch(name: string, key: string): Promise<number | null> {
  // Prefer Foundation + SR Legacy (research-grade, stable). Branded is a
  // fallback if the first search returns nothing.
  for (const dataType of ['Foundation,SR Legacy', 'Branded'] as const) {
    const url = `${USDA_BASE}/foods/search?api_key=${key}`
      + `&query=${encodeURIComponent(name)}`
      + `&pageSize=5&dataType=${encodeURIComponent(dataType)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json() as { foods?: Array<{ fdcId: number }> };
      const top = json.foods?.[0];
      if (top?.fdcId) return top.fdcId;
    } catch {
      // Fall through to next data type or return null.
    }
  }
  return null;
}

async function usdaDetail(fdcId: number, key: string): Promise<NutritionResult> {
  const url = `${USDA_BASE}/food/${fdcId}?api_key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return EMPTY;
    const json = await res.json() as {
      foodNutrients?: Array<{
        nutrient?: { id?: number; unitName?: string };
        amount?: number;
      }>;
    };
    const get = (id: number): number | null => {
      const hit = json.foodNutrients?.find(n => n.nutrient?.id === id);
      return typeof hit?.amount === 'number' ? hit.amount : null;
    };
    const vitD_ug = get(USDA_NUTRIENT_IDS.vitD_ug);
    return {
      nutritionSource: 'usda',
      fdcId,
      kcal:       get(USDA_NUTRIENT_IDS.kcal),
      protein_g:  get(USDA_NUTRIENT_IDS.protein_g),
      fat_g:      get(USDA_NUTRIENT_IDS.fat_g),
      carbs_g:    get(USDA_NUTRIENT_IDS.carbs_g),
      fiber_g:    get(USDA_NUTRIENT_IDS.fiber_g),
      sugar_g:    get(USDA_NUTRIENT_IDS.sugar_g),
      iron_mg:    get(USDA_NUTRIENT_IDS.iron_mg),
      calcium_mg: get(USDA_NUTRIENT_IDS.calcium_mg),
      vitD_iu:    vitD_ug != null ? vitD_ug * 40 : null,  // 1 μg D3 = 40 IU
    };
  } catch {
    return EMPTY;
  }
}

// =============================================================================
// Open Food Facts (European-led, free, branded coverage)
// =============================================================================

const OFF_BASE = 'https://world.openfoodfacts.org';

async function tryOff(name: string): Promise<NutritionResult> {
  const cached = offCache.get(name);
  if (cached) return cached;

  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(name)}`
    + `&search_simple=1&action=process&json=1&page_size=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      offCache.set(name, EMPTY);
      return EMPTY;
    }
    const json = await res.json() as { products?: Array<{ nutriments?: Record<string, number> }> };
    const product = json.products?.find(p => p.nutriments);
    if (!product?.nutriments) {
      offCache.set(name, EMPTY);
      return EMPTY;
    }

    // OFF nutriments are per 100g. Micronutrients are in grams (SI base);
    // convert to mg / IU to match our schema.
    const n = product.nutriments;
    const num = (v: unknown): number | null => typeof v === 'number' ? v : null;
    const iron_g    = num(n['iron_100g']);
    const calcium_g = num(n['calcium_100g']);
    const vitD_g    = num(n['vitamin-d_100g']);

    const result: NutritionResult = {
      nutritionSource: 'off',
      fdcId: null,
      kcal:       num(n['energy-kcal_100g']),
      protein_g:  num(n['proteins_100g']),
      fat_g:      num(n['fat_100g']),
      carbs_g:    num(n['carbohydrates_100g']),
      fiber_g:    num(n['fiber_100g']),
      sugar_g:    num(n['sugars_100g']),
      iron_mg:    iron_g    != null ? iron_g    * 1000          : null,  // g → mg
      calcium_mg: calcium_g != null ? calcium_g * 1000          : null,  // g → mg
      vitD_iu:    vitD_g    != null ? vitD_g    * 1_000_000 * 40 : null, // g → μg → IU
    };
    offCache.set(name, result);
    return result;
  } catch {
    return EMPTY;
  }
}

// =============================================================================
// Scaling
// =============================================================================

function scale(per100: NutritionResult, factor: number): NutritionResult {
  const s = (v: number | null) => v == null ? null : +(v * factor).toFixed(2);
  return {
    nutritionSource: per100.nutritionSource,
    fdcId: per100.fdcId,
    kcal:       s(per100.kcal),
    protein_g:  s(per100.protein_g),
    fat_g:      s(per100.fat_g),
    carbs_g:    s(per100.carbs_g),
    fiber_g:    s(per100.fiber_g),
    sugar_g:    s(per100.sugar_g),
    iron_mg:    s(per100.iron_mg),
    calcium_mg: s(per100.calcium_mg),
    vitD_iu:    s(per100.vitD_iu),
  };
}
