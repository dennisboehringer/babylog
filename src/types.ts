export interface BabyProfile {
  id: string;
  name: string;
  dob: string; // ISO date
  gender: 'male' | 'female' | 'other';
  themeColor: string; // hex
  unitPreference: 'oz' | 'mL';
  reminderIntervalMinutes: number;
  // DEPRECATED — kept for backwards compat with synced records. NewbornHome
  // now infers split-hero mode from recent pump activity (last 7 days), per
  // Jony/Jobs "premium = restraint, infer don't ask."
  showPumpHero?: boolean;
  // IBCLC: default true (alternate sides). Off = single-side per feed at full
  // breast (foremilk/hindmilk balance). When false, the home hides the
  // "next side" suggestion and shows totals only.
  alternateSides?: boolean;
  createdAt: number;

  // --- Stage system (lifecycle: newborn → weaning → toddler → preschool) ---
  // All optional so existing profiles keep working unchanged.
  // 'auto' (default when undefined): UI shows the stage in `lastAcceptedStage`;
  // when `stageFromAge(dob)` differs, Home prompts the parent to confirm.
  // 'manual': UI uses `stageOverride` regardless of age.
  stagePolicy?: 'auto' | 'manual';
  stageOverride?: Stage;
  lastAcceptedStage?: Stage;

  // Per-profile target overrides. When undefined, STAGE_DEFAULTS apply.
  nutritionTargets?: NutritionTargets;
  drinkTargets?: DrinkTargets;

  // 'auto' (default) = on for newborn/weaning, off for toddler+.
  diaperTracking?: 'auto' | 'on' | 'off' | 'potty-training';
}

// =============================================================================
// STAGES
// =============================================================================

export type Stage = 'newborn' | 'weaning' | 'toddler' | 'preschool';

// Auto-stage derivation. Boundaries are deliberate, not pediatric prescriptions —
// see STAGE_DEFAULTS for nutrition starting points.
export function stageFromAge(dobIso: string, now: number = Date.now()): Stage {
  const ageMonths = (now - new Date(dobIso).getTime()) / (30.44 * 86400000);
  if (ageMonths < 4)  return 'newborn';
  if (ageMonths < 12) return 'weaning';
  if (ageMonths < 36) return 'toddler';
  return 'preschool';
}

// What the UI actually shows. UI never silently flips — when this differs from
// `lastAcceptedStage` under the 'auto' policy, Home shows a transition prompt
// the parent must confirm.
export function effectiveStage(p: BabyProfile, now: number = Date.now()): Stage {
  if (p.stagePolicy === 'manual' && p.stageOverride) return p.stageOverride;
  return p.lastAcceptedStage ?? stageFromAge(p.dob, now);
}

export type MilkType = 'formula' | 'breastmilk';

export interface FeedEntry {
  id: string;
  babyId: string;
  type: 'breast' | 'bottle';
  timestamp: number;
  leftDurationSec: number | null;
  rightDurationSec: number | null;
  leftOz: number | null;
  rightOz: number | null;
  lastSide: 'left' | 'right' | null;
  amount: number | null;
  unit: 'oz' | 'mL';
  milkType: MilkType | null;
  notes: string | null;
  createdAt: number;
  modifiedAt?: number;
  loggedBy?: string;  // caregiver display name from this device's Settings
}

export interface DiaperEntry {
  id: string;
  babyId: string;
  timestamp: number;
  type: 'wet' | 'stool' | 'both';
  stoolColor: 'yellow' | 'green' | 'brown' | 'black' | null;
  stoolConsistency: 'seedy' | 'runny' | 'formed' | 'mucousy' | null;
  notes: string | null;
  createdAt: number;
  modifiedAt?: number;
  loggedBy?: string;
}

export interface PumpEntry {
  id: string;
  babyId: string;
  timestamp: number;
  side: 'left' | 'right' | 'both';
  amount: number | null;
  unit: 'oz' | 'mL';
  durationSec: number | null;
  notes: string | null;
  createdAt: number;
  modifiedAt?: number;
  loggedBy?: string;
}

export type EntryType = 'feed' | 'diaper' | 'pump' | 'meal' | 'drink';

export interface TimelineEntry {
  id: string;
  entryType: EntryType;
  timestamp: number;
  entry: FeedEntry | DiaperEntry | PumpEntry | MealEntry | DrinkEntry;
}

// =============================================================================
// MEALENTRY — toddler+ primary food log
// =============================================================================

export interface MealEntry {
  id: string;
  babyId: string;
  timestamp: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
  source: 'photo-ai' | 'manual' | 'preset';

  // Photo: blob lives in local-only `photoBlobs` table, never synced.
  // `hasPhoto` is synced so other devices know a photo exists somewhere.
  photoBlobId: string | null;
  hasPhoto: boolean;

  foods: FoodItem[];
  totals: NutritionTotals;     // denormalized sum of foods; recompute on edit

  aiModel: string | null;       // e.g. "claude-sonnet-4-6", null if manual
  aiConfidence: number | null;  // 0..1 mean across foods, null if manual

  notes: string | null;
  createdAt: number;
  modifiedAt?: number;
  loggedBy?: string;
}

export interface FoodItem {
  name: string;                                    // e.g. "whole milk yogurt"
  grams: number | null;                            // estimated portion
  source: 'ai' | 'user' | 'usda-pick';             // who supplied this row
  confidence: number | null;                       // 0..1, AI confidence

  // Nutrition — populated from a database lookup, NEVER from the LLM.
  // Primary source: USDA FoodData Central. Fallback: Open Food Facts (Europe-led).
  // null = unknown (not zero).
  nutritionSource: 'usda' | 'off' | null;
  fdcId: number | null;                            // populated when nutritionSource === 'usda'
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

export interface NutritionTotals {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  iron_mg: number;
  calcium_mg: number;
  vitD_iu: number;
}

export interface NutritionTargets {
  kcal?: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  fiber_g?: number;
  iron_mg?: number;
  calcium_mg?: number;
  vitD_iu?: number;
  // Note: sugar is intentionally not targeted — Pediatric Safety. Surfaced as
  // informational only.
}

// =============================================================================
// DRINKENTRY — milk (toddler-stage cow/oat/etc.) + water + other
// =============================================================================

export interface DrinkEntry {
  id: string;
  babyId: string;
  timestamp: number;
  kind: DrinkKind;
  amount: number;
  unit: 'oz' | 'mL';
  notes: string | null;
  createdAt: number;
  modifiedAt?: number;
  loggedBy?: string;
}

// 'milk' is the generic default for the toddler quick-add. The user can pick
// a specific milk type if they want, but we don't preselect cow milk — IBCLC
// veto: a default toward cow nudges weaning earlier than the parent intends
// for 12–13 month olds still nursing.
export type DrinkKind =
  | 'milk'
  | 'milk-cow'
  | 'milk-breast'
  | 'milk-formula'
  | 'milk-oat'
  | 'milk-soy'
  | 'milk-other'
  | 'water'
  | 'juice'
  | 'other';

export interface DrinkTargets {
  milk_oz?: number;
  water_oz?: number;
}

// =============================================================================
// SLEEPENTRY — schema only. No Dexie table in this artifact, no UI.
// Reserved for native HealthKit ingestion in the iOS rewrite.
// =============================================================================

export interface SleepEntry {
  id: string;
  babyId: string;
  start: number;
  end: number | null;            // null = in-progress
  kind: 'night' | 'nap';
  source: 'manual' | 'healthkit';
  notes: string | null;
  createdAt: number;
  modifiedAt?: number;
}

// =============================================================================
// PHOTOBLOB — local-only photo storage. NEVER synced.
// =============================================================================

export interface PhotoBlob {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

// =============================================================================
// STAGE DEFAULTS — starting points, NOT prescriptions.
// Sources: AAP / USDA Dietary Guidelines for Americans 2020-2025 (rough heuristics).
// User-facing copy must always frame these as starting points, not targets.
// =============================================================================

export const STAGE_DEFAULTS: Record<Stage, {
  nutrition: Required<NutritionTargets>;
  drinks: Required<DrinkTargets>;
  diaperTrackingDefault: NonNullable<BabyProfile['diaperTracking']>;
}> = {
  newborn: {
    nutrition: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, iron_mg: 0, calcium_mg: 0, vitD_iu: 0 },
    drinks: { milk_oz: 24, water_oz: 0 },
    diaperTrackingDefault: 'on',
  },
  weaning: {
    nutrition: { kcal: 700, protein_g: 11, fat_g: 30, carbs_g: 95, fiber_g: 5, iron_mg: 11, calcium_mg: 260, vitD_iu: 400 },
    drinks: { milk_oz: 20, water_oz: 4 },
    diaperTrackingDefault: 'on',
  },
  toddler: {
    nutrition: { kcal: 1000, protein_g: 13, fat_g: 35, carbs_g: 130, fiber_g: 14, iron_mg: 7, calcium_mg: 700, vitD_iu: 600 },
    drinks: { milk_oz: 20, water_oz: 16 },
    diaperTrackingDefault: 'off',
  },
  preschool: {
    nutrition: { kcal: 1300, protein_g: 19, fat_g: 40, carbs_g: 170, fiber_g: 17, iron_mg: 10, calcium_mg: 1000, vitD_iu: 600 },
    drinks: { milk_oz: 16, water_oz: 24 },
    diaperTrackingDefault: 'off',
  },
};

export interface StoredReport {
  id: string;
  babyId: string;
  generatedAt: number;
  rangeStart: number;
  rangeEnd: number;
  rangeLabel: string;      // "Apr 12–14, 2026" — pre-formatted for list display
  title: string;           // "Day 4 Report" or custom
  html: string;            // fully self-contained HTML, re-downloadable
  statsJSON: string;       // serialized ReportStats, for debugging / regeneration
  aiGenerated: boolean;    // false = deterministic fallback was used
}
