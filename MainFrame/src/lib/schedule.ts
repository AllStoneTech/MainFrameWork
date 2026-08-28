// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Scheduled display for Matrix Studio's Canvas and Animator tabs —
 * "show this saved arrangement daily at a time, or every time
 * MainFrameWork starts." Entirely host-driven, like everything else in
 * this app that touches the device: there's no on-device concept of a
 * schedule (see matrixPatterns.ts's doc comment on why custom animation
 * can't live on the module itself), so a schedule only fires while
 * MainFrameWork is running.
 *
 * Each entry stores a full snapshot of the arrangement's data at the
 * time it was scheduled (not a live reference to the saved arrangement)
 * — deliberately, so a schedule entry can't silently break if the
 * source arrangement is later renamed or deleted.
 */

export type ScheduleTrigger = { type: "time"; time: string } | { type: "startup" };

export interface ScheduleEntry<T> {
  id: string;
  label: string;
  trigger: ScheduleTrigger;
  data: T;
}

export function addScheduleEntry<T>(
  list: ScheduleEntry<T>[],
  label: string,
  trigger: ScheduleTrigger,
  data: T
): ScheduleEntry<T>[] {
  return [...list, { id: crypto.randomUUID(), label, trigger, data }];
}

export function removeScheduleEntry<T>(list: ScheduleEntry<T>[], id: string): ScheduleEntry<T>[] {
  return list.filter((entry) => entry.id !== id);
}

/** "HH:MM" in the local timezone, zero-padded — matches `<input type="time">`'s value format. */
export function formatTimeOfDay(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** A per-entry, per-minute key so a repeated poll within the same minute doesn't refire it. */
function fireKey(entryId: string, now: Date): string {
  return `${entryId}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${formatTimeOfDay(now)}`;
}

export interface DueResult<T> {
  toFire: ScheduleEntry<T>[];
  keysToMark: string[];
}

/**
 * Which `type: "time"` entries are due right now: their time-of-day
 * matches `now` and they haven't already fired in this exact minute
 * (tracked via `firedKeys`, which the caller persists across polls and
 * updates with `keysToMark`). `type: "startup"` entries are never
 * returned here — see `startupEntries`.
 */
export function dueTimeEntries<T>(entries: ScheduleEntry<T>[], now: Date, firedKeys: ReadonlySet<string>): DueResult<T> {
  const nowTime = formatTimeOfDay(now);
  const toFire: ScheduleEntry<T>[] = [];
  const keysToMark: string[] = [];

  for (const entry of entries) {
    if (entry.trigger.type !== "time" || entry.trigger.time !== nowTime) continue;
    const key = fireKey(entry.id, now);
    if (firedKeys.has(key)) continue;
    toFire.push(entry);
    keysToMark.push(key);
  }

  return { toFire, keysToMark };
}

/** All `type: "startup"` entries — meant to be fired once, on mount. */
export function startupEntries<T>(entries: ScheduleEntry<T>[]): ScheduleEntry<T>[] {
  return entries.filter((entry) => entry.trigger.type === "startup");
}
