export interface BabyProfile {
  id: string;
  name: string;
  dob: string; // ISO date
  gender: 'male' | 'female' | 'other';
  themeColor: string; // hex
  unitPreference: 'oz' | 'mL';
  reminderIntervalMinutes: number;
  createdAt: number;
}

export interface FeedEntry {
  id: string;
  babyId: string;
  type: 'breast' | 'bottle';
  timestamp: number;
  leftDurationSec: number | null;
  rightDurationSec: number | null;
  leftOz: number | null;
  rightOz: number | null;
  lastSide: 'left' | 'right' | null;
  amount: number | null;
  unit: 'oz' | 'mL';
  notes: string | null;
  createdAt: number;
}

export interface DiaperEntry {
  id: string;
  babyId: string;
  timestamp: number;
  type: 'wet' | 'stool' | 'both';
  stoolColor: 'yellow' | 'green' | 'brown' | 'black' | null;
  stoolConsistency: 'seedy' | 'runny' | 'formed' | 'mucousy' | null;
  notes: string | null;
  createdAt: number;
}

export interface PumpEntry {
  id: string;
  babyId: string;
  timestamp: number;
  side: 'left' | 'right' | 'both';
  amount: number | null;
  unit: 'oz' | 'mL';
  durationSec: number | null;
  notes: string | null;
  createdAt: number;
}

export type EntryType = 'feed' | 'diaper' | 'pump';

export interface TimelineEntry {
  id: string;
  entryType: EntryType;
  timestamp: number;
  entry: FeedEntry | DiaperEntry | PumpEntry;
}
