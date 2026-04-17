import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../db';
import { getEnvironment } from '../sync';
import { getByoKey, setByoKey } from '../reports/claude';
import { stageFromAge } from '../types';
import type { BabyProfile } from '../types';
import Modal from './Modal';
import LanguagePicker from './LanguagePicker';
import { AiDisclosureContent } from './AiDisclosure';
import { getCaregiverName, setCaregiverName } from '../caregiver';

const PRESET_COLORS = [
  '#4A9EFF', '#34D058', '#F0B429', '#F85149',
  '#B180F7', '#F778BA', '#56D4DD', '#E09B54',
];

// 0 = no reminder. Newborn parents can opt out; toddler parents see this
// section hidden entirely (the timing concept is newborn-specific).
const REMINDER_OPTIONS = [
  { labelKey: 'settings.reminder.off', value: 0 },
  { labelKey: 'settings.reminder.2h', value: 120 },
  { labelKey: 'settings.reminder.2_5h', value: 150 },
  { labelKey: 'settings.reminder.3h', value: 180 },
];

export default function SettingsScreen() {
  const { state, dispatch, activeBaby } = useApp();
  const { sync, startCollab, joinCollab, leaveCollab } = useSync();
  const { preference: themePref, resolved: themeResolved, setPreference: setThemePref } = useTheme();
  const { t } = useLanguage();
  const [editingBaby, setEditingBaby] = useState<BabyProfile | null>(null);
  const [addingBaby, setAddingBaby] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [aiKeyError, setAiKeyError] = useState('');
  const [aiKeyHasStored, setAiKeyHasStored] = useState(() => getByoKey() !== null);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>('male');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [editUnit, setEditUnit] = useState<'oz' | 'mL'>('oz');
  const [editReminder, setEditReminder] = useState(180);
  // showPumpHero is now inferred from real pump activity in the last 7 days
  // (Jony/Jobs: premium = restraint). Toggle removed from UI; the field stays
  // on the schema for backwards compat with synced records.
  const [editAlternateSides, setEditAlternateSides] = useState(true);

  function openEdit(baby: BabyProfile) {
    setEditName(baby.name);
    setEditDob(baby.dob);
    setEditGender(baby.gender);
    setEditColor(baby.themeColor);
    setEditUnit(baby.unitPreference);
    setEditReminder(baby.reminderIntervalMinutes);
    setEditAlternateSides(baby.alternateSides !== false);
    setEditingBaby(baby);
  }

  function openAdd() {
    setEditName('');
    setEditDob(new Date().toISOString().split('T')[0]);
    setEditGender('male');
    setEditColor(PRESET_COLORS[0]);
    setEditUnit('oz');
    setEditReminder(180);
    setEditAlternateSides(true);
    setAddingBaby(true);
  }

  async function handleSaveEdit() {
    if (!editingBaby) return;
    const updated: BabyProfile = {
      ...editingBaby,
      name: editName.trim() || editingBaby.name,
      dob: editDob,
      gender: editGender,
      themeColor: editColor,
      unitPreference: editUnit,
      reminderIntervalMinutes: editReminder,
      alternateSides: editAlternateSides,
    };
    await db.babies.put(updated);
    dispatch({ type: 'UPDATE_BABY', baby: updated });
    setEditingBaby(null);
  }

  async function handleAddBaby() {
    const baby: BabyProfile = {
      id: uuid(),
      name: editName.trim() || t('baby.fallbackName'),
      dob: editDob,
      gender: editGender,
      themeColor: editColor,
      unitPreference: editUnit,
      reminderIntervalMinutes: editReminder,
      alternateSides: editAlternateSides,
      createdAt: Date.now(),
    };
    await db.babies.add(baby);
    dispatch({ type: 'ADD_BABY', baby });
    setAddingBaby(false);
  }

  async function handleDeleteBaby(id: string) {
    await db.babies.delete(id);
    await db.feeds.where('babyId').equals(id).delete();
    await db.diapers.where('babyId').equals(id).delete();
    await db.pumps.where('babyId').equals(id).delete();
    dispatch({ type: 'DELETE_BABY', id });
    setConfirmDelete(null);
  }

  async function handleJoinCollab() {
    if (joinCode.length !== 6) return;
    setJoining(true);
    setJoinError('');
    const success = await joinCollab(joinCode);
    if (!success) {
      setJoinError(t('settings.collab.notFound'));
    }
    setJoining(false);
  }

  return (
    <div className="flex-1 scrollable px-4 pt-4 pb-4">
      <h2 className="text-lg font-semibold mb-5">{t('settings.title')}</h2>

      {/* Baby profiles */}
      <SectionLabel>{t('settings.section.babyProfiles')}</SectionLabel>
      <div className="flex flex-col gap-2 mb-5">
        {state.babies.map(baby => (
          <div
            key={baby.id}
            className={`glass-card rounded-2xl p-4 flex items-center gap-3 transition-all ${
              baby.id === state.activeBabyId ? 'ring-1 ring-accent-blue/40' : ''
            }`}
          >
            <button
              onClick={() => dispatch({ type: 'SET_ACTIVE_BABY', id: baby.id })}
              className="flex items-center gap-3 flex-1 min-h-[48px]"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                style={{ backgroundColor: baby.themeColor + '20', color: baby.themeColor }}
              >
                {baby.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="font-medium text-[15px]">{baby.name}</p>
                <p className="text-xs text-text-muted">{t('settings.baby.born', { dob: baby.dob })}</p>
              </div>
            </button>
            <button
              onClick={() => openEdit(baby)}
              className="px-3 py-2 text-xs rounded-xl bg-bg-input text-text-secondary min-h-[36px] font-medium active:opacity-70"
            >
              {t('btn.edit')}
            </button>
          </div>
        ))}
        <button
          onClick={openAdd}
          className="w-full py-3 rounded-2xl border border-dashed border-border-light text-text-muted text-sm min-h-[48px] font-medium active:opacity-70"
        >
          {t('settings.baby.addBaby')}
        </button>
      </div>

      {/* Active baby settings */}
      {activeBaby && (
        <>
          <SectionLabel>{t('settings.section.preferences')}</SectionLabel>
          <div className="glass-card rounded-2xl divide-y divide-border mb-5">
            <SettingsRow label={t('label.unitPreference')} value={activeBaby.unitPreference} />
            {(() => {
              // Hide reminder row for toddler+; show "Off" for 0; otherwise hours.
              const stage = stageFromAge(activeBaby.dob);
              if (stage !== 'newborn' && stage !== 'weaning') return null;
              const value = activeBaby.reminderIntervalMinutes === 0
                ? t('settings.reminder.off')
                : t('settings.prefs.everyHours', { h: (activeBaby.reminderIntervalMinutes / 60).toFixed(1).replace('.0', '') });
              return <SettingsRow label={t('label.feedReminder')} value={value} />;
            })()}
          </div>

          <SectionLabel>{t('settings.section.collaboration')}</SectionLabel>
          <div className="glass-card rounded-2xl p-4 mb-5">
            {sync.connected ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_8px_rgba(52,208,88,0.4)]" />
                  <span className="text-sm text-accent-green font-medium">{t('settings.collab.connected')}</span>
                </div>
                <p className="text-xs text-text-muted mb-1">{t('settings.collab.codeLabel')}</p>
                <p className="text-2xl font-bold tracking-[0.3em] mb-3 tabular-nums">{sync.collabCode}</p>
                <p className="text-xs text-text-muted mb-4">{t('settings.collab.codeDescription')}</p>
                <button
                  onClick={leaveCollab}
                  className="w-full py-2.5 rounded-xl text-sm text-accent-red bg-accent-red/10 font-medium active:opacity-70"
                >
                  {t('btn.disconnect')}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-text-secondary mb-4">{t('settings.collab.description')}</p>
                <button
                  onClick={async () => { await startCollab(); }}
                  className="w-full py-3 rounded-xl btn-primary text-white font-medium text-sm mb-3"
                >
                  {t('btn.startCollab')}
                </button>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-text-muted">{t('settings.collab.orJoinExisting')}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={joinCode}
                    onChange={e => { setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setJoinError(''); }}
                    placeholder="000000"
                    maxLength={6}
                    className="flex-1 px-3 py-3 rounded-xl bg-bg-input text-text-primary text-sm outline-none text-center tracking-[0.3em] font-bold focus:ring-2 focus:ring-accent-blue"
                  />
                  <button
                    onClick={handleJoinCollab}
                    disabled={joinCode.length !== 6 || joining}
                    className="px-5 py-3 rounded-xl btn-success text-white text-sm font-medium disabled:opacity-40"
                  >
                    {joining ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : t('btn.join')}
                  </button>
                </div>
                {joinError && (
                  <p className="text-xs text-accent-red mt-2">{joinError}</p>
                )}
              </div>
            )}
          </div>

          <SectionLabel>{t('settings.section.ai')}</SectionLabel>
          <div className="glass-card rounded-2xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${aiKeyHasStored ? 'bg-accent-blue shadow-[0_0_8px_rgba(74,158,255,0.4)]' : 'bg-text-muted'}`} />
              <span className={`text-sm font-medium ${aiKeyHasStored ? 'text-accent-blue' : 'text-text-muted'}`}>
                {aiKeyHasStored ? t('settings.ai.keyActive') : t('settings.ai.keyHosted')}
              </span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed mb-3">{t('settings.ai.keyDescription')}</p>
            {!aiKeyHasStored ? (
              <>
                <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('settings.ai.keyLabel')}</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={aiKeyDraft}
                  onChange={e => { setAiKeyDraft(e.target.value); setAiKeyError(''); }}
                  placeholder={t('settings.ai.keyPlaceholder')}
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-input text-text-primary text-sm font-mono outline-none focus:ring-2 focus:ring-accent-blue mb-2"
                />
                {aiKeyError && <p className="text-xs text-accent-red mb-2">{aiKeyError}</p>}
                <button
                  onClick={() => {
                    const k = aiKeyDraft.trim();
                    if (!k.startsWith('sk-ant-')) {
                      setAiKeyError(t('settings.ai.keyInvalid'));
                      return;
                    }
                    setByoKey(k);
                    setAiKeyHasStored(true);
                    setAiKeyDraft('');
                  }}
                  disabled={!aiKeyDraft.trim()}
                  className="w-full py-2.5 rounded-xl btn-primary text-white text-sm font-medium disabled:opacity-40 min-h-[40px]"
                >
                  {t('settings.ai.keySave')}
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setByoKey(null);
                  setAiKeyHasStored(false);
                }}
                className="w-full py-2.5 rounded-xl bg-accent-red/10 text-accent-red text-sm font-medium min-h-[40px]"
              >
                {t('settings.ai.keyRemove')}
              </button>
            )}
          </div>
        </>
      )}

      <SectionLabel>{t('settings.section.caregiver')}</SectionLabel>
      <div className="glass-card rounded-2xl p-4 mb-5">
        <p className="text-xs text-text-muted leading-relaxed mb-3">{t('settings.caregiver.description')}</p>
        <CaregiverNameInput t={t} />
      </div>

      <SectionLabel>{t('settings.section.photoAnalysis')}</SectionLabel>
      <div className="glass-card rounded-2xl p-4 mb-5">
        <NutritionSourceStatus t={t} />
        <AiDisclosureContent />
      </div>

      <SectionLabel>{t('settings.section.appearance')}</SectionLabel>
      <div className="glass-card rounded-2xl p-1.5 mb-1.5 flex gap-1">
        {(['system', 'light', 'dark'] as ThemePreference[]).map(opt => (
          <button
            key={opt}
            onClick={() => setThemePref(opt)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
              themePref === opt
                ? 'bg-accent-blue text-white shadow-sm'
                : 'text-text-secondary active:bg-fill-4'
            }`}
          >
            {t(`settings.theme.${opt}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted mb-5 px-1">
        {themePref === 'system'
          ? t('settings.theme.followingSystem', { theme: t(`settings.theme.${themeResolved}`) })
          : t('settings.theme.modeText', { mode: t(`settings.theme.${themePref}`) })}
      </p>

      <SectionLabel>{t('settings.section.language')}</SectionLabel>
      <div className="mb-5">
        <p className="text-xs text-text-muted mb-2 px-1">{t('settings.language.description')}</p>
        <LanguagePicker variant="inline" />
      </div>

      <SectionLabel>{t('settings.section.app')}</SectionLabel>
      <div className="glass-card rounded-2xl divide-y divide-border mb-5">
        <button
          onClick={async () => {
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                await reg.update();
                if (reg.waiting) {
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                } else {
                  // Force reload to bust any stale cache
                  window.location.reload();
                }
              } else {
                window.location.reload();
              }
            } else {
              window.location.reload();
            }
          }}
          className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
        >
          <span className="text-sm font-medium">{t('btn.checkUpdates')}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A9EFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
        </button>
        <button
          onClick={() => {
            if ('caches' in window) {
              caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
              });
            }
            window.location.reload();
          }}
          className="flex items-center justify-between px-4 py-3.5 min-h-[48px] w-full active:bg-bg-card-hover transition-colors"
        >
          <span className="text-sm font-medium">{t('btn.forceRefresh')}</span>
          <span className="text-xs text-text-muted">{t('btn.clearCache')}</span>
        </button>
      </div>

      <div className="mt-4 text-center pb-4">
        <p className="text-text-muted text-xs">{t('settings.footer.consultant')}</p>
        <p className="text-text-muted text-xs mt-1 opacity-60">
          {t('settings.footer.version')}
          {getEnvironment() === 'development' && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-accent-amber/20 text-accent-amber font-semibold">{t('settings.footer.devBadge')}</span>
          )}
        </p>
      </div>

      {/* Edit/Add Modal */}
      <Modal
        open={editingBaby !== null || addingBaby}
        onClose={() => { setEditingBaby(null); setAddingBaby(false); }}
        title={editingBaby ? t('settings.modal.editBaby') : t('settings.modal.addBaby')}
      >
        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.name')}</label>
        <input
          type="text"
          value={editName}
          onChange={e => setEditName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base mb-4 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.dateOfBirth')}</label>
        <input
          type="date"
          value={editDob}
          onChange={e => setEditDob(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-bg-input text-text-primary text-base mb-4 outline-none focus:ring-2 focus:ring-accent-blue"
        />

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.gender')}</label>
        <div className="flex gap-2 mb-4">
          {(['male', 'female', 'other'] as const).map(g => (
            <button
              key={g}
              onClick={() => setEditGender(g)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                editGender === g ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {t(`gender.${g}`)}
            </button>
          ))}
        </div>

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.themeColor')}</label>
        <div className="flex gap-2.5 mb-4 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setEditColor(c)}
              className="w-9 h-9 rounded-full border-2 transition-all"
              style={{
                backgroundColor: c,
                borderColor: editColor === c ? '#E8ECF1' : 'transparent',
                transform: editColor === c ? 'scale(1.1)' : 'scale(1)',
                boxShadow: editColor === c ? `0 0 12px ${c}40` : 'none',
              }}
            />
          ))}
        </div>

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.unitPreference')}</label>
        <div className="flex gap-2 mb-4">
          {(['oz', 'mL'] as const).map(u => (
            <button
              key={u}
              onClick={() => setEditUnit(u)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                editUnit === u ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Feeding reminder is newborn/weaning concept only.
            Toddler+ doesn't have a "feed every Nh" cadence — hide entirely. */}
        {(stageFromAge(editDob) === 'newborn' || stageFromAge(editDob) === 'weaning') && (
          <>
            <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.feedReminder')}</label>
            <div className="flex gap-2 mb-5">
              {REMINDER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setEditReminder(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    editReminder === opt.value ? 'bg-accent-blue text-white' : 'bg-bg-card text-text-secondary'
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">{t('label.breastfeeding')}</label>
        <button
          onClick={() => setEditAlternateSides(v => !v)}
          className="w-full flex items-center justify-between py-3 px-4 rounded-xl bg-bg-card mb-5"
        >
          <span className="text-left">
            <span className="block text-sm font-medium text-text-primary">{t('settings.modal.alternateSidesTitle')}</span>
            <span className="block text-xs text-text-muted mt-0.5">{t('settings.modal.alternateSidesDesc')}</span>
          </span>
          <span
            className={`relative inline-block w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              editAlternateSides ? 'bg-accent-blue' : 'bg-fill-3'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                editAlternateSides ? 'translate-x-5' : ''
              }`}
            />
          </span>
        </button>

        <button
          onClick={editingBaby ? handleSaveEdit : handleAddBaby}
          className="w-full py-4 rounded-2xl btn-success text-white font-semibold text-lg mb-2"
        >
          {editingBaby ? t('btn.saveChanges') : t('btn.addBaby')}
        </button>

        {editingBaby && state.babies.length > 1 && (
          confirmDelete === editingBaby.id ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl bg-bg-card text-text-secondary text-sm font-medium"
              >
                {t('btn.cancel')}
              </button>
              <button
                onClick={() => handleDeleteBaby(editingBaby.id)}
                className="flex-1 py-3 rounded-xl bg-accent-red text-white text-sm font-medium"
              >
                {t('btn.confirmDelete')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(editingBaby.id)}
              className="w-full py-3 rounded-xl text-accent-red text-sm font-medium"
            >
              {t('btn.deleteBaby', { name: editingBaby.name })}
            </button>
          )
        )}
      </Modal>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs text-text-muted font-medium uppercase tracking-wider mb-2.5">{children}</h3>;
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 min-h-[48px]">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-text-secondary">{value}</span>
    </div>
  );
}

interface HealthStatus {
  anthropic_configured: boolean;
  usda_configured: boolean;
}

function NutritionSourceStatus({ t }: { t: (k: string) => string }) {
  const [status, setStatus] = useState<HealthStatus | 'loading' | 'unknown'>('loading');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(r => r.ok ? r.json() as Promise<HealthStatus> : Promise.reject())
      .then(s => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setStatus('unknown'); });
    return () => { cancelled = true; };
  }, []);

  // Hide entirely until we have a response — no jitter.
  if (status === 'loading') return null;

  // If the health endpoint is unreachable we can't report truthfully.
  if (status === 'unknown') return null;

  const usda = status.usda_configured;
  const label = usda ? t('settings.photoAnalysis.usdaActive') : t('settings.photoAnalysis.usdaMissing');
  const dot = usda ? 'bg-accent-green shadow-[0_0_8px_rgba(63,207,142,0.4)]' : 'bg-accent-amber';
  const text = usda ? 'text-accent-green' : 'text-accent-amber';
  return (
    <div className="flex items-start gap-2.5 mb-4 pb-4 border-b border-border-light">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dot}`} />
      <div className="flex-1">
        <p className={`text-[13px] font-semibold ${text}`}>{label}</p>
        {!usda && (
          <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
            {t('settings.photoAnalysis.usdaMissingHint')}
          </p>
        )}
      </div>
    </div>
  );
}

function CaregiverNameInput({ t }: { t: (k: string) => string }) {
  const [draft, setDraft] = useState(getCaregiverName() ?? '');
  const [savedFlash, setSavedFlash] = useState(false);
  function commit() {
    setCaregiverName(draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }
  return (
    <>
      <label className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1.5 block">
        {t('settings.caregiver.label')}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={t('settings.caregiver.placeholder')}
          className="flex-1 px-3 py-2.5 rounded-xl bg-bg-input text-text-primary text-sm outline-none focus:ring-2 focus:ring-accent-blue"
        />
        <button
          onClick={commit}
          className="px-4 py-2.5 rounded-xl bg-accent-blue/15 text-accent-blue text-sm font-medium min-h-[40px]"
        >
          {savedFlash ? t('settings.caregiver.saved') : t('btn.save')}
        </button>
      </div>
    </>
  );
}
