import { useState, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { useLanguage } from '../context/LanguageContext';
import { useMealAnalysis } from '../context/MealAnalysisContext';
import { effectiveStage } from '../types';
import type { MealEntry, FoodItem, NutritionTotals, PhotoBlob } from '../types';
import { getCaregiverName } from '../caregiver';
import { recordPhotoAiSave } from './AccuracyFeedbackPrompt';
import Modal from './Modal';
import DateTimeInput from './DateTimeInput';
import NotesInput from './NotesInput';
import AiDisclosureModal, { shouldShowAiDisclosure, markAiDisclosureSeen } from './AiDisclosureModal';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialMealType?: MealType;
  entry?: MealEntry | null;
  /** When true, skip the entry sheet and open straight into the confirm sheet
      pre-populated from the MealAnalysisContext (background photo flow). */
  openInConfirm?: boolean;
}

type Mode = 'entry' | 'confirm';

interface MealVisionResponseFood extends Omit<FoodItem, 'source'> {
  source: 'ai';
}

export default function MealFlow({ open, onClose, onSaved, initialMealType, entry, openInConfirm }: Props) {
  const { activeBaby } = useApp();
  const { syncPush } = useSync();
  const { t } = useLanguage();
  const { startAnalysis, consume } = useMealAnalysis();
  const isEdit = !!entry;

  const [mode, setMode] = useState<Mode>('entry');
  const [mealType, setMealType] = useState<MealType>(initialMealType ?? guessMealType());
  const [timestamp, setTimestamp] = useState(Date.now());
  const [notes, setNotes] = useState('');
  const [foods, setFoods] = useState<EditableFood[]>([]);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoBlobId, setPhotoBlobId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // Two file inputs so the user can choose between native camera and gallery.
  // The OS picker for `capture="environment"` opens the camera directly;
  // omitting `capture` lets the user pick from their library/files.
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  // Pediatric Safety + AI Lead VETO: photo flow gated behind first-use disclosure.
  // `pendingPhotoSource` queues the user's chosen path (camera vs gallery) until
  // the disclosure is acknowledged.
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [pendingPhotoSource, setPendingPhotoSource] = useState<'camera' | 'gallery' | null>(null);
  // Florencia: confirmation sheet collapsed by default — Save is the primary
  // action. Foods list opens only when the parent wants to edit.
  const [foodsExpanded, setFoodsExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setMode('confirm');
      setMealType(entry.mealType ?? 'snack');
      setTimestamp(entry.timestamp);
      setNotes(entry.notes ?? '');
      setFoods(entry.foods.map(toEditable));
      setAiModel(entry.aiModel);
      setAiConfidence(entry.aiConfidence);
      setWarnings([]);
      setPhotoBlob(null);
      setPhotoBlobId(entry.photoBlobId);
      setAnalyzeError(null);
      return;
    }
    if (openInConfirm) {
      // Background photo flow finished. Pull the result out of the context and
      // land directly in the confirmation sheet.
      const { result, photoBlob: capturedBlob } = consume();
      setMode('confirm');
      setMealType(initialMealType ?? guessMealType());
      setTimestamp(Date.now());
      setNotes('');
      setFoods(result?.foods.map(toEditable) ?? [blankFood()]);
      setAiModel(result?.aiModel ?? null);
      setAiConfidence(result?.aiConfidence ?? null);
      setWarnings(result?.warnings ?? []);
      setPhotoBlob(capturedBlob);
      setPhotoBlobId(null);
      setAnalyzeError(result ? null : 'analysis-failed');
      return;
    }
    setMode('entry');
    setMealType(initialMealType ?? guessMealType());
    setTimestamp(Date.now());
    setNotes('');
    setFoods([]);
    setAiModel(null);
    setAiConfidence(null);
    setWarnings([]);
    setPhotoBlob(null);
    setPhotoBlobId(null);
    setAnalyzeError(null);
  }, [open, entry, initialMealType, openInConfirm, consume]);

  function pickFromCamera() {
    if (shouldShowAiDisclosure()) {
      setPendingPhotoSource('camera');
      setShowDisclosure(true);
      return;
    }
    cameraRef.current?.click();
  }
  function pickFromGallery() {
    if (shouldShowAiDisclosure()) {
      setPendingPhotoSource('gallery');
      setShowDisclosure(true);
      return;
    }
    galleryRef.current?.click();
  }
  function acknowledgeDisclosure() {
    markAiDisclosureSeen();
    setShowDisclosure(false);
    // Trigger the queued picker the user originally tapped.
    setTimeout(() => {
      if (pendingPhotoSource === 'camera') cameraRef.current?.click();
      else if (pendingPhotoSource === 'gallery') galleryRef.current?.click();
      setPendingPhotoSource(null);
    }, 0);
  }
  function cancelDisclosure() {
    setShowDisclosure(false);
    setPendingPhotoSource(null);
  }

  // Photo path: kick off background analysis in context, close this sheet
  // immediately. The MealReadyToast (App shell) surfaces the result.
  function onFileChosen(file: File) {
    if (!activeBaby) return;
    const ageMonths = Math.round(
      (Date.now() - new Date(activeBaby.dob).getTime()) / (30.44 * 86400000)
    );
    const stage = effectiveStage(activeBaby);
    // Fire and forget — state lives in MealAnalysisContext.
    void startAnalysis(file, { stage, ageMonths, locale: navigator.language || 'en' });
    onClose();
  }

  function startManual() {
    setFoods([blankFood()]);
    setMode('confirm');
  }

  async function handleSave() {
    if (!activeBaby) return;
    const cleanFoods: FoodItem[] = foods
      .filter(f => f.name.trim().length > 0)
      .map(fromEditable);

    let blobId: string | null = photoBlobId;
    if (photoBlob && !blobId) {
      blobId = uuid();
      const blobRecord: PhotoBlob = {
        id: blobId,
        blob: photoBlob,
        mimeType: photoBlob.type || 'image/jpeg',
        createdAt: Date.now(),
      };
      await db.photoBlobs.put(blobRecord);
    }

    const totals = computeTotals(cleanFoods);
    const now = Date.now();
    const meal: MealEntry = {
      id: entry?.id ?? uuid(),
      babyId: entry?.babyId ?? activeBaby.id,
      timestamp,
      mealType,
      source: aiModel ? 'photo-ai' : (entry?.source ?? 'manual'),
      photoBlobId: blobId,
      hasPhoto: blobId !== null || (entry?.hasPhoto ?? false),
      foods: cleanFoods,
      totals,
      aiModel,
      aiConfidence,
      notes: notes || null,
      createdAt: entry?.createdAt ?? now,
      modifiedAt: now,
      loggedBy: entry?.loggedBy ?? getCaregiverName(),
    };

    if (isEdit) await db.meals.put(meal);
    else await db.meals.add(meal);
    syncPush('meals', meal.id, meal);

    // Trigger feedback prompt every 5th AI-parsed save (CPO + AI Lead).
    if (!isEdit && meal.source === 'photo-ai' && recordPhotoAiSave(meal.id)) {
      window.dispatchEvent(new CustomEvent('babylog:feedback-prompt', {
        detail: { refId: meal.id, surface: 'meal' },
      }));
    }

    onSaved();
    onClose();
  }

  function updateFood(idx: number, patch: Partial<EditableFood>) {
    setFoods(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }
  function deleteFood(idx: number) {
    setFoods(prev => prev.filter((_, i) => i !== idx));
  }
  function addBlankFood() {
    setFoods(prev => [...prev, blankFood()]);
  }

  // Look up nutrition for a manually-typed food on blur.
  async function lookupFood(idx: number) {
    const f = foods[idx];
    if (!f || !f.name.trim() || f.kcal !== null) return;
    try {
      // Reuse the meal-vision endpoint by submitting a "no image" request? Not ideal.
      // Instead: hit a tiny lookup helper. For demo MVP, skip — manual nutrition is null
      // and the parent can leave it that way or enter manually.
      // (Future: add /api/nutrition-lookup that wraps _nutrition.ts directly.)
    } catch { /* silent */ }
  }

  // ---------- render ----------

  const aggBand = bandFromConfidence(aiConfidence);

  // Auto-expand foods if the AI confidence is low or analysis failed —
  // we want the parent to actually look in those cases.
  useEffect(() => {
    if (mode !== 'confirm') return;
    if (aggBand === 'low' || analyzeError) setFoodsExpanded(true);
  }, [mode, aggBand, analyzeError]);

  if (mode === 'entry') {
    return (
      <>
        <Modal open={open} onClose={onClose} title={t('meal.add.title')}>
          <button
            onClick={pickFromCamera}
            className="w-full py-5 rounded-2xl bg-accent-blue text-white font-semibold text-lg flex items-center justify-center gap-3 mb-3"
          >
            <CameraIcon /> {t('meal.add.photo')}
          </button>
          <button
            onClick={pickFromGallery}
            className="w-full py-5 rounded-2xl bg-accent-blue/15 text-accent-blue font-semibold text-lg flex items-center justify-center gap-3 mb-3"
          >
            <GalleryIcon /> {t('meal.add.gallery')}
          </button>
          <button
            onClick={startManual}
            className="w-full py-5 rounded-2xl bg-bg-card text-text-primary font-semibold text-lg flex items-center justify-center gap-3"
          >
            <PencilIcon /> {t('meal.add.manual')}
          </button>
        </Modal>
        {/* Camera capture (rear camera on mobile) */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onFileChosen(f);
            e.target.value = '';
          }}
        />
        {/* Gallery picker (no capture attribute → OS shows photo library) */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onFileChosen(f);
            e.target.value = '';
          }}
        />
        <AiDisclosureModal
          open={showDisclosure}
          onAcknowledge={acknowledgeDisclosure}
          onCancel={cancelDisclosure}
        />
      </>
    );
  }

  // mode === 'confirm'
  return (
    <Modal open={open} onClose={onClose} title={t(isEdit ? 'meal.confirm.editTitle' : 'meal.confirm.title')}>
      {analyzeError && (
        <div className="mb-3 p-3 rounded-xl bg-accent-amber/10 border border-accent-amber/30 text-[13px] text-accent-amber">
          {t('meal.error.aiUnavailable')}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-3 p-3 rounded-xl bg-accent-amber/10 border border-accent-amber/20 text-[13px] text-accent-amber">
          {warnings.join(' · ')}
        </div>
      )}
      {aggBand === 'low' && (
        <div className="mb-3 p-3 rounded-xl bg-accent-amber/10 border border-accent-amber/30 text-[13px] text-accent-amber">
          {t('meal.confirm.lowConfidence')}
        </div>
      )}

      {/* Meal type chips */}
      <label className="text-text-secondary text-sm mb-2 block">{t('label.mealType')}</label>
      <div className="flex gap-2 mb-4 overflow-x-auto scrollable">
        {MEAL_TYPES.map(m => (
          <button
            key={m}
            onClick={() => setMealType(m)}
            className={`px-4 py-2 rounded-full text-sm font-medium flex-shrink-0 ${
              mealType === m ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {t(`meal.type.${m}`)}
          </button>
        ))}
      </div>

      {/* Foods — collapsed by default. Save is the primary action.
          Expand only if the parent wants to edit, or auto-expand on
          low-confidence / error states. */}
      {!foodsExpanded ? (
        <button
          onClick={() => setFoodsExpanded(true)}
          className="w-full p-3 mb-3 bg-bg-card rounded-xl flex items-center justify-between gap-3"
        >
          <div className="flex-1 text-left min-w-0">
            <p className="text-[13px] text-text-secondary uppercase tracking-wider font-medium mb-0.5">
              {t('label.foods')}
            </p>
            <p className="text-sm font-medium truncate">
              {summarizeFoods(foods, t)}
            </p>
          </div>
          <span className="text-[12px] text-accent-blue font-medium flex-shrink-0">
            {t('meal.confirm.editFoods')}
          </span>
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <label className="text-text-secondary text-sm">{t('label.foods')}</label>
            <button
              onClick={() => setFoodsExpanded(false)}
              className="text-[12px] text-text-muted font-medium"
            >
              {t('meal.confirm.collapseFoods')}
            </button>
          </div>
          <div className="flex flex-col gap-2 mb-3">
            {foods.map((f, i) => (
              <FoodRow
                key={i}
                food={f}
                onChange={p => updateFood(i, p)}
                onDelete={() => deleteFood(i)}
                onBlur={() => lookupFood(i)}
                t={t}
              />
            ))}
          </div>
          <button
            onClick={addBlankFood}
            className="w-full py-2.5 rounded-xl bg-bg-card text-accent-blue text-sm font-medium mb-4"
          >
            + {t('meal.confirm.addFood')}
          </button>
        </>
      )}

      {/* Totals preview */}
      <TotalsPreview foods={foods} t={t} />

      <DateTimeInput value={timestamp} onChange={setTimestamp} />
      <NotesInput value={notes} onChange={setNotes} />

      <button
        onClick={handleSave}
        className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg"
      >
        {t(isEdit ? 'btn.saveChanges' : 'btn.save')}
      </button>
    </Modal>
  );
}

// ---------------- editable food row ----------------

interface EditableFood extends FoodItem {}

function FoodRow({
  food, onChange, onDelete, onBlur, t,
}: {
  food: EditableFood;
  onChange: (p: Partial<EditableFood>) => void;
  onDelete: () => void;
  onBlur: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const kcalText = food.kcal !== null ? `${Math.round(food.kcal)} kcal` : '— kcal';
  const macroText = food.protein_g !== null
    ? `${Math.round(food.protein_g)}P · ${Math.round(food.fat_g ?? 0)}F · ${Math.round(food.carbs_g ?? 0)}C`
    : t('meal.food.noNutrition');

  return (
    <div className="bg-bg-card rounded-xl p-3">
      <div className="flex items-start gap-2">
        <ConfidenceChip confidence={food.confidence} t={t} />
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={food.name}
            onChange={e => onChange({ name: e.target.value })}
            onBlur={onBlur}
            placeholder={t('meal.food.namePlaceholder')}
            className="w-full bg-transparent text-[15px] font-medium outline-none mb-1"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={food.grams ?? ''}
              onChange={e => {
                const v = e.target.value;
                onChange({ grams: v === '' ? null : parseFloat(v) });
              }}
              placeholder="g"
              className="w-16 px-2 py-1 rounded-md bg-bg-input text-[13px] text-text-primary tabular-nums outline-none focus:ring-1 focus:ring-accent-blue"
            />
            <span className="text-[12px] text-text-muted">g</span>
            <span className="text-[12px] text-text-muted">·</span>
            <span className="text-[12px] text-text-secondary tabular-nums">{kcalText}</span>
            <span className="text-[11px] text-text-muted">{macroText}</span>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:text-accent-red flex-shrink-0"
          aria-label="delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function TotalsPreview({ foods, t }: { foods: EditableFood[]; t: (k: string) => string }) {
  const totals = computeTotals(foods);
  const sugar = foods.reduce((s, f) => s + (f.sugar_g ?? 0), 0);
  return (
    <div className="glass-card rounded-xl p-3 mb-4">
      {/* Headline: kcal */}
      <div className="text-center pb-2.5 border-b border-border-light mb-2.5">
        <div className="text-[24px] font-bold tabular-nums text-accent-green leading-none">
          {Math.round(totals.kcal)}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">
          {t('toddler.ring.kcal')}
        </div>
      </div>
      {/* Macros row */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <Nut label={t('nutrition.protein')} value={Math.round(totals.protein_g)} unit="g" />
        <Nut label={t('nutrition.fat')}     value={Math.round(totals.fat_g)}     unit="g" />
        <Nut label={t('nutrition.carbs')}   value={Math.round(totals.carbs_g)}   unit="g" />
        <Nut label={t('nutrition.fiber')}   value={Math.round(totals.fiber_g)}   unit="g" />
      </div>
      {/* Micros row */}
      <div className="grid grid-cols-4 gap-1.5">
        <Nut label={t('nutrition.iron')}    value={fmt1(totals.iron_mg)}    unit="mg" />
        <Nut label={t('nutrition.calcium')} value={Math.round(totals.calcium_mg)} unit="mg" />
        <Nut label={t('nutrition.vitD')}    value={Math.round(totals.vitD_iu)}    unit="IU" />
        <Nut label={t('nutrition.sugar')}   value={Math.round(sugar)}             unit="g" muted />
      </div>
    </div>
  );
}

function Nut({ label, value, unit, muted }: { label: string; value: string | number; unit: string; muted?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-[13px] font-semibold tabular-nums ${muted ? 'text-text-muted' : ''}`}>
        {value}<span className="text-[10px] text-text-muted ml-0.5">{unit}</span>
      </div>
      <div className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">{label}</div>
    </div>
  );
}

function fmt1(v: number): string {
  if (v < 1) return v.toFixed(2);
  return (Math.round(v * 10) / 10).toString();
}

// ---------------- helpers ----------------

function blankFood(): EditableFood {
  return {
    name: '',
    grams: null,
    source: 'user',
    confidence: null,
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
}

function toEditable(f: FoodItem | MealVisionResponseFood): EditableFood {
  return { ...(f as FoodItem) };
}
function fromEditable(f: EditableFood): FoodItem {
  return f;
}

function computeTotals(foods: EditableFood[]): NutritionTotals {
  const sum = (k: keyof NutritionTotals) =>
    foods.reduce((s, f) => s + (typeof f[k as keyof EditableFood] === 'number' ? (f[k as keyof EditableFood] as number) : 0), 0);
  return {
    kcal: sum('kcal'),
    protein_g: sum('protein_g'),
    fat_g: sum('fat_g'),
    carbs_g: sum('carbs_g'),
    fiber_g: sum('fiber_g'),
    iron_mg: sum('iron_mg'),
    calcium_mg: sum('calcium_mg'),
    vitD_iu: sum('vitD_iu'),
  };
}

function summarizeFoods(foods: EditableFood[], t: (k: string) => string): string {
  const named = foods.filter(f => f.name.trim().length > 0);
  if (named.length === 0) return t('meal.row.empty');
  const list = named.slice(0, 3).map(f => f.name).join(', ');
  return named.length > 3 ? list + '…' : list;
}

function bandFromConfidence(c: number | null): 'low' | 'medium' | 'high' | null {
  if (c === null) return null;
  if (c < 0.5) return 'low';
  if (c <= 0.8) return 'medium';
  return 'high';
}

// Grandparent VETO closure: confidence is communicated by both color AND text.
// Never color alone. Aria-label spells out the intent for screen readers.
function ConfidenceChip({
  confidence, t, compact,
}: {
  confidence: number | null;
  t: (k: string) => string;
  compact?: boolean;
}) {
  const band = bandFromConfidence(confidence);
  if (!band) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-semibold ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} bg-bg-input text-text-muted uppercase tracking-wider flex-shrink-0`}
        aria-label={t('meal.confidence.manualLong')}
      >
        {t('meal.confidence.manual')}
      </span>
    );
  }
  const styles = {
    high:   { bg: 'bg-accent-green/15', text: 'text-accent-green', label: t('meal.confidence.high') },
    medium: { bg: 'bg-accent-amber/15', text: 'text-accent-amber', label: t('meal.confidence.medium') },
    low:    { bg: 'bg-accent-red/15',   text: 'text-accent-red',   label: t('meal.confidence.low') },
  }[band];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} ${styles.bg} ${styles.text} uppercase tracking-wider flex-shrink-0`}
      aria-label={t(`meal.confidence.${band}Long`)}
    >
      <span className={`inline-block rounded-full ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'}`} style={{ backgroundColor: 'currentColor' }} />
      {styles.label}
    </span>
  );
}

// Exported so timeline rows can render the same chip.
export { ConfidenceChip };

function guessMealType(): MealType {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21) return 'dinner';
  return 'snack';
}

// ---------------- icons ----------------

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function GalleryIcon() {
  // Two stacked rectangles — suggests "from your photos".
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="M3 14l4-4 5 5" />
      <path d="M21 7v12a2 2 0 01-2 2H7" />
    </svg>
  );
}
