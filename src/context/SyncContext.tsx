import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  getRoomCode, setRoomCode as storeRoomCode, clearRoomCode,
  generateRoomCode, pushAllData, pushEntry, removeEntry, listenForChanges,
} from '../sync';

interface SyncState {
  roomCode: string | null;
  syncing: boolean;
  connected: boolean;
}

interface SyncContextValue {
  sync: SyncState;
  createRoom: () => Promise<string>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => void;
  syncPush: (collection: 'feeds' | 'diapers' | 'pumps' | 'babies', id: string, data: any) => Promise<void>;
  syncRemove: (collection: 'feeds' | 'diapers' | 'pumps' | 'babies', id: string) => Promise<void>;
  onRemoteUpdate: (() => void) | null;
  setOnRemoteUpdate: (cb: (() => void) | null) => void;
}

const SyncCtx = createContext<SyncContextValue>({
  sync: { roomCode: null, syncing: false, connected: false },
  createRoom: async () => '',
  joinRoom: async () => {},
  leaveRoom: () => {},
  syncPush: async () => {},
  syncRemove: async () => {},
  onRemoteUpdate: null,
  setOnRemoteUpdate: () => {},
});

export function SyncProvider({ children }: { children: ReactNode }) {
  const [sync, setSync] = useState<SyncState>({
    roomCode: getRoomCode(),
    syncing: false,
    connected: !!getRoomCode(),
  });
  const [onRemoteUpdate, setOnRemoteUpdate] = useState<(() => void) | null>(null);

  // Listen for remote changes when connected
  useEffect(() => {
    if (!sync.roomCode) return;

    const unsub = listenForChanges(sync.roomCode, () => {
      if (onRemoteUpdate) onRemoteUpdate();
    });

    return unsub;
  }, [sync.roomCode, onRemoteUpdate]);

  const createRoom = useCallback(async () => {
    const code = generateRoomCode();
    storeRoomCode(code);
    setSync({ roomCode: code, syncing: true, connected: true });
    await pushAllData(code);
    setSync(s => ({ ...s, syncing: false }));
    return code;
  }, []);

  const joinRoom = useCallback(async (code: string) => {
    storeRoomCode(code);
    setSync({ roomCode: code, syncing: false, connected: true });
  }, []);

  const leaveRoom = useCallback(() => {
    clearRoomCode();
    setSync({ roomCode: null, syncing: false, connected: false });
  }, []);

  const syncPush = useCallback(async (
    collection: 'feeds' | 'diapers' | 'pumps' | 'babies',
    id: string,
    data: any
  ) => {
    if (!sync.roomCode) return;
    try {
      await pushEntry(sync.roomCode, collection, id, data);
    } catch (e) {
      console.warn('Sync push failed (will retry on next sync):', e);
    }
  }, [sync.roomCode]);

  const syncRemove = useCallback(async (
    collection: 'feeds' | 'diapers' | 'pumps' | 'babies',
    id: string
  ) => {
    if (!sync.roomCode) return;
    try {
      await removeEntry(sync.roomCode, collection, id);
    } catch (e) {
      console.warn('Sync remove failed:', e);
    }
  }, [sync.roomCode]);

  return (
    <SyncCtx.Provider value={{ sync, createRoom, joinRoom, leaveRoom, syncPush, syncRemove, onRemoteUpdate, setOnRemoteUpdate }}>
      {children}
    </SyncCtx.Provider>
  );
}

export function useSync() {
  return useContext(SyncCtx);
}
