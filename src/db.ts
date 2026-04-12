import Dexie, { type Table } from 'dexie';
import type { BabyProfile, FeedEntry, DiaperEntry, PumpEntry } from './types';

export class BabyLogDB extends Dexie {
  babies!: Table<BabyProfile>;
  feeds!: Table<FeedEntry>;
  diapers!: Table<DiaperEntry>;
  pumps!: Table<PumpEntry>;

  constructor() {
    super('babylog');
    this.version(1).stores({
      babies: 'id, createdAt',
      feeds: 'id, babyId, timestamp, createdAt',
      diapers: 'id, babyId, timestamp, createdAt',
      pumps: 'id, babyId, timestamp, createdAt',
    });
  }
}

export const db = new BabyLogDB();
