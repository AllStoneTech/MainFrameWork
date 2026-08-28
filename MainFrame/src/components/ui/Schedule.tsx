// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Scheduled display for Matrix Studio's Canvas and Animator tabs — a
 * toolbar popover (matching SavedArrangements.tsx's pattern) for
 * picking a saved arrangement, a trigger ("daily at a time" or "on
 * MainFrameWork startup"), and a label, then firing `onFire(data)` when
 * that trigger condition is met. See schedule.ts for why entries store
 * a full data snapshot rather than a live reference to the saved
 * arrangement.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { CalendarClock, Trash2, X } from "lucide-react";
import { PixelGrid } from "./PixelGrid";
import { addScheduleEntry, dueTimeEntries, removeScheduleEntry, startupEntries, type ScheduleEntry, type ScheduleTrigger } from "../../lib/schedule";
import type { SavedArrangement } from "../../lib/savedArrangements";
import { loadSettings, patchSettings } from "../../lib/settings";

// How often to check whether a "daily at a time" entry is due. A minute
// would also work (entries are keyed to the minute anyway — see
// schedule.ts's fireKey), but this stays comfortably under a minute so
// a scheduled minute is never missed by polling timing alone.
const CHECK_INTERVAL_MS = 20_000;

interface ScheduleProps<T> {
  /** Key this schedule's own entries persist under, e.g. "matrix_canvas_schedule". */
  settingsKey: string;
  /** Key to read available saved arrangements from, for the "which arrangement" picker. */
  arrangementsKey: string;
  /** Called with an entry's snapshotted data when its trigger fires. */
  onFire: (data: T) => void;
  previewPixels: (data: T) => number[];
  previewWidth: number;
  previewHeight: number;
}

function describeTrigger(trigger: ScheduleTrigger): string {
  return trigger.type === "startup" ? "On startup" : `Daily at ${trigger.time}`;
}

export function Schedule<T>({
  settingsKey,
  arrangementsKey,
  onFire,
  previewPixels,
  previewWidth,
  previewHeight,
}: ScheduleProps<T>): ReactElement {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ScheduleEntry<T>[]>([]);
  const [arrangements, setArrangements] = useState<SavedArrangement<T>[]>([]);
  const [label, setLabel] = useState("");
  const [selectedArrangementId, setSelectedArrangementId] = useState("");
  const [triggerType, setTriggerType] = useState<"time" | "startup">("time");
  const [time, setTime] = useState("09:00");
  const loaded = useRef(false);
  const firedKeys = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = settings[settingsKey] as ScheduleEntry<T>[] | undefined;
      if (saved) setEntries(saved);
      loaded.current = true;
    });
  }, [settingsKey]);

  useEffect(() => {
    if (!loaded.current) return;
    patchSettings({ [settingsKey]: entries }).catch((err) => console.error(`Failed to save ${settingsKey}:`, err));
  }, [entries, settingsKey]);

  // Arrangements are only read here to populate the picker at creation
  // time — re-loaded whenever the popover opens so a design saved while
  // it was closed still shows up.
  useEffect(() => {
    if (!open) return;
    loadSettings().then((settings) => {
      setArrangements((settings[arrangementsKey] as SavedArrangement<T>[] | undefined) ?? []);
    });
  }, [open, arrangementsKey]);

  // Fire any "on startup" entries exactly once, shortly after the
  // schedule's own entries have loaded from disk.
  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = (settings[settingsKey] as ScheduleEntry<T>[] | undefined) ?? [];
      for (const entry of startupEntries(saved)) onFireRef.current(entry.data);
    });
    // Runs once on mount only — re-firing startup entries on every
    // settingsKey change would replay them whenever entries are edited.
  }, []);

  // Polls for "daily at a time" entries becoming due while the tab is
  // mounted — see the module doc comment for why this can only ever be
  // host-driven, not on-device.
  useEffect(() => {
    const check = (): void => {
      const { toFire, keysToMark } = dueTimeEntries(entries, new Date(), firedKeys.current);
      for (const key of keysToMark) firedKeys.current.add(key);
      for (const entry of toFire) onFireRef.current(entry.data);
    };
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [entries]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAdd = (): void => {
    const arrangement = arrangements.find((a) => a.id === selectedArrangementId);
    if (!arrangement || !label.trim()) return;
    const trigger: ScheduleTrigger = triggerType === "startup" ? { type: "startup" } : { type: "time", time };
    setEntries((prev) => addScheduleEntry(prev, label.trim(), trigger, arrangement.data));
    setLabel("");
    setSelectedArrangementId("");
  };

  const handleDelete = (id: string): void => {
    setEntries((prev) => removeScheduleEntry(prev, id));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Scheduled display"
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white text-sm font-medium"
      >
        <CalendarClock size={16} /> Schedule
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 z-20 p-3 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Scheduled Display</span>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2 mb-3 p-2 bg-black/20 border border-white/5 rounded-lg">
            <select
              value={selectedArrangementId}
              onChange={(e) => {
                setSelectedArrangementId(e.target.value);
                const arrangement = arrangements.find((a) => a.id === e.target.value);
                if (arrangement && !label.trim()) setLabel(arrangement.name);
              }}
              style={{ colorScheme: "dark" }}
              className="w-full px-2 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200"
            >
              <option value="" disabled>
                {arrangements.length === 0 ? "No saved arrangements yet" : "Pick a saved arrangement..."}
              </option>
              {arrangements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as "time" | "startup")}
                style={{ colorScheme: "dark" }}
                className="px-2 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200"
              >
                <option value="time">Daily at</option>
                <option value="startup">On startup</option>
              </select>
              {triggerType === "time" && (
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={{ colorScheme: "dark" }}
                  className="px-2 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200"
                />
              )}
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label"
                style={{ colorScheme: "dark" }}
                className="flex-1 min-w-0 px-2 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200"
              />
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedArrangementId || !label.trim()}
              className="w-full px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          {entries.length === 0 ? (
            <p className="text-xs text-gray-500 py-2 text-center">Nothing scheduled yet.</p>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 p-1.5 rounded-lg border border-white/5 bg-black/20 hover:border-white/20"
                >
                  <div className="shrink-0 bg-black/60 rounded p-1">
                    <PixelGrid
                      width={previewWidth}
                      height={previewHeight}
                      pixels={previewPixels(entry.data)}
                      cellSize={1.5}
                      gap={0.5}
                      interactive={false}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{entry.label}</div>
                    <div className="text-xs text-gray-500">{describeTrigger(entry.trigger)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    title="Delete"
                    className="p-1 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
