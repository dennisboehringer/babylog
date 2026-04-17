import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../db';
import { stageFromAge, type Stage } from '../types';

// Calm, one-shot per session. Shown when:
//  - stagePolicy is 'auto' (or undefined → defaults to auto)
//  - stageFromAge(dob) differs from lastAcceptedStage (or first run)
// "Not yet" closes for this session; reappears next app open. No nag.
export default function StageTransitionPrompt() {
  const { activeBaby, dispatch } = useApp();
  const { syncPush } = useSync();
  const { t } = useLanguage();
  const [dismissedThisSession, setDismissedThisSession] = useState<Set<string>>(new Set());

  // Reset dismissal set when active baby changes (so each baby's prompt is independent).
  useEffect(() => {
    // intentionally no-op; dismissedThisSession is keyed by babyId so cross-baby
    // switching naturally won't suppress.
  }, [activeBaby?.id]);

  if (!activeBaby) return null;
  const policy = activeBaby.stagePolicy ?? 'auto';
  if (policy !== 'auto') return null;

  const target: Stage = stageFromAge(activeBaby.dob);
  const accepted = activeBaby.lastAcceptedStage;
  // First-time auto users: silently accept the current stage so we don't prompt
  // newborn parents on first launch.
  if (!accepted) {
    if (target !== 'newborn') {
      // skip: handled below — show prompt only when transitioning between stages
    }
    // Don't prompt on first run if the target is what they'd expect.
    return <FirstRunSilentAccept target={target} />;
  }
  if (accepted === target) return null;
  if (dismissedThisSession.has(activeBaby.id)) return null;

  async function accept() {
    if (!activeBaby) return;
    const updated = { ...activeBaby, lastAcceptedStage: target };
    await db.babies.put(updated);
    dispatch({ type: 'UPDATE_BABY', baby: updated });
    syncPush('babies', updated.id, updated);
  }

  function dismiss() {
    if (!activeBaby) return;
    setDismissedThisSession(prev => new Set(prev).add(activeBaby.id));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6 animate-fade-in">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative glass-surface rounded-3xl p-6 max-w-[360px] w-full border border-border-light animate-scale-in">
        <h2 className="text-[20px] font-semibold mb-3 text-center">
          {t('stage.prompt.title', { name: activeBaby.name, stage: t(`stage.name.${target}`) })}
        </h2>
        <p className="text-[14px] text-text-secondary leading-relaxed mb-6 text-center">
          {t(`stage.prompt.body.${target}`)}
        </p>
        <button
          onClick={accept}
          className="w-full py-3.5 rounded-xl bg-accent-blue text-white font-semibold text-base mb-2"
        >
          {t('stage.prompt.switch', { stage: t(`stage.name.${target}`) })}
        </button>
        <button
          onClick={dismiss}
          className="w-full py-3.5 rounded-xl bg-bg-card text-text-secondary font-medium text-base"
        >
          {t('stage.prompt.notYet')}
        </button>
      </div>
    </div>
  );
}

// On a fresh profile under 'auto' policy, silently snap lastAcceptedStage to
// whatever stageFromAge says — no prompt. Premium = no first-run interruption.
function FirstRunSilentAccept({ target }: { target: Stage }) {
  const { activeBaby, dispatch } = useApp();
  const { syncPush } = useSync();
  useEffect(() => {
    if (!activeBaby || activeBaby.lastAcceptedStage) return;
    const updated = { ...activeBaby, lastAcceptedStage: target };
    db.babies.put(updated).then(() => {
      dispatch({ type: 'UPDATE_BABY', baby: updated });
      syncPush('babies', updated.id, updated);
    });
  }, [activeBaby, target, dispatch, syncPush]);
  return null;
}
