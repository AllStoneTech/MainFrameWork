// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import {
  addScheduleEntry,
  removeScheduleEntry,
  formatTimeOfDay,
  dueTimeEntries,
  startupEntries,
  type ScheduleEntry,
} from "./schedule";

describe("addScheduleEntry", () => {
  it("appends a new entry with the given label, trigger, and data", () => {
    const result = addScheduleEntry<number>([], "Morning", { type: "time", time: "09:00" }, 42);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Morning");
    expect(result[0].trigger).toEqual({ type: "time", time: "09:00" });
    expect(result[0].data).toBe(42);
    expect(typeof result[0].id).toBe("string");
  });

  it("does not mutate the input list", () => {
    const list: ScheduleEntry<number>[] = [];
    addScheduleEntry(list, "A", { type: "startup" }, 1);
    expect(list).toHaveLength(0);
  });

  it("generates unique ids across multiple adds", () => {
    let list: ScheduleEntry<number>[] = [];
    list = addScheduleEntry(list, "A", { type: "startup" }, 1);
    list = addScheduleEntry(list, "B", { type: "startup" }, 2);
    expect(new Set(list.map((e) => e.id)).size).toBe(2);
  });
});

describe("removeScheduleEntry", () => {
  it("removes only the matching entry", () => {
    let list: ScheduleEntry<number>[] = [];
    list = addScheduleEntry(list, "A", { type: "startup" }, 1);
    list = addScheduleEntry(list, "B", { type: "startup" }, 2);
    const result = removeScheduleEntry(list, list[0].id);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("B");
  });

  it("is a no-op for an unknown id", () => {
    const list = addScheduleEntry<number>([], "A", { type: "startup" }, 1);
    expect(removeScheduleEntry(list, "nope")).toEqual(list);
  });
});

describe("formatTimeOfDay", () => {
  it("zero-pads hours and minutes", () => {
    expect(formatTimeOfDay(new Date(2026, 0, 1, 9, 5))).toBe("09:05");
  });

  it("handles midnight and near-midnight", () => {
    expect(formatTimeOfDay(new Date(2026, 0, 1, 0, 0))).toBe("00:00");
    expect(formatTimeOfDay(new Date(2026, 0, 1, 23, 59))).toBe("23:59");
  });
});

describe("dueTimeEntries", () => {
  const now = new Date(2026, 0, 1, 9, 0);

  it("fires a time entry whose time-of-day matches now", () => {
    const entries: ScheduleEntry<number>[] = [{ id: "a", label: "A", trigger: { type: "time", time: "09:00" }, data: 1 }];
    const { toFire, keysToMark } = dueTimeEntries(entries, now, new Set());
    expect(toFire).toEqual(entries);
    expect(keysToMark).toHaveLength(1);
  });

  it("does not fire a time entry whose time doesn't match", () => {
    const entries: ScheduleEntry<number>[] = [{ id: "a", label: "A", trigger: { type: "time", time: "10:00" }, data: 1 }];
    const { toFire } = dueTimeEntries(entries, now, new Set());
    expect(toFire).toEqual([]);
  });

  it("never fires a startup entry", () => {
    const entries: ScheduleEntry<number>[] = [{ id: "a", label: "A", trigger: { type: "startup" }, data: 1 }];
    const { toFire } = dueTimeEntries(entries, now, new Set());
    expect(toFire).toEqual([]);
  });

  it("does not refire an entry whose key is already in firedKeys", () => {
    const entries: ScheduleEntry<number>[] = [{ id: "a", label: "A", trigger: { type: "time", time: "09:00" }, data: 1 }];
    const first = dueTimeEntries(entries, now, new Set());
    const second = dueTimeEntries(entries, now, new Set(first.keysToMark));
    expect(second.toFire).toEqual([]);
  });

  it("fires again once the minute changes, even for the same time-of-day (e.g. next day)", () => {
    const entries: ScheduleEntry<number>[] = [{ id: "a", label: "A", trigger: { type: "time", time: "09:00" }, data: 1 }];
    const firstFire = dueTimeEntries(entries, now, new Set());
    const nextDay = new Date(2026, 0, 2, 9, 0);
    const secondFire = dueTimeEntries(entries, nextDay, new Set(firstFire.keysToMark));
    expect(secondFire.toFire).toEqual(entries);
  });

  it("fires multiple due entries in one call and only marks the due ones", () => {
    const entries: ScheduleEntry<number>[] = [
      { id: "a", label: "A", trigger: { type: "time", time: "09:00" }, data: 1 },
      { id: "b", label: "B", trigger: { type: "time", time: "09:00" }, data: 2 },
      { id: "c", label: "C", trigger: { type: "time", time: "10:00" }, data: 3 },
    ];
    const { toFire, keysToMark } = dueTimeEntries(entries, now, new Set());
    expect(toFire.map((e) => e.id)).toEqual(["a", "b"]);
    expect(keysToMark).toHaveLength(2);
  });
});

describe("startupEntries", () => {
  it("returns only startup-triggered entries", () => {
    const entries: ScheduleEntry<number>[] = [
      { id: "a", label: "A", trigger: { type: "startup" }, data: 1 },
      { id: "b", label: "B", trigger: { type: "time", time: "09:00" }, data: 2 },
      { id: "c", label: "C", trigger: { type: "startup" }, data: 3 },
    ];
    expect(startupEntries(entries).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("returns an empty array when there are none", () => {
    const entries: ScheduleEntry<number>[] = [{ id: "a", label: "A", trigger: { type: "time", time: "09:00" }, data: 1 }];
    expect(startupEntries(entries)).toEqual([]);
  });
});
