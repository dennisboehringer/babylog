import Dexie, { type Table } from 'dexie';
import type {
  BabyProfile,
  FeedEntry,
  DiaperEntry,
  PumpEntry,
  StoredReport,
  MealEntry,
  DrinkEntry,
  PhotoBlob,
} from './types';

// Single-row table that persists in-flight meal analysis state across page
// reloads + cold starts (Trust Guardian: tab close should not lose work).
export interface MealAnalysisStateRecord {
  id: 'singleton';
  json: string;
  updatedAt: number;
}

export class BabyLogDB extends Dexie {
  babies!: Table<BabyProfile>;
  feeds!: Table<FeedEntry>;
  diapers!: Table<DiaperEntry>;
  pumps!: Table<PumpEntry>;
  reports!: Table<StoredReport>;
  meals!: Table<MealEntry>;
  drinks!: Table<DrinkEntry>;
  // LOCAL-ONLY: never read by sync.ts, never pushed to Firebase.
  photoBlobs!: Table<PhotoBlob>;
  mealAnalysisState!: Table<MealAnalysisStateRecord>;

  constructor() {
    super('babylog');

    // v1 — original schema
    this.version(1).stores({
      babies: 'id, createdAt',
      feeds: 'id, babyId, timestamp, createdAt',
      diapers: 'id, babyId, timestamp, createdAt',
      pumps: 'id, babyId, timestamp, createdAt',
    });

    // v2 — introduced `milkType` on FeedEntry.
    // Historic bottle feeds have no milkType (undefined). Default them to 'formula'.
    // Breast feeds are unaffected (milkType stays null).
    // Idempotent: entries that already have milkType set are not touched.
    this.version(2).stores({
      babies: 'id, createdAt',
      feeds: 'id, babyId, timestamp, createdAt',
      diapers: 'id, babyId, timestamp, createdAt',
      pumps: 'id, babyId, timestamp, createdAt',
    }).upgrade(async tx => {
      await tx.table<FeedEntry>('feeds').toCollection().modify(feed => {
        if (feed.type === 'bottle' && (feed.milkType === null || feed.milkType === undefined)) {
          feed.milkType = 'formula';
        }
      });
    });

    // v3 — added `reports` table for AI-generated one-pager history.
    this.version(3).stores({
      babies: 'id, createdAt',
      feeds: 'id, babyId, timestamp, createdAt',
      diapers: 'id, babyId, timestamp, createdAt',
      pumps: 'id, babyId, timestamp, createdAt',
      reports: 'id, babyId, generatedAt',
    });

    // v4 — Toddler stage support: meals + drinks + local-only photo blobs.
    // Additive only. No existing data is touched. No upgrade hook needed.
    // photoBlobs is intentionally excluded from sync (sync.ts has no entry for it).
    this.version(4).stores({
      babies: 'id, createdAt',
      feeds: 'id, babyId, timestamp, createdAt',
      diapers: 'id, babyId, timestamp, createdAt',
      pumps: 'id, babyId, timestamp, createdAt',
      reports: 'id, babyId, generatedAt',
      meals: 'id, babyId, timestamp, createdAt',
      drinks: 'id, babyId, timestamp, createdAt',
      photoBlobs: 'id, createdAt',
    });

    // v5 — single-row persistence for in-flight meal-analysis state so a
    // tab close mid-analysis can recover on next launch. Local-only.
    this.version(5).stores({
      babies: 'id, createdAt',
      feeds: 'id, babyId, timestamp, createdAt',
      diapers: 'id, babyId, timestamp, createdAt',
      pumps: 'id, babyId, timestamp, createdAt',
      reports: 'id, babyId, generatedAt',
      meals: 'id, babyId, timestamp, createdAt',
      drinks: 'id, babyId, timestamp, createdAt',
      photoBlobs: 'id, createdAt',
      mealAnalysisState: 'id',
    });
  }
}

export const db = new BabyLogDB();
