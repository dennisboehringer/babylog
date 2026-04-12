import { rtdb, ref, onValue, set, remove, get } from './firebase';
import { db } from './db';
import type { FeedEntry, DiaperEntry, PumpEntry, BabyProfile } from './types';

const ROOM_KEY = 'babylog_room_code';

export function getRoomCode(): string | null {
  return localStorage.getItem(ROOM_KEY);
}

export function setRoomCode(code: string) {
  localStorage.setItem(ROOM_KEY, code);
}

export function clearRoomCode() {
  localStorage.removeItem(ROOM_KEY);
}

export function generateRoomCode(): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Push all local data to Firebase under the room
export async function pushAllData(roomCode: string) {
  const babies = await db.babies.toArray();
  const feeds = await db.feeds.toArray();
  const diapers = await db.diapers.toArray();
  const pumps = await db.pumps.toArray();

  const roomRef = ref(rtdb, `rooms/${roomCode}`);

  const data: Record<string, any> = {
    babies: {},
    feeds: {},
    diapers: {},
    pumps: {},
    updatedAt: Date.now(),
  };

  babies.forEach(b => { data.babies[b.id] = b; });
  feeds.forEach(f => { data.feeds[f.id] = f; });
  diapers.forEach(d => { data.diapers[d.id] = d; });
  pumps.forEach(p => { data.pumps[p.id] = p; });

  await set(roomRef, data);
}

// Fetch all data from a room and merge into local IndexedDB
// Returns true if the room exists and has data
export async function fetchRoomData(roomCode: string): Promise<boolean> {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);
  const data = snapshot.val();
  if (!data) return false;

  await mergeRemoteData(data);
  return true;
}

// Merge remote data into local IndexedDB
async function mergeRemoteData(data: any) {
  // Sync babies
  if (data.babies) {
    const remoteBabies: BabyProfile[] = Object.values(data.babies);
    for (const baby of remoteBabies) {
      const existing = await db.babies.get(baby.id);
      if (!existing) {
        await db.babies.put(baby);
      } else if (existing.createdAt < baby.createdAt) {
        // Remote is newer — update local
        await db.babies.put(baby);
      }
    }
  }

  // Sync feeds
  if (data.feeds) {
    const remoteFeeds: FeedEntry[] = Object.values(data.feeds);
    for (const feed of remoteFeeds) {
      const existing = await db.feeds.get(feed.id);
      if (!existing) {
        await db.feeds.put(feed);
      }
    }
  }

  // Sync diapers
  if (data.diapers) {
    const remoteDiapers: DiaperEntry[] = Object.values(data.diapers);
    for (const diaper of remoteDiapers) {
      const existing = await db.diapers.get(diaper.id);
      if (!existing) {
        await db.diapers.put(diaper);
      }
    }
  }

  // Sync pumps
  if (data.pumps) {
    const remotePumps: PumpEntry[] = Object.values(data.pumps);
    for (const pump of remotePumps) {
      const existing = await db.pumps.get(pump.id);
      if (!existing) {
        await db.pumps.put(pump);
      }
    }
  }
}

// Push a single entry to Firebase
export async function pushEntry(
  roomCode: string,
  collection: 'feeds' | 'diapers' | 'pumps' | 'babies',
  id: string,
  data: any
) {
  const entryRef = ref(rtdb, `rooms/${roomCode}/${collection}/${id}`);
  await set(entryRef, data);
  // Update timestamp
  const tsRef = ref(rtdb, `rooms/${roomCode}/updatedAt`);
  await set(tsRef, Date.now());
}

// Remove a single entry from Firebase
export async function removeEntry(
  roomCode: string,
  collection: 'feeds' | 'diapers' | 'pumps' | 'babies',
  id: string
) {
  const entryRef = ref(rtdb, `rooms/${roomCode}/${collection}/${id}`);
  await remove(entryRef);
}

// Listen for changes from Firebase and sync to local IndexedDB
export function listenForChanges(
  roomCode: string,
  onUpdate: () => void
): () => void {
  const roomRef = ref(rtdb, `rooms/${roomCode}`);

  const unsubscribe = onValue(roomRef, async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    await mergeRemoteData(data);
    onUpdate();
  });

  return unsubscribe;
}
