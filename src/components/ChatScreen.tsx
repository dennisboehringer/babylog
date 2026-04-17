import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useAiGate } from '../hooks/useAiGate';
import { shouldShowAiDisclosure } from './AiDisclosureModal';
import { db } from '../db';
import type { FeedEntry, DiaperEntry, PumpEntry } from '../types';
import {
  chatStream,
  generateDailyInsight,
  ClaudeError,
  type ChatMessage,
  type ChatContext,
} from '../reports/claude';
import {
  pickStaticTip,
  getCachedInsight,
  setCachedInsight,
  clearCachedInsight,
} from '../reports/insights';

const ML_PER_OZ = 29.5735;

// ─── Context builders ────────────────────────────────────────────────────────

function dayOfLife(dobISO: string): number {
  // 1-indexed day since DOB — "day 1" is the day the baby was born.
  const dob = new Date(dobISO + 'T00:00:00');
  const now = new Date();
  const dobMid = new Date(dob.getFullYear(), dob.getMonth(), dob.getDate()).getTime();
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(1, Math.floor((nowMid - dobMid) / 86_400_000) + 1);
}

function feedingModel(
  feeds: FeedEntry[],
): 'exclusive-breast' | 'exclusive-bottle' | 'mixed' | 'breast-with-bottle-supplement' {
  const breast = feeds.filter(f => f.type === 'breast').length;
  const bottle = feeds.filter(f => f.type === 'bottle').length;
  if (breast === 0 && bottle === 0) return 'mixed';
  if (bottle === 0) return 'exclusive-breast';
  if (breast === 0) return 'exclusive-bottle';
  if (breast / (breast + bottle) >= 0.8) return 'breast-with-bottle-supplement';
  return 'mixed';
}

async function buildChatContext(babyId: string, babyName: string, dob: string): Promise<ChatContext> {
  const now = Date.now();
  const SEVEN_DAYS = 7 * 86_400_000;
  const FORTY_EIGHT_H = 48 * 3_600_000;
  const sevenDaysAgo = now - SEVEN_DAYS;
  const fortyEightHAgo = now - FORTY_EIGHT_H;

  const [feeds7, diapers7, pumps7] = await Promise.all([
    db.feeds.where('babyId').equals(babyId).and(f => f.timestamp >= sevenDaysAgo).toArray(),
    db.diapers.where('babyId').equals(babyId).and(d => d.timestamp >= sevenDaysAgo).toArray(),
    db.pumps.where('babyId').equals(babyId).and(p => p.timestamp >= sevenDaysAgo).toArray(),
  ]);

  // Bucket by local calendar day.
  const buckets = new Map<string, { feeds: FeedEntry[]; diapers: DiaperEntry[]; pumps: PumpEntry[] }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    buckets.set(key, { feeds: [], diapers: [], pumps: [] });
  }
  const keyForTs = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  for (const f of feeds7) buckets.get(keyForTs(f.timestamp))?.feeds.push(f);
  for (const d of diapers7) buckets.get(keyForTs(d.timestamp))?.diapers.push(d);
  for (const p of pumps7) buckets.get(keyForTs(p.timestamp))?.pumps.push(p);

  const days = [...buckets.values()];
  const feedsPerDay = days.map(d => d.feeds.length);
  const volumePerDayMl = days.map(d =>
    d.feeds.reduce((sum, f) => sum + (f.type === 'bottle' && f.amount
      ? (f.unit === 'mL' ? f.amount : f.amount * ML_PER_OZ)
      : 0), 0),
  ).map(v => Math.round(v));
  const wetPerDay = days.map(d => d.diapers.filter(x => x.type === 'wet' || x.type === 'both').length);
  const stoolPerDay = days.map(d => d.diapers.filter(x => x.type === 'stool' || x.type === 'both').length);
  const pumpsPerDay = days.map(d => d.pumps.length);

  // Raw events — last 48h only.
  const recentFeeds = feeds7
    .filter(f => f.timestamp >= fortyEightHAgo)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(f => ({
      ts: f.timestamp,
      type: f.type,
      ml: f.type === 'bottle' && f.amount
        ? Math.round(f.unit === 'mL' ? f.amount : f.amount * ML_PER_OZ)
        : null,
      notes: f.notes,
    }));
  const recentDiapers = diapers7
    .filter(d => d.timestamp >= fortyEightHAgo)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(d => ({
      ts: d.timestamp,
      type: d.type,
      color: d.stoolColor,
      consistency: d.stoolConsistency,
    }));
  const recentPumps = pumps7
    .filter(p => p.timestamp >= fortyEightHAgo)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(p => ({
      ts: p.timestamp,
      side: p.side,
      ml: p.amount
        ? Math.round(p.unit === 'mL' ? p.amount : p.amount * ML_PER_OZ)
        : null,
    }));

  return {
    babySummary: {
      name: babyName,
      ageDays: dayOfLife(dob),
      feedingModel: feedingModel(feeds7),
      last7Days: { feedsPerDay, volumePerDayMl, wetPerDay, stoolPerDay, pumpsPerDay },
    },
    recentEvents: {
      feeds: recentFeeds,
      diapers: recentDiapers,
      pumps: recentPumps,
    },
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { activeBaby } = useApp();
  const { t } = useLanguage();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { gate: gateAi, modal: aiGateModal } = useAiGate();

  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const ageDays = activeBaby ? dayOfLife(activeBaby.dob) : 0;
  const staticTip = useMemo(() => pickStaticTip(ageDays), [ageDays]);

  // Suggested prompts pivot on gender for natural-sounding copy.
  const promptChips = useMemo(() => {
    if (!activeBaby) return [] as string[];
    const male = activeBaby.gender === 'male';
    return [
      male ? t('chat.prompt.feedingEnoughHe') : t('chat.prompt.feedingEnough'),
      male ? t('chat.prompt.diaperNormalHe') : t('chat.prompt.diaperNormal'),
      t('chat.prompt.growthSpurt'),
      t('chat.prompt.clusterFeeding'),
    ];
  }, [activeBaby, t]);

  // Online/offline listener.
  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Load AI insight: cache first, fetch in background if missing.
  const loadInsight = useCallback(async (force: boolean) => {
    if (!activeBaby) return;
    if (force) clearCachedInsight(activeBaby.id);
    const cached = force ? null : getCachedInsight(activeBaby.id);
    if (cached) {
      setAiInsight(cached.text);
      return;
    }
    if (!navigator.onLine) return; // rely on static tip when offline
    // Lazy-gate: don't fetch insight until the parent has acknowledged the
    // AI disclosure on any surface. Static tip stays as the visible fallback.
    if (shouldShowAiDisclosure()) return;
    setAiInsightLoading(true);
    try {
      const ctx = await buildChatContext(activeBaby.id, activeBaby.name, activeBaby.dob);
      const text = await generateDailyInsight(ctx);
      setCachedInsight(activeBaby.id, text);
      setAiInsight(text);
    } catch {
      // Swallow — the static tip stays visible as the fallback.
      setAiInsight(null);
    } finally {
      setAiInsightLoading(false);
    }
  }, [activeBaby]);

  useEffect(() => {
    setAiInsight(null);
    loadInsight(false);
  }, [loadInsight]);

  // Auto-scroll the thread to the bottom as new content streams in.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const mapError = (e: unknown): string => {
    if (e instanceof ClaudeError) {
      if (e.code === 'rate_limit') return t('chat.error.rateLimit');
      if (e.code === 'auth') return t('chat.error.auth');
      if (e.code === 'proxy_missing') return t('chat.error.proxyMissing');
    }
    return t('chat.error.generic');
  };

  function sendMessage(text: string) {
    // Lazy-gate: first-time AI use shows the unified disclosure, then runs send.
    gateAi(() => doSendMessage(text));
  }

  async function doSendMessage(text: string) {
    if (!activeBaby || streaming || !text.trim()) return;
    // After acknowledging the disclosure, also kick off the deferred insight.
    if (!aiInsight && !aiInsightLoading) void loadInsight(false);

    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const ctx = await buildChatContext(activeBaby.id, activeBaby.name, activeBaby.dob);
      let assistantText = '';
      for await (const chunk of chatStream(nextHistory, ctx, controller.signal)) {
        assistantText += chunk;
        setMessages(m => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: 'assistant', content: assistantText };
          return copy;
        });
      }
    } catch (e) {
      // AbortError is expected when the user taps Stop.
      if ((e as { name?: string })?.name === 'AbortError') {
        // Trim trailing empty assistant message if nothing was streamed.
        setMessages(m => m[m.length - 1]?.content ? m : m.slice(0, -1));
      } else {
        setError(mapError(e));
        setMessages(m => m.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleNewChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setInput('');
  }

  if (!activeBaby) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {aiGateModal}
      {/* Scrollable thread area */}
      <div ref={threadRef} className="flex-1 scrollable px-4 pt-4">
        {/* Did you know card */}
        <div className="glass-card rounded-2xl p-4 mb-4 border border-accent-blue/15">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent-blue">
              {t('chat.didYouKnow')}
            </p>
            <button
              onClick={() => loadInsight(true)}
              disabled={aiInsightLoading || !isOnline}
              className="text-[10px] text-text-muted font-medium flex items-center gap-1 min-h-[24px] px-1 disabled:opacity-40"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={aiInsightLoading ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              {t('chat.insight.refresh')}
            </button>
          </div>
          <p className="text-[15px] font-semibold text-text-primary mb-1">{staticTip.title}</p>
          <p className="text-sm text-text-secondary leading-snug">{staticTip.body}</p>
          {(aiInsight || aiInsightLoading) && (
            <div className="mt-3 pt-3 border-t border-border">
              {aiInsightLoading && !aiInsight ? (
                <p className="text-xs text-text-muted italic">
                  {t('chat.insight.loading', { name: activeBaby.name })}
                </p>
              ) : (
                <p className="text-sm text-text-secondary leading-snug">{aiInsight}</p>
              )}
            </div>
          )}
        </div>

        {/* Empty state with suggested prompts */}
        {messages.length === 0 && (
          <div className="mb-4">
            <p className="text-[15px] font-semibold text-text-primary mb-3">
              {t('chat.prompt.headline')}
            </p>
            <div className="flex flex-col gap-2">
              {promptChips.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(chip)}
                  disabled={streaming || !isOnline}
                  className="text-left glass-card rounded-xl px-3.5 py-3 text-sm font-medium text-text-primary active:bg-bg-card-hover disabled:opacity-50 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Thread */}
        {messages.length > 0 && (
          <div className="flex flex-col gap-3 mb-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-[15px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'self-end bg-accent-blue text-white'
                    : 'self-start glass-card text-text-primary'
                }`}
              >
                {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 bg-accent-red/10 border border-accent-red/30 text-sm text-accent-red">
            {error}
          </div>
        )}

        {!isOnline && (
          <div className="mb-4 rounded-xl px-4 py-3 bg-accent-amber/10 border border-accent-amber/30">
            <p className="text-sm font-semibold text-accent-amber mb-0.5">{t('chat.offline.title')}</p>
            <p className="text-xs text-text-muted">{t('chat.offline.body')}</p>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-border px-4 py-3 bg-bg-surface">
        <div className="flex items-end gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              disabled={streaming}
              className="min-h-[44px] px-2 text-xs text-text-muted font-medium disabled:opacity-40"
              title={t('chat.newChat')}
              aria-label={t('chat.newChat')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={t('chat.input.placeholder')}
            disabled={!isOnline}
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-bg-input px-4 py-2.5 text-[15px] text-text-primary outline-none focus:ring-2 focus:ring-accent-blue disabled:opacity-50 min-h-[44px] max-h-[120px]"
          />
          {streaming ? (
            <button
              onClick={handleStop}
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-accent-red text-white font-semibold flex items-center justify-center"
              aria-label={t('chat.stop')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || !isOnline}
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-accent-blue text-white font-semibold flex items-center justify-center disabled:opacity-40"
              aria-label={t('chat.send')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-[10px] text-text-muted mt-2 text-center px-4">
          {t('chat.disclaimer')}
        </p>
      </div>
    </div>
  );
}
