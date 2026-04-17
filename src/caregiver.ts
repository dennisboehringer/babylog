// Per-device caregiver name. Stamped onto every new entry's `loggedBy` field
// so the timeline can show "who logged this" in shared-caregiver households.
//
// Caretaker Systems requirement: ambiguity about who entered what kills trust.
// Stored only in localStorage (per device, never synced) — the value travels
// inside each entry it stamps.

const KEY = 'babylog_caregiver_name';

export function getCaregiverName(): string | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return v && v.trim().length > 0 ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function setCaregiverName(name: string): void {
  const trimmed = name.trim();
  try {
    if (trimmed.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, trimmed);
  } catch { /* ignore */ }
}
