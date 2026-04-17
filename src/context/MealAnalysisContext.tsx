import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { FoodItem } from '../types';
import { db } from '../db';

// Background meal-photo analysis. Capture closes the entry sheet immediately;
// the request runs in the background; a toast appears on completion. Tap the
// toast to open the confirmation sheet pre-populated with the result.
//
// Florencia veto: blocking spinners after photo capture broke "<5s, one-handed".
// This eliminates the wait — parent can keep using the app while analysis runs.

export interface MealAnalysisResult {
  foods: FoodItem[];
  aiModel: string;
  aiConfidence: number;
  warnings: string[];
}

export type MealAnalysisState =
  | { status: 'idle' }
  | { status: 'analyzing'; startedAt: number; photoBlob: Blob }
  | { status: 'ready'; result: MealAnalysisResult; photoBlob: Blob }
  | { status: 'error'; error: string; photoBlob: Blob | null };

interface MealAnalysisContextValue {
  state: MealAnalysisState;
  startAnalysis: (
    file: File,
    context: { stage: string; ageMonths: number; locale: string },
  ) => Promise<void>;
  /** Confirmation sheet calls this when it opens to take ownership of the result. */
  consume: () => { result: MealAnalysisResult | null; photoBlob: Blob | null };
  /** Drop the current ready/error state without consuming (user dismissed toast). */
  dismiss: () => void;
}

const Ctx = createContext<MealAnalysisContextValue>({
  state: { status: 'idle' },
  startAnalysis: async () => {},
  consume: () => ({ result: null, photoBlob: null }),
  dismiss: () => {},
});

export function MealAnalysisProvider({ children }: { children: ReactNode }) {
  const [state, setStateInternal] = useState<MealAnalysisState>({ status: 'idle' });

  // Persist every state change to IndexedDB so a tab close / cold start can
  // recover. Blob is base64-encoded for safe JSON round-trip.
  const setState = useCallback((next: MealAnalysisState) => {
    setStateInternal(next);
    void persistState(next);
  }, []);

  // Rehydrate on mount.
  useEffect(() => {
    void rehydrate().then(restored => {
      if (!restored) return;
      // If a request was mid-flight when the tab closed, we can't resume the
      // fetch — surface as 'error' so the user gets a "tap to log manually"
      // path instead of a frozen "analyzing" toast.
      if (restored.status === 'analyzing') {
        setStateInternal({
          status: 'error',
          error: 'Interrupted — please retry',
          photoBlob: restored.photoBlob,
        });
      } else {
        setStateInternal(restored);
      }
    });
  }, []);

  const startAnalysis = useCallback(async (
    file: File,
    context: { stage: string; ageMonths: number; locale: string },
  ) => {
    let photoBlob: Blob;
    try {
      photoBlob = await resizeImage(file, 1024, 0.85);
    } catch (e) {
      setState({ status: 'error', error: 'Could not read photo', photoBlob: null });
      return;
    }
    setState({ status: 'analyzing', startedAt: Date.now(), photoBlob });

    try {
      const base64 = await blobToBase64(photoBlob);
      const res = await fetch('/api/meal-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          imageMimeType: 'image/jpeg',
          context,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as MealAnalysisResult;
      setState({ status: 'ready', result: data, photoBlob });
    } catch (e: unknown) {
      setState({
        status: 'error',
        error: e instanceof Error ? e.message : 'Unknown error',
        photoBlob,
      });
    }
  }, []);

  const consume = useCallback(() => {
    if (state.status === 'ready') {
      setState({ status: 'idle' });
      return { result: state.result, photoBlob: state.photoBlob };
    }
    if (state.status === 'error') {
      setState({ status: 'idle' });
      return { result: null, photoBlob: state.photoBlob };
    }
    return { result: null, photoBlob: null };
  }, [state]);

  const dismiss = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return (
    <Ctx.Provider value={{ state, startAnalysis, consume, dismiss }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMealAnalysis() {
  return useContext(Ctx);
}

// ----------------------------------------------------------------------------
// helpers — duplicated from MealFlow so the context is self-contained
// ----------------------------------------------------------------------------

async function resizeImage(file: File, maxEdge: number, quality: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const ratio = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * ratio);
  const h = Math.round(bmp.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ----------------------------------------------------------------------------
// Persistence (Trust Guardian: cold start should recover in-flight analysis)
// ----------------------------------------------------------------------------

interface SerializedState {
  status: MealAnalysisState['status'];
  startedAt?: number;
  result?: MealAnalysisResult;
  error?: string;
  photoBlobB64?: string;
  photoBlobMime?: string;
}

async function persistState(s: MealAnalysisState): Promise<void> {
  try {
    if (s.status === 'idle') {
      await db.mealAnalysisState.delete('singleton');
      return;
    }
    const blob = ('photoBlob' in s ? s.photoBlob : null);
    const ser: SerializedState = {
      status: s.status,
      startedAt: s.status === 'analyzing' ? s.startedAt : undefined,
      result: s.status === 'ready' ? s.result : undefined,
      error: s.status === 'error' ? s.error : undefined,
      photoBlobMime: blob?.type ?? 'image/jpeg',
      photoBlobB64: blob ? await blobToBase64(blob) : undefined,
    };
    await db.mealAnalysisState.put({
      id: 'singleton',
      json: JSON.stringify(ser),
      updatedAt: Date.now(),
    });
  } catch { /* ignore */ }
}

async function rehydrate(): Promise<MealAnalysisState | null> {
  try {
    const row = await db.mealAnalysisState.get('singleton');
    if (!row) return null;
    const ser: SerializedState = JSON.parse(row.json);
    const photoBlob = ser.photoBlobB64
      ? base64ToBlob(ser.photoBlobB64, ser.photoBlobMime ?? 'image/jpeg')
      : null;
    if (ser.status === 'analyzing') {
      return { status: 'analyzing', startedAt: ser.startedAt ?? Date.now(), photoBlob: photoBlob! };
    }
    if (ser.status === 'ready' && ser.result && photoBlob) {
      return { status: 'ready', result: ser.result, photoBlob };
    }
    if (ser.status === 'error') {
      return { status: 'error', error: ser.error ?? 'Unknown error', photoBlob };
    }
    return null;
  } catch {
    return null;
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
