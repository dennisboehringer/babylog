import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  getCollabCode, setCollabCode as storeCollabCode, clearCollabCode,
  generateCollabCode, pushAllData, pushEntry, removeEntry, listenForChanges,
  fetchCollabData,
  type SyncCollection,
} from '../sync';
import { db } from '../db';
import { useApp } from './AppContext';

interface SyncState {
  collabCode: string | null;
  syncing: boolean;
  connected: boolean;
}

interface SyncContextValue {
  sync: SyncState;
  startCollab: () => Promise<string>;
  joinCollab: (code: string) => Promise<boolean>;
  leaveCollab: () => void;
  syncPush: (collection: SyncCollection, id: string, data: any) => Promise<void>;
  syncRemove: (collection: SyncCollection, id: string) => Promise<void>;
  onRemoteUpdate: (() => void) | null;
  setOnRemoteUpdate: (cb: (() => void) | null) => void;
}

const SyncCtx = createContext<SyncContextValue>({
  sync: { collabCode: null, syncing: false, connected: false },
  startCollab: async () => '',
  joinCollab: async () => false,
  leaveCollab: () => {},
  syncPush: async () => {},
  syncRemove: async () => {},
  onRemoteUpdate: null,
  setOnRemoteUpdate: () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const { dispatch } = useApp();
  const [sync, setSync] = useState<SyncState>({
    collabCode: getCollabCode(),
    syncing: false,
    connected: !!getCollabCode(),
  });
  const [onRemoteUpdate, setOnRemoteUpdate] = useState<(() => void) | null>(null);

  // Refresh babies from IndexedDB into AppContext
  const refreshBabies = useCallback(async () => {
    const babies = await db.babies.toArray();
    dispatch({ type: 'SET_BABIES', babies });
  }, [dispatch]);

  // Listen for remote changes when connected
  useEffect(() => {
    if (!sync.collabCode) return;

    const unsub = listenForChanges(sync.collabCode, async () => {
      // Always refresh babies from IndexedDB — new babies may have synced
      await refreshBabies();
      if (onRemoteUpdate) onRemoteUpdate();
    });

    return unsub;
  }, [sync.collabCode, onRemoteUpdate, refreshBabies]);

  const startCollab = useCallback(async () => {
    const code = generateCollabCode();
    storeCollabCode(code);
    setSync({ collabCode: code, syncing: true, connected: true });
    await pushAllData(code);
    setSync(s => ({ ...s, syncing: false }));
    return code;
  }, []);

  // joinCollab fetches all data from Firebase and returns true if the collaboration exists
  const joinCollab = useCallback(async (code: string): Promise<boolean> => {
    storeCollabCode(code);
    setSync({ collabCode: code, syncing: true, connected: true });

    try {
      const exists = await fetchCollabData(code);
      if (!exists) {
        // Collaboration doesn't exist — clean up
        clearCollabCode();
        setSync({ collabCode: null, syncing: false, connected: false });
        return false;
      }

      // Data is now in IndexedDB — refresh AppContext
      await refreshBabies();
      setSync(s => ({ ...s, syncing: false }));
      return true;
    } catch (e) {
      console.warn('Join collaboration failed:', e);
      clearCollabCode();
      setSync({ collabCode: null, syncing: false, connected: false });
      return false;
    }
  }, [refreshBabies]);

  const leaveCollab = useCallback(() => {
    clearCollabCode();
    setSync({ collabCode: null, syncing: false, connected: false });
  }, []);

  const syncPush = useCallback(async (
    collection: SyncCollection,
    id: string,
    data: any
  ) => {
    if (!sync.collabCode) return;
    try {
      await pushEntry(sync.collabCode, collection, id, data);
    } catch (e) {
      console.warn('Sync push failed (will retry on next sync):', e);
    }
  }, [sync.collabCode]);

  const syncRemove = useCallback(async (
    collection: SyncCollection,
    id: string
  ) => {
    if (!sync.collabCode) return;
    try {
      await removeEntry(sync.collabCode, collection, id);
    } catch (e) {
      console.warn('Sync remove failed:', e);
    }
  }, [sync.collabCode]);

  return (
    <SyncCtx.Provider value={{ sync, startCollab, joinCollab, leaveCollab, syncPush, syncRemove, onRemoteUpdate, setOnRemoteUpdate }}>
      {children}
    </SyncCtx.Provider>
  );
}

export function useSync() {
  return useContext(SyncCtx);
}
