import { rtdb, ref, onValue, set, remove, get } from './firebase';
import { db } from './db';
import type {
  FeedEntry,
  DiaperEntry,
  PumpEntry,
  BabyProfile,
  MealEntry,
  DrinkEntry,
} from './types';

// Collections eligible for sync. `photoBlobs` is intentionally absent —
// raw photos stay local. MealEntry carries `hasPhoto: boolean` for awareness.
export type SyncCollection = 'feeds' | 'diapers' | 'pumps' | 'babies' | 'meals' | 'drinks';

// Kept as 'babylog_room_code' so existing users stay logged into their collaboration
// across this rename — do not change the stored value.
const COLLAB_KEY = 'babylog_room_code';

// Firebase path prefix — dev vs prod isolation.
// Kept as 'rooms' / 'rooms-dev' so existing prod data remains accessible.
const PATH_PREFIX = import.meta.env.VITE_FIREBASE_PATH_PREFIX ?? 'rooms';

export function getEnvironment(): 'production' | 'development' {
  return PATH_PREFIX === 'rooms' ? 'production' : 'development';
}

export function getCollabCode(): string | null {
  return localStorage.getItem(COLLAB_KEY);
}

export function setCollabCode(code: string) {
  localStorage.setItem(COLLAB_KEY, code);
}

export function clearCollabCode() {
  localStorage.removeItem(COLLAB_KEY);
}

export function generateCollabCode(): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Push all local data to Firebase under the collaboration
export async function pushAllData(collabCode: string) {
  const babies = await db.babies.toArray();
  const feeds = await db.feeds.toArray();
  const diapers = await db.diapers.toArray();
  const pumps = await db.pumps.toArray();
  const meals = await db.meals.toArray();
  const drinks = await db.drinks.toArray();
  // photoBlobs intentionally NOT included — raw photos stay local.

  const collabRef = ref(rtdb, `${PATH_PREFIX}/${collabCode}`);

  const data: Record<string, any> = {
    babies: {},
    feeds: {},
    diapers: {},
    pumps: {},
    meals: {},
    drinks: {},
    updatedAt: Date.now(),
  };

  babies.forEach(b => { data.babies[b.id] = b; });
  feeds.forEach(f => { data.feeds[f.id] = f; });
  diapers.forEach(d => { data.diapers[d.id] = d; });
  pumps.forEach(p => { data.pumps[p.id] = p; });
  meals.forEach(m => { data.meals[m.id] = m; });
  drinks.forEach(d => { data.drinks[d.id] = d; });

  await set(collabRef, data);
}

// Fetch all data from a collaboration and merge into local IndexedDB.
// Returns true if the collaboration exists and has data.
export async function fetchCollabData(collabCode: string): Promise<boolean> {
  const collabRef = ref(rtdb, `${PATH_PREFIX}/${collabCode}`);
  const snapshot = await get(collabRef);
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
      // Belt-and-braces: default legacy bottle feeds missing milkType to 'formula'
      // in case an older client pushes data that bypassed the local Dexie v2 migration.
      if (feed.type === 'bottle' && (feed.milkType === null || feed.milkType === undefined)) {
        feed.milkType = 'formula';
      }
      const existing = await db.feeds.get(feed.id);
      if (!existing || isRemoteNewer(feed, existing)) {
        await db.feeds.put(feed);
      }
    }
  }

  // Sync diapers
  if (data.diapers) {
    const remoteDiapers: DiaperEntry[] = Object.values(data.diapers);
    for (const diaper of remoteDiapers) {
      const existing = await db.diapers.get(diaper.id);
      if (!existing || isRemoteNewer(diaper, existing)) {
        await db.diapers.put(diaper);
      }
    }
  }

  // Sync pumps
  if (data.pumps) {
    const remotePumps: PumpEntry[] = Object.values(data.pumps);
    for (const pump of remotePumps) {
      const existing = await db.pumps.get(pump.id);
      if (!existing || isRemoteNewer(pump, existing)) {
        await db.pumps.put(pump);
      }
    }
  }

  // Sync meals (toddler-stage food log)
  if (data.meals) {
    const remoteMeals: MealEntry[] = Object.values(data.meals);
    for (const meal of remoteMeals) {
      const existing = await db.meals.get(meal.id);
      if (!existing || isRemoteNewer(meal, existing)) {
        await db.meals.put(meal);
      }
    }
  }

  // Sync drinks (milk/water/etc., toddler-stage)
  if (data.drinks) {
    const remoteDrinks: DrinkEntry[] = Object.values(data.drinks);
    for (const drink of remoteDrinks) {
      const existing = await db.drinks.get(drink.id);
      if (!existing || isRemoteNewer(drink, existing)) {
        await db.drinks.put(drink);
      }
    }
  }
}

// Remote wins when it has a more recent modifiedAt than local.
// Falls back to createdAt so legacy entries without modifiedAt don't clobber edits.
function isRemoteNewer(
  remote: { modifiedAt?: number; createdAt: number },
  local: { modifiedAt?: number; createdAt: number },
): boolean {
  const r = remote.modifiedAt ?? remote.createdAt;
  const l = local.modifiedAt ?? local.createdAt;
  return r > l;
}

// Push a single entry to Firebase
export async function pushEntry(
  collabCode: string,
  collection: SyncCollection,
  id: string,
  data: any
) {
  const entryRef = ref(rtdb, `${PATH_PREFIX}/${collabCode}/${collection}/${id}`);
  await set(entryRef, data);
  const tsRef = ref(rtdb, `${PATH_PREFIX}/${collabCode}/updatedAt`);
  await set(tsRef, Date.now());
}

// Remove a single entry from Firebase
export async function removeEntry(
  collabCode: string,
  collection: SyncCollection,
  id: string
) {
  const entryRef = ref(rtdb, `${PATH_PREFIX}/${collabCode}/${collection}/${id}`);
  await remove(entryRef);
}

// Listen for changes from Firebase and sync to local IndexedDB
export function listenForChanges(
  collabCode: string,
  onUpdate: () => void
): () => void {
  const collabRef = ref(rtdb, `${PATH_PREFIX}/${collabCode}`);

  const unsubscribe = onValue(collabRef, async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    await mergeRemoteData(data);
    onUpdate();
  });

  return unsubscribe;
}
