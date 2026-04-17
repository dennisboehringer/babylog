import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../db';
import { effectiveStage, STAGE_DEFAULTS } from '../types';
import type { MealEntry, DrinkEntry, DiaperEntry, PhotoBlob } from '../types';
import NutritionRingsHero from './NutritionRingsHero';
import NutritionBreakdownCard from './NutritionBreakdownCard';
import DrinkQuickAddSheet from './DrinkQuickAddSheet';
import MealFlow, { ConfidenceChip } from './MealFlow';
import DiaperModal from './DiaperModal';
import ToddlerGuidanceBanner from './ToddlerGuidanceBanner';

type TFn = (key: string, params?: Record<string, string | number>) => string;

function startOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function ozFromAmount(amount: number, unit: 'oz' | 'mL'): number {
  return unit === 'mL' ? amount / 29.5735 : amount;
}

function relTime(ts: number, t: TFn): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('time.hoursMinutesAgo', { h, m: min % 60 });
  return t('time.daysAgo', { n: Math.floor(h / 24) });
}

export default function ToddlerHome() {
  const { activeBaby } = useApp();
  const { syncRemove, setOnRemoteUpdate } = useSync();
  const { t } = useLanguage();

  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [drinks, setDrinks] = useState<DrinkEntry[]>([]);
  const [diapers, setDiapers] = useState<DiaperEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal state
  const [mealOpen, setMealOpen] = useState(false);
  const [mealInitialType, setMealInitialType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack' | undefined>();
  const [editMeal, setEditMeal] = useState<MealEntry | null>(null);
  const [drinkOpen, setDrinkOpen] = useState(false);
  const [drinkInitialKind, setDrinkInitialKind] = useState<'milk' | 'water'>('milk');
  const [editDrink, setEditDrink] = useState<DrinkEntry | null>(null);
  const [diaperOpen, setDiaperOpen] = useState(false);
  const [diaperInitialType, setDiaperInitialType] = useState<'wet' | 'stool'>('wet');
  const [editDiaper, setEditDiaper] = useState<DiaperEntry | null>(null);

  const loadData = useCallback(() => {
    if (!activeBaby) return;
    const start = startOfDay();
    Promise.all([
      db.meals.where('babyId').equals(activeBaby.id).and(m => m.timestamp >= start).toArray(),
      db.drinks.where('babyId').equals(activeBaby.id).and(d => d.timestamp >= start).toArray(),
      db.diapers.where('babyId').equals(activeBaby.id).and(d => d.timestamp >= start).toArray(),
    ]).then(([m, d, dp]) => {
      setMeals(m);
      setDrinks(d);
      setDiapers(dp);
    });
  }, [activeBaby]);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  useEffect(() => {
    setOnRemoteUpdate(() => () => setRefreshKey(k => k + 1));
    return () => setOnRemoteUpdate(null);
  }, [setOnRemoteUpdate]);

  // Cross-component nudge: when the background-photo flow saves a meal via
  // the sticky toast (App shell), reload Home's data.
  useEffect(() => {
    const onSaved = () => setRefreshKey(k => k + 1);
    window.addEventListener('babylog:meal-saved', onSaved);
    return () => window.removeEventListener('babylog:meal-saved', onSaved);
  }, []);

  const handleSaved = useCallback(() => setRefreshKey(k => k + 1), []);

  if (!activeBaby) return null;

  const stage = effectiveStage(activeBaby);
  const defaults = STAGE_DEFAULTS[stage];

  // Targets — per-baby overrides win over stage defaults.
  const kcalTarget = activeBaby.nutritionTargets?.kcal ?? defaults.nutrition.kcal;
  const milkTarget = activeBaby.drinkTargets?.milk_oz ?? defaults.drinks.milk_oz;
  const waterTarget = activeBaby.drinkTargets?.water_oz ?? defaults.drinks.water_oz;

  // Today's totals — aggregate across all meal entries for the ring + breakdown.
  const totals = meals.reduce((acc, m) => ({
    kcal:       acc.kcal       + (m.totals?.kcal       ?? 0),
    protein_g:  acc.protein_g  + (m.totals?.protein_g  ?? 0),
    fat_g:      acc.fat_g      + (m.totals?.fat_g      ?? 0),
    carbs_g:    acc.carbs_g    + (m.totals?.carbs_g    ?? 0),
    fiber_g:    acc.fiber_g    + (m.totals?.fiber_g    ?? 0),
    iron_mg:    acc.iron_mg    + (m.totals?.iron_mg    ?? 0),
    calcium_mg: acc.calcium_mg + (m.totals?.calcium_mg ?? 0),
    vitD_iu:    acc.vitD_iu    + (m.totals?.vitD_iu    ?? 0),
  }), { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, iron_mg: 0, calcium_mg: 0, vitD_iu: 0 });
  // Sugar lives at the food level, not in totals — sum it on the fly. Informational only.
  const sugar_g = meals.reduce(
    (s, m) => s + m.foods.reduce((sf, f) => sf + (f.sugar_g ?? 0), 0),
    0,
  );
  const kcal = totals.kcal;
  const milkOz = drinks
    .filter(d => d.kind === 'milk' || d.kind.startsWith('milk-'))
    .reduce((s, d) => s + ozFromAmount(d.amount, d.unit), 0);
  const waterOz = drinks
    .filter(d => d.kind === 'water')
    .reduce((s, d) => s + ozFromAmount(d.amount, d.unit), 0);

  const mealCount = meals.length;
  const snackCount = meals.filter(m => m.mealType === 'snack').length;

  // Diaper visibility per profile setting (default 'auto' → off for toddler+).
  const diaperPref = activeBaby.diaperTracking ?? 'auto';
  const showDiaper = diaperPref === 'on' || diaperPref === 'potty-training'
    || (diaperPref === 'auto' && (stage === 'newborn' || stage === 'weaning'));

  // Combined timeline.
  type Row =
    | { kind: 'meal'; ts: number; meal: MealEntry }
    | { kind: 'drink'; ts: number; drink: DrinkEntry }
    | { kind: 'diaper'; ts: number; diaper: DiaperEntry };
  const timeline: Row[] = [
    ...meals.map(m => ({ kind: 'meal' as const, ts: m.timestamp, meal: m })),
    ...drinks.map(d => ({ kind: 'drink' as const, ts: d.timestamp, drink: d })),
    ...(showDiaper ? diapers.map(d => ({ kind: 'diaper' as const, ts: d.timestamp, diaper: d })) : []),
  ].sort((a, b) => b.ts - a.ts);

  async function handleDelete(row: Row) {
    if (row.kind === 'meal') {
      // Trust Guardian fix: delete the local photo blob so we don't accumulate
      // orphaned image data when meals are removed. photoBlobs is local-only,
      // so no sync removal needed for the blob itself.
      if (row.meal.photoBlobId) {
        await db.photoBlobs.delete(row.meal.photoBlobId).catch(() => { /* ignore */ });
      }
      await db.meals.delete(row.meal.id);
      syncRemove('meals', row.meal.id);
    } else if (row.kind === 'drink') {
      await db.drinks.delete(row.drink.id);
      syncRemove('drinks', row.drink.id);
    } else {
      await db.diapers.delete(row.diaper.id);
      syncRemove('diapers', row.diaper.id);
    }
    handleSaved();
  }

  return (
    <>
      <div className="flex-1 scrollable px-4 pt-4 pb-4">
        {/* Florencia veto: actions live above the fold. Logging is the constant
            verb; rings / breakdown are check-in surfaces below. */}
        <ToddlerGuidanceBanner
          milkOz={milkOz}
          waterOz={waterOz}
          kcal={kcal}
          kcalTarget={kcalTarget}
        />

        {/* Quick-add: 4 slots — last slot is Diaper if enabled, otherwise Snack */}
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          <QuickButton
            label={t('toddler.quickAdd.meal')}
            icon={<MealIcon />}
            bgClass="bg-accent-green/10"
            textClass="text-accent-green"
            onClick={() => { setMealInitialType(undefined); setMealOpen(true); }}
          />
          <QuickButton
            label={t('toddler.quickAdd.milk')}
            icon={<MilkIcon />}
            bgClass="bg-accent-blue/10"
            textClass="text-accent-blue"
            onClick={() => { setDrinkInitialKind('milk'); setDrinkOpen(true); }}
          />
          <QuickButton
            label={t('toddler.quickAdd.water')}
            icon={<WaterIcon />}
            bgClass="bg-[#33C2D6]/10"
            textClass="text-[#33C2D6]"
            onClick={() => { setDrinkInitialKind('water'); setDrinkOpen(true); }}
          />
          {showDiaper ? (
            <QuickButton
              label={t('toddler.quickAdd.diaper')}
              icon={<DiaperIcon />}
              bgClass="bg-accent-amber/10"
              textClass="text-accent-amber"
              onClick={() => { setDiaperInitialType('wet'); setDiaperOpen(true); }}
            />
          ) : (
            <QuickButton
              label={t('toddler.quickAdd.snack')}
              icon={<SnackIcon />}
              bgClass="bg-accent-amber/10"
              textClass="text-accent-amber"
              onClick={() => { setMealInitialType('snack'); setMealOpen(true); }}
            />
          )}
        </div>

        {/* Rings + breakdown move below the actions — they're check-in surfaces. */}
        <NutritionRingsHero
          kcal={{ current: kcal, target: kcalTarget }}
          milk={{ current: milkOz, target: milkTarget }}
          water={{ current: waterOz, target: waterTarget }}
          unit={activeBaby.unitPreference}
        />

        <NutritionBreakdownCard
          totals={totals}
          targets={{
            kcal:       kcalTarget,
            protein_g:  activeBaby.nutritionTargets?.protein_g  ?? defaults.nutrition.protein_g,
            fat_g:      activeBaby.nutritionTargets?.fat_g      ?? defaults.nutrition.fat_g,
            carbs_g:    activeBaby.nutritionTargets?.carbs_g    ?? defaults.nutrition.carbs_g,
            fiber_g:    activeBaby.nutritionTargets?.fiber_g    ?? defaults.nutrition.fiber_g,
            iron_mg:    activeBaby.nutritionTargets?.iron_mg    ?? defaults.nutrition.iron_mg,
            calcium_mg: activeBaby.nutritionTargets?.calcium_mg ?? defaults.nutrition.calcium_mg,
            vitD_iu:    activeBaby.nutritionTargets?.vitD_iu    ?? defaults.nutrition.vitD_iu,
          }}
          sugar_g={sugar_g}
        />

        {/* Summary chips */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollable pb-1">
          <Chip label={t('toddler.summary.meals')} value={mealCount} accent="green" />
          <Chip label={t('toddler.summary.kcal')} value={Math.round(kcal)} target={kcalTarget} accent="green" />
          <Chip label={t('toddler.summary.milk')} value={fmtOz(milkOz, activeBaby.unitPreference)} target={fmtOz(milkTarget, activeBaby.unitPreference)} accent="blue" />
          <Chip label={t('toddler.summary.water')} value={fmtOz(waterOz, activeBaby.unitPreference)} target={fmtOz(waterTarget, activeBaby.unitPreference)} accent="cyan" />
          <Chip label={t('toddler.summary.snacks')} value={snackCount} accent="amber" />
        </div>

        {/* Today's log */}
        <div>
          <h3 className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2.5">
            {t('home.todaysLog.title')}
          </h3>
          {timeline.length === 0 ? (
            <p className="text-text-muted text-center py-8 text-sm">{t('home.todaysLog.empty')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {timeline.map((row, i) => (
                <TimelineRow
                  key={(row.kind === 'meal' ? row.meal.id : row.kind === 'drink' ? row.drink.id : row.diaper.id) + i}
                  row={row}
                  unit={activeBaby.unitPreference}
                  onDelete={() => handleDelete(row)}
                  onEdit={() => {
                    if (row.kind === 'meal') setEditMeal(row.meal);
                    else if (row.kind === 'drink') setEditDrink(row.drink);
                    else setEditDiaper(row.diaper);
                  }}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <MealFlow
        open={mealOpen}
        onClose={() => setMealOpen(false)}
        onSaved={handleSaved}
        initialMealType={mealInitialType}
      />
      <MealFlow
        open={editMeal !== null}
        onClose={() => setEditMeal(null)}
        onSaved={handleSaved}
        entry={editMeal}
      />
      <DrinkQuickAddSheet
        open={drinkOpen}
        onClose={() => setDrinkOpen(false)}
        onSaved={handleSaved}
        initialKind={drinkInitialKind}
      />
      <DrinkQuickAddSheet
        open={editDrink !== null}
        onClose={() => setEditDrink(null)}
        onSaved={handleSaved}
        initialKind={editDrink?.kind ?? 'milk'}
        entry={editDrink}
      />
      <DiaperModal
        open={diaperOpen}
        onClose={() => setDiaperOpen(false)}
        onSaved={handleSaved}
        initialType={diaperInitialType}
      />
      <DiaperModal
        open={editDiaper !== null}
        onClose={() => setEditDiaper(null)}
        onSaved={handleSaved}
        entry={editDiaper}
      />
    </>
  );
}

// ---------------- summary chip ----------------

function Chip({
  label, value, target, accent,
}: {
  label: string;
  value: string | number;
  target?: string | number;
  accent: 'green' | 'blue' | 'amber' | 'cyan';
}) {
  const colors: Record<string, string> = {
    green: 'border-accent-green/20',
    blue: 'border-accent-blue/20',
    amber: 'border-accent-amber/20',
    cyan: 'border-[#33C2D6]/20',
  };
  return (
    <div className={`glass-card rounded-xl p-3 min-w-[80px] flex-shrink-0 text-center border ${colors[accent]}`}>
      <p className="text-xl font-bold tabular-nums text-text-primary">
        {value}
        {target !== undefined && (
          <span className="text-xs font-normal text-text-muted">/{target}</span>
        )}
      </p>
      <p className="text-[10px] text-text-muted mt-0.5 font-medium uppercase tracking-wider">{label}</p>
    </div>
  );
}

function QuickButton({
  label, icon, bgClass, textClass, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  bgClass: string;
  textClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-2xl py-4 min-h-[80px] transition-all active:scale-95 ${bgClass} ${textClass}`}
    >
      <div className="mb-1.5">{icon}</div>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

// ---------------- timeline rows ----------------

type Row =
  | { kind: 'meal'; ts: number; meal: MealEntry }
  | { kind: 'drink'; ts: number; drink: DrinkEntry }
  | { kind: 'diaper'; ts: number; diaper: DiaperEntry };

function TimelineRow({
  row, unit, onDelete, onEdit, t,
}: {
  row: Row;
  unit: 'oz' | 'mL';
  onDelete: () => void;
  onEdit: () => void;
  t: TFn;
}) {
  const [open, setOpen] = useState(false);
  const loggedBy = row.kind === 'meal' ? row.meal.loggedBy
                 : row.kind === 'drink' ? row.drink.loggedBy
                 : row.diaper.loggedBy;
  return (
    <div>
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center glass-card rounded-xl px-3.5 py-3 gap-3 cursor-pointer transition-colors active:bg-bg-card-hover"
      >
        {row.kind === 'meal' && <MealRowInner meal={row.meal} t={t} />}
        {row.kind === 'drink' && <DrinkRowInner drink={row.drink} unit={unit} t={t} />}
        {row.kind === 'diaper' && <DiaperRowInner diaper={row.diaper} t={t} />}
        <span className="text-xs text-text-muted tabular-nums">{relTime(row.ts, t)}</span>
      </div>
      {open && (
        <div className="flex items-center justify-between gap-2 mt-1.5 mb-1 animate-scale-in">
          {loggedBy ? (
            <span className="text-[11px] text-text-muted px-1">
              {t('timeline.loggedBy', { name: loggedBy })}
            </span>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-xs rounded-xl bg-bg-card text-text-secondary font-medium">
              {t('btn.cancel')}
            </button>
            <button onClick={() => { setOpen(false); onEdit(); }} className="px-4 py-2 text-xs rounded-xl bg-accent-blue/15 text-accent-blue font-medium">
              {t('btn.edit')}
            </button>
            <button onClick={onDelete} className="px-4 py-2 text-xs rounded-xl bg-accent-red/15 text-accent-red font-medium">
              {t('btn.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MealRowInner({ meal, t }: { meal: MealEntry; t: TFn }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    if (meal.photoBlobId) {
      db.photoBlobs.get(meal.photoBlobId).then((p: PhotoBlob | undefined) => {
        if (cancelled || !p) return;
        const url = URL.createObjectURL(p.blob);
        revoke = url;
        setThumb(url);
      });
    }
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [meal.photoBlobId]);

  const summary = meal.foods.length > 0
    ? meal.foods.slice(0, 3).map(f => f.name).join(', ') + (meal.foods.length > 3 ? '…' : '')
    : t('meal.row.empty');
  const kcal = Math.round(meal.totals?.kcal ?? 0);
  const mealLabel = meal.mealType ? t(`meal.type.${meal.mealType}`) : t('meal.type.snack');

  return (
    <>
      {thumb ? (
        <img src={thumb} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
      ) : meal.hasPhoto ? (
        <div className="w-9 h-9 rounded-lg bg-bg-input flex items-center justify-center flex-shrink-0">
          <span className="text-text-muted text-xs">📷</span>
        </div>
      ) : (
        <span className="text-accent-green flex-shrink-0">
          <MealIcon size={20} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{mealLabel} · {summary}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-text-muted tabular-nums">{kcal} kcal</span>
          <span className="text-text-muted">·</span>
          <ConfidenceChip
            confidence={meal.source === 'photo-ai' ? meal.aiConfidence : null}
            t={t}
            compact
          />
        </div>
      </div>
    </>
  );
}

function DrinkRowInner({ drink, unit, t }: { drink: DrinkEntry; unit: 'oz' | 'mL'; t: TFn }) {
  const isWater = drink.kind === 'water';
  const isMilkish = drink.kind === 'milk' || drink.kind.startsWith('milk-');
  const accent = isWater ? 'text-[#33C2D6]' : isMilkish ? 'text-accent-blue' : 'text-text-secondary';
  const amt = unit === 'mL' && drink.unit === 'oz'
    ? `${Math.round(drink.amount * 29.5735)} mL`
    : unit === 'oz' && drink.unit === 'mL'
      ? `${(drink.amount / 29.5735).toFixed(1)} oz`
      : `${drink.amount} ${drink.unit}`;
  return (
    <>
      <span className={`${accent} flex-shrink-0`}>{isWater ? <WaterIcon size={20} /> : <MilkIcon size={20} />}</span>
      <span className="flex-1 text-sm font-medium">{t(`drink.kind.${drink.kind}`)} · {amt}</span>
    </>
  );
}

function DiaperRowInner({ diaper, t }: { diaper: DiaperEntry; t: TFn }) {
  const detail = t(`timeline.diaper.${diaper.type === 'both' ? 'both' : diaper.type}`);
  return (
    <>
      <span className="text-accent-amber flex-shrink-0"><DiaperIcon size={20} /></span>
      <span className="flex-1 text-sm font-medium">{detail}</span>
    </>
  );
}

// ---------------- format ----------------

function fmtOz(oz: number, unit: 'oz' | 'mL'): string {
  if (unit === 'mL') return Math.round(oz * 29.5735).toString();
  return (Math.round(oz * 10) / 10).toString();
}

// ---------------- icons ----------------

function MealIcon({ size = 26 }: { size?: number }) {
  // Plate with utensils.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M3 4l1.5 4.5M3 4v8" />
      <path d="M21 4v8M21 4c-1 0-2 1.5-2 3.5S20 11 21 11" />
    </svg>
  );
}
function MilkIcon({ size = 26 }: { size?: number }) {
  // Milk carton silhouette.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2h8v3l2 3v11a2 2 0 01-2 2H8a2 2 0 01-2-2V8l2-3z" />
      <path d="M9 12h6" />
    </svg>
  );
}
function WaterIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5c-3 4-6 7-6 11a6 6 0 0012 0c0-4-3-7-6-11z" />
    </svg>
  );
}
function SnackIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="11" r="0.8" />
      <circle cx="14" cy="10" r="0.8" />
      <circle cx="11" cy="14" r="0.8" />
      <circle cx="15" cy="14" r="0.8" />
    </svg>
  );
}
function DiaperIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5h16v4c0 5-3.5 9.5-8 9.5s-8-4.5-8-9.5z" />
    </svg>
  );
}
