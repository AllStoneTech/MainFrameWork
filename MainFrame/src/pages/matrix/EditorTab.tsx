// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Combined Canvas+Animator editor (Matrix Studio) — the primary tab
 * once Canvas and Animator were hidden from the tab bar in favor of
 * this one (see MatrixStudio.tsx; their routes/components still exist
 * and work, just aren't linked from the nav, in case this needs to be
 * reverted).
 *
 * A single canvas is really just a 1-frame animation, so this reuses
 * AnimatorTab's exact state model and editing logic (frame-array
 * `useHistory`, brush/stamp gesture-collapsing, Play loop, Add/Delete/
 * Clear Frame, marquee generation) plus CanvasTab's Pattern presets and
 * Brightness control, wired to the *same* persisted data AnimatorTab
 * uses (`SETTINGS_KEY`/`SAVED_ARRANGEMENTS_KEY`/`SCHEDULE_KEY`, exported
 * from AnimatorTab.tsx) — editing here shows up in Animator and vice
 * versa, so nothing needs migrating if Animator is ever fully removed.
 *
 * This intentionally duplicates a fair amount of AnimatorTab.tsx's
 * component logic rather than factoring a shared hook: this editor's
 * shape kept changing across several rounds of feedback, and
 * abstracting too early would have meant repeatedly reworking a shared
 * hook instead of just the one component. Worth a real cleanup/dedup
 * pass once the shape settles and Canvas/Animator are actually deleted.
 *
 * Also re-syncs the device after the host resumes from sleep — see the
 * `RESUME_EVENT` listener effect below, and `power_watch.rs` on the Rust
 * side for how "resume" is detected. AnimatorTab/CanvasTab don't have
 * this yet since they're the hidden, non-primary routes (see above); add
 * it there too if they ever get re-linked from the nav.
 *
 * Frames can also be "live widget" frames (Clock/Battery/CPU Load,
 * `matrixFrames.ts`/`matrixWidgets.ts`) instead of hand-drawn pixels —
 * inserted the same way as a blank frame, but rendered fresh from
 * current system data every time they're displayed or played back,
 * rather than a frozen snapshot of whatever was true when inserted.
 * Live data (`now`/`batteryPercent`/`cpuPercent`) is only polled while at
 * least one widget frame actually exists in the sequence — see
 * `hasWidgetFrame` below — so a purely hand-drawn animation costs
 * nothing extra. AnimatorTab/CanvasTab don't gain widget-frame support
 * here; they still only ever write plain pixel arrays, which
 * `normalizeFrame` upgrades transparently on load either way.
 */
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BatteryMedium, Clock, Cpu, Eraser, Play, Pause, Plus, Redo2, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PatternPicker } from "../../components/ui/PatternPicker";
import { PixelGrid } from "../../components/ui/PixelGrid";
import { SavedArrangements } from "../../components/ui/SavedArrangements";
import { Schedule } from "../../components/ui/Schedule";
import { SliderControl } from "../../components/ui/SliderControl";
import { StampPalette } from "../../components/ui/StampPalette";
import { ToolModeToggle, type ToolMode } from "../../components/ui/ToolModeToggle";
import { useHistory, useUndoRedoShortcuts } from "../../lib/history";
import { applyBuiltinPattern, BUILTIN_PATTERNS, previewBuiltinPattern } from "../../lib/matrixPatterns";
import { blankFrame, normalizeFrame, resolveFramePixels, type EditorFrame } from "../../lib/matrixFrames";
import type { WidgetLiveData, ClockFormat, ClockStyle } from "../../lib/matrixWidgets";
import { useBrushPaint } from "../../lib/pixelBrush";
import { useStampPlace, type StampGlyph } from "../../lib/stampPlace";
import { generateMarqueeFrames } from "../../lib/marqueeAnimator";
import { loadSettings, patchSettings } from "../../lib/settings";
import { RESUME_EVENT } from "../../lib/systemEvents";
import { generatePattern, type PatternId } from "./CanvasTab";
import { SETTINGS_KEY, SAVED_ARRANGEMENTS_KEY, SCHEDULE_KEY } from "./AnimatorTab";
import type { MatrixStudioContext } from "./MatrixStudio";

const WIDTH = 9;
const HEIGHT = 34;
const DEFAULT_FRAME_INTERVAL_MS = 200;
const MIN_FRAME_INTERVAL_MS = 50;
const MAX_FRAME_INTERVAL_MS = 1000;
const MAX_PEN_SIZE = 5;
const MAX_MARQUEE_SPEED = 4;
// Coalesces rapid-fire slider drags into one device write instead of one
// per drag tick — Brightness has no debounce of its own otherwise, and
// each write opens a fresh, uncached serial connection (see
// matrix_control.rs's `port_for_panel` doc comment), so a burst of them
// collide/queue on the same port and updates lag or get silently dropped.
const BRIGHTNESS_DEBOUNCE_MS = 80;
const CLOCK_TICK_MS = 1000;
// Matches BatteryTab.tsx's/WidgetsTab.tsx's own 5000ms poll cadence —
// battery/CPU don't need per-second freshness, and EC/sysinfo reads
// aren't free.
const HARDWARE_POLL_TICKS = 5;

interface BatterySnapshot {
  charge_percentage: number;
}

const WIDGET_FRAME_BUTTONS: { type: "clock" | "battery" | "cpu"; label: string; icon: typeof Clock }[] = [
  { type: "clock", label: "Clock frame", icon: Clock },
  { type: "battery", label: "Battery frame", icon: BatteryMedium },
  { type: "cpu", label: "CPU Load frame", icon: Cpu },
];

const CUSTOM_PATTERNS: { id: PatternId; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "full", label: "Full" },
  { id: "checkerboard", label: "Checkerboard" },
  { id: "every2row", label: "Every 2nd Row" },
  { id: "every3row", label: "Every 3rd Row" },
  { id: "every2col", label: "Every 2nd Col" },
  { id: "every3col", label: "Every 3rd Col" },
];

export default function EditorTab(): ReactElement {
  const { panel, toolbarSlot } = useOutletContext<MatrixStudioContext>();
  const framesHistory = useHistory<EditorFrame[]>([blankFrame(WIDTH, HEIGHT)]);
  const frames = framesHistory.present;
  const [activeFrameIndex, setActiveFrame] = useState(0);
  const activeFrame = Math.min(activeFrameIndex, frames.length - 1);
  const [penSize, setPenSize] = useState(1);
  const [brightness, setBrightness] = useState(255);
  const [brightnessLoading, setBrightnessLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackInterval, setPlaybackInterval] = useState(DEFAULT_FRAME_INTERVAL_MS);
  const [status, setStatus] = useState("");
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [activeStamp, setActiveStamp] = useState<StampGlyph | null>(null);
  const [marqueeText, setMarqueeText] = useState("");
  const [marqueeSpeed, setMarqueeSpeed] = useState(1);
  const [selectedPatternLabel, setSelectedPatternLabel] = useState("Pattern...");
  const [now, setNow] = useState(new Date());
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [cpuPercent, setCpuPercent] = useState<number | null>(null);
  const [ecAvailable, setEcAvailable] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const brightnessTimeoutRef = useRef<number | null>(null);
  const loaded = useRef(false);
  const hasWidgetFrame = frames.some((f) => f.kind === "widget");
  const liveData: WidgetLiveData = { now, batteryPercent, cpuPercent };
  // Play's interval reads this instead of the `liveData` object above, so
  // a widget frame's per-second data refresh doesn't need to tear down
  // and rebuild the interval every tick the way including `liveData` in
  // its effect dependencies would — that churn is worth avoiding for the
  // same reason addFrame/deleteFrame/handleFrameDrop above now stop Play
  // before restructuring `frames`: tearing an interval down while a
  // previous tick's serial write is still in flight risks two writers on
  // the same unpooled COM port at once (see `port_for_panel`'s doc
  // comment), which already froze this app once.
  const liveDataRef = useRef(liveData);
  liveDataRef.current = liveData;
  // Replays whatever was last actually pushed to the device (a custom
  // frame upload or a built-in pattern selection) — see the RESUME_EVENT
  // effect below. The LED Matrix module is a separate USB device with no
  // memory of its own across a host suspend, so without this the panel
  // comes back blank/on its firmware boot pattern after the laptop
  // wakes from sleep instead of showing what the user had up before.
  const lastPushRef = useRef<(() => void) | null>(null);
  // Kept in a ref (not read directly in the effect below) so the
  // RESUME_EVENT listener always sees the current values without having
  // to resubscribe every time brightness/panel change.
  const panelRef = useRef(panel);
  const brightnessRef = useRef(brightness);
  const playingRef = useRef(playing);
  panelRef.current = panel;
  brightnessRef.current = brightness;
  playingRef.current = playing;

  // Re-syncs the device after the host resumes from sleep (see
  // power_watch.rs on the Rust side for how "resume" is detected). Skips
  // re-pushing a frame while Play is active — its own interval is
  // already streaming frames on a schedule and will land on the correct
  // frame within one `playbackInterval` tick regardless, so stepping in
  // here would just race it over the same unpooled serial connection
  // (see matrix_control.rs's `port_for_panel` doc comment). Brightness
  // isn't part of Play's loop, so that's always reapplied.
  useEffect(() => {
    const unlisten = listen(RESUME_EVENT, () => {
      invoke("set_matrix_brightness", { panel: panelRef.current, brightness: brightnessRef.current }).catch((err) =>
        console.error("Post-resume brightness reapply failed:", err)
      );
      if (!playingRef.current) {
        lastPushRef.current?.();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = settings[SETTINGS_KEY] as unknown[] | undefined;
      if (saved && saved.length > 0) {
        framesHistory.reset(saved.map(normalizeFrame));
      }
      loaded.current = true;
    });
    invoke<string>("check_ec_status")
      .then((s) => setEcAvailable(s === "Available"))
      .catch((err) => {
        console.error("check_ec_status failed, treating EC as unavailable:", err);
        setEcAvailable(false);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    patchSettings({ [SETTINGS_KEY]: frames }).catch((err) => console.error("Failed to save frames:", err));
  }, [frames]);

  // Ticks the clock and refreshes battery/CPU every HARDWARE_POLL_TICKS-th
  // tick — only while at least one widget frame actually exists, so a
  // purely hand-drawn animation never polls EC/sysinfo for data nothing
  // will use. Mirrors WidgetsTab.tsx's own polling pattern.
  useEffect(() => {
    if (!hasWidgetFrame) return;
    let tickCount = 0;
    const fetchHardware = (): void => {
      invoke<BatterySnapshot>("get_battery_snapshot")
        .then((s) => setBatteryPercent(s.charge_percentage))
        .catch((err) => console.error("Editor: battery poll failed:", err));
      invoke<{ cpu_usage_percent: number }>("get_hardware_summary")
        .then((s) => setCpuPercent(s.cpu_usage_percent))
        .catch((err) => console.error("Editor: CPU poll failed:", err));
    };
    fetchHardware();
    const interval = window.setInterval(() => {
      setNow(new Date());
      tickCount += 1;
      if (tickCount % HARDWARE_POLL_TICKS === 0) fetchHardware();
    }, CLOCK_TICK_MS);
    return () => window.clearInterval(interval);
  }, [hasWidgetFrame]);

  useEffect(() => {
    return () => {
      if (brightnessTimeoutRef.current) window.clearTimeout(brightnessTimeoutRef.current);
    };
  }, []);

  // Initializes the Brightness slider from the device's actual current
  // value rather than a hardcoded guess — re-queried on every panel
  // switch, since Panel 1/Panel 2 have independent brightness. Disabled
  // for the duration of the query (rather than left showing the outgoing
  // panel's value, which used to look like it hadn't switched at all —
  // same reasoning as Sleep/Wake clearing to null in MatrixStudio.tsx)
  // and silently left at its previous value if nothing's connected.
  useEffect(() => {
    setBrightnessLoading(true);
    invoke<number>("get_matrix_brightness", { panel })
      .then((value) => {
        setBrightness(value);
        setBrightnessLoading(false);
      })
      .catch((err) => {
        console.error("Brightness query failed:", err);
        setBrightnessLoading(false);
      });
  }, [panel]);

  useEffect(() => {
    if (playing && frames.length > 1) {
      intervalRef.current = window.setInterval(() => {
        setActiveFrame((prev) => {
          const next = (prev + 1) % frames.length;
          const pixels = resolveFramePixels(frames[next], WIDTH, HEIGHT, liveDataRef.current);
          invoke("update_matrix", { imgData: pixels, panel }).catch((err) => {
            console.error("Playback upload failed:", err);
          });
          return next;
        });
      }, playbackInterval);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [playing, frames, panel, playbackInterval]);

  const activeFrameData = frames[activeFrame];
  const isWidgetFrame = activeFrameData.kind === "widget";
  const activePixels = resolveFramePixels(activeFrameData, WIDTH, HEIGHT, liveData);

  const isGestureStartRef = useRef(true);
  // No-ops on a widget frame rather than painting into it — there's no
  // pixel buffer to hand-edit there, it's rendered fresh every time (see
  // this file's module doc comment) — the PixelGrid below is already
  // non-interactive (`interactive={!isWidgetFrame}`) whenever this would
  // otherwise fire, so this is a defensive backstop, not the primary
  // guard.
  const paintActiveFrame = (updater: (prev: number[]) => number[]): void => {
    if (isWidgetFrame) return;
    const framesUpdater = (prevFrames: EditorFrame[]): EditorFrame[] => {
      const current = prevFrames[activeFrame];
      if (current.kind !== "static") return prevFrames;
      const next = [...prevFrames];
      next[activeFrame] = { kind: "static", pixels: updater(current.pixels) };
      return next;
    };
    if (isGestureStartRef.current) {
      framesHistory.commit(framesUpdater);
      isGestureStartRef.current = false;
    } else {
      framesHistory.applySilent(framesUpdater);
    }
  };

  const brush = useBrushPaint(activePixels, paintActiveFrame, WIDTH, HEIGHT, penSize);
  const stamp = useStampPlace(paintActiveFrame, WIDTH, HEIGHT, activeStamp);
  const active = toolMode === "stamp" ? stamp : brush;

  const stopInteraction = (): void => {
    brush.stopDrawing();
    stamp.onPixelLeaveGrid();
    isGestureStartRef.current = true;
  };

  useUndoRedoShortcuts(framesHistory.undo, framesHistory.redo);

  const setActiveFrameData = (data: number[]): void => {
    framesHistory.commit((prev) => {
      const next = [...prev];
      next[activeFrame] = { kind: "static", pixels: data };
      return next;
    });
  };

  // Picking a pattern — custom or built-in — updates the device
  // immediately rather than requiring a separate manual Upload click;
  // committing to `framesHistory` still records it as one undo step.
  // Stops Play first: Play's own interval is already streaming frames
  // to the device on its own schedule, so a concurrent pattern upload
  // would race it over the same unpooled serial connection (see
  // `port_for_panel`'s doc comment) — same reasoning as why "Upload to
  // Matrix" is disabled while Play is active.
  const handleSelectCustomPattern = (id: string): void => {
    const def = CUSTOM_PATTERNS.find((p) => p.id === id);
    const data = generatePattern(id as PatternId);
    setPlaying(false);
    setActiveFrameData(data);
    setSelectedPatternLabel(def?.label ?? "Pattern...");
    uploadFrameToDevice(data);
  };

  // Built-in patterns are a direct device command (see matrixPatterns.ts)
  // — the firmware renders these itself and never reports pixels back,
  // so `previewBuiltinPattern` only ever approximates what's now
  // actually on the panel, purely so the grid doesn't look stale.
  const handleSelectBuiltinPattern = (id: number, animate: boolean): void => {
    const def = BUILTIN_PATTERNS.find((p) => p.id === id);
    setSelectedPatternLabel(`${def?.label ?? "Pattern"} (${animate ? "Animated" : "Static"})`);
    setPlaying(false);
    setActiveFrameData(previewBuiltinPattern(id));
    setStatus("Sending pattern...");
    lastPushRef.current = () => {
      applyBuiltinPattern(panel, id, animate).catch((err) =>
        console.error("Post-resume pattern re-apply failed:", err)
      );
    };
    applyBuiltinPattern(panel, id, animate)
      .then(() => {
        setStatus("Pattern sent");
        setTimeout(() => setStatus(""), 2000);
      })
      .catch((error) => {
        console.error(error);
        setStatus(`Error: ${error}`);
      });
  };

  // Inserts right after the currently-selected frame rather than always
  // appending at the end, so "Add Frame" while reviewing frame 2 of 5
  // doesn't drop the new blank frame at the very end where it has to be
  // dragged all the way back.
  //
  // Stops Play first, same as uploadCurrentFrame/handleSelectCustomPattern/
  // handleSelectBuiltinPattern above: any of these three actions changes
  // `frames`' *shape* (not just the active frame's contents), which tears
  // down and rebuilds Play's own interval (it depends on `frames`) — doing
  // that while a previous tick's `update_matrix` call is still opening the
  // unpooled serial connection (see `port_for_panel`'s doc comment) risks
  // two writers on the same COM port at once. Confirmed this isn't just
  // theoretical: reordering frames via drag while Play was running froze
  // the whole app (Windows reported it as "Not Responding") until whatever
  // was contending on the port eventually gave up.
  const addFrame = (): void => {
    setPlaying(false);
    const insertAt = activeFrame + 1;
    framesHistory.commit((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, blankFrame(WIDTH, HEIGHT));
      return next;
    });
    setActiveFrame(insertAt);
  };

  // Same insert-after-selected placement and Play-stopping as addFrame
  // above — a widget frame restructures `frames` exactly the same way a
  // blank one does.
  const addWidgetFrame = (widgetType: "clock" | "battery" | "cpu"): void => {
    setPlaying(false);
    const insertAt = activeFrame + 1;
    framesHistory.commit((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, { kind: "widget", widgetType, clockFormat: "24h", clockStyle: "digital" });
      return next;
    });
    setActiveFrame(insertAt);
  };

  // Adjusts the active frame's Clock face (24h/12h, digital/analog) —
  // only meaningful when it's a clock-type widget frame, mirroring
  // WidgetsTab.tsx's own per-widget Format/Style panel.
  const updateActiveClockConfig = (patch: Partial<{ clockFormat: ClockFormat; clockStyle: ClockStyle }>): void => {
    framesHistory.commit((prev) => {
      const current = prev[activeFrame];
      if (current.kind !== "widget" || current.widgetType !== "clock") return prev;
      const next = [...prev];
      next[activeFrame] = { ...current, ...patch };
      return next;
    });
  };

  const deleteFrame = (index: number): void => {
    if (frames.length === 1) return;
    setPlaying(false);
    framesHistory.commit((prev) => prev.filter((_, i) => i !== index));
    setActiveFrame((prev) => Math.max(0, prev >= index ? prev - 1 : prev));
  };

  // Drag-to-reorder for the frame strip. `dragFrameIndexRef` (not state)
  // holds the dragged index across the drag gesture — it doesn't need to
  // trigger a re-render, and using a ref means a drag that ends outside
  // any drop target (e.g. dropped off the strip) just leaves it stale
  // until overwritten by the next drag, harmlessly.
  const dragFrameIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleFrameDrop = (dropIndex: number): void => {
    const dragIndex = dragFrameIndexRef.current;
    dragFrameIndexRef.current = null;
    setDragOverIndex(null);
    if (dragIndex === null || dragIndex === dropIndex) return;

    setPlaying(false);
    framesHistory.commit((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    // Keeps the same logical frame "active" across the reorder, whether
    // that's the frame that just moved or one that shifted because of it
    // — mirrors deleteFrame's index bookkeeping above.
    setActiveFrame((prev) => {
      if (prev === dragIndex) return dropIndex;
      if (dragIndex < prev && dropIndex >= prev) return prev - 1;
      if (dragIndex > prev && dropIndex <= prev) return prev + 1;
      return prev;
    });
  };

  // No-ops on a widget frame — "clear" has no meaning for something
  // that's re-rendered from live data every time, not a pixel buffer you
  // hand-edit. Only reachable via the Stamp palette's Clear button
  // anyway, which is itself hidden while a widget frame is active (see
  // the JSX below), so this is a defensive backstop, same reasoning as
  // paintActiveFrame's own guard above.
  const clearActiveFrame = (): void => {
    if (isWidgetFrame) return;
    framesHistory.commit((prev) => {
      const next = [...prev];
      next[activeFrame] = blankFrame(WIDTH, HEIGHT);
      return next;
    });
  };

  // Distinct from clearActiveFrame: resets the whole sequence back to a
  // single blank frame, not just the one you're looking at.
  const clearAllFrames = (): void => {
    framesHistory.commit(() => [blankFrame(WIDTH, HEIGHT)]);
    setActiveFrame(0);
  };

  const uploadFrameToDevice = async (data: number[]): Promise<void> => {
    lastPushRef.current = () => {
      invoke("update_matrix", { imgData: data, panel }).catch((err) =>
        console.error("Post-resume frame re-upload failed:", err)
      );
    };
    setStatus("Uploading...");
    try {
      await invoke("update_matrix", { imgData: data, panel });
      setStatus("Success");
      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error}`);
    }
  };
  // Stops Play first rather than being disabled while playing — Play's
  // interval is already streaming frames to the device on its own
  // schedule, so an upload needs that stopped first to avoid two writers
  // opening the unpooled serial connection (see `port_for_panel`'s doc
  // comment) at once, but there's no reason to make the button dead
  // instead of just doing that itself.
  const uploadCurrentFrame = (): Promise<void> => {
    setPlaying(false);
    return uploadFrameToDevice(resolveFramePixels(frames[activeFrame], WIDTH, HEIGHT, liveData));
  };

  // Updates the slider instantly on every drag tick, but debounces the
  // actual device write — the range input fires onChange continuously
  // while dragging, and each write opens a fresh serial connection (see
  // BRIGHTNESS_DEBOUNCE_MS above), so writing on every tick either
  // floods the port or lags noticeably behind the slider.
  const handleBrightnessChange = (value: number): void => {
    setBrightness(value);
    if (brightnessTimeoutRef.current) window.clearTimeout(brightnessTimeoutRef.current);
    brightnessTimeoutRef.current = window.setTimeout(() => {
      invoke("set_matrix_brightness", { panel, brightness: value }).catch((error) => {
        console.error("Brightness update failed:", error);
      });
    }, BRIGHTNESS_DEBOUNCE_MS);
  };

  const handleGenerateMarquee = (): void => {
    if (!marqueeText.trim()) return;
    // generateMarqueeFrames only ever produces plain hand-drawn-style
    // pixel frames — wrap each as a static EditorFrame.
    const generated = generateMarqueeFrames(marqueeText, { panelWidth: WIDTH, panelHeight: HEIGHT, stepRows: marqueeSpeed });
    framesHistory.commit(() => generated.map((pixels): EditorFrame => ({ kind: "static", pixels })));
    setActiveFrame(0);
    setPlaying(generated.length > 1);
  };

  // data may still be in the pre-widget-frame plain-array shape — any
  // arrangement/schedule entry saved before that feature existed (this
  // app shipped for a while without it) was stored that way, and
  // SavedArrangements/Schedule are generic components that just persist
  // whatever they're handed, with no idea a "frame" needs a `kind` field
  // now. normalizeFrame upgrades it transparently either way. Missing
  // this was a real bug, not a hypothetical one: a "fire on startup"
  // schedule entry saved before today replaced `frames` with unnormalized
  // data on every launch, and the very next render crashed trying to
  // resolve an undefined `.kind` — exactly the "entire window goes gray"
  // reports from testing this feature, not a hardware/serial-port race.
  const handleScheduleFire = (data: EditorFrame[]): void => {
    framesHistory.commit(() => data.map(normalizeFrame));
    setActiveFrame(0);
    setPlaying(data.length > 1);
  };

  return (
    <div className="h-full flex flex-col gap-4" onPointerUp={stopInteraction} onPointerLeave={stopInteraction}>
      {toolbarSlot &&
        createPortal(
          <>
            <PatternPicker
              customPatterns={CUSTOM_PATTERNS}
              selectedLabel={selectedPatternLabel}
              onSelectCustom={handleSelectCustomPattern}
              onSelectBuiltin={handleSelectBuiltinPattern}
            />
            <ToolModeToggle mode={toolMode} onChange={setToolMode} />
            <div className="flex gap-1">
              <button
                onClick={framesHistory.undo}
                disabled={!framesHistory.canUndo}
                title="Undo (Ctrl+Z)"
                className="p-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Undo2 size={16} />
              </button>
              <button
                onClick={framesHistory.redo}
                disabled={!framesHistory.canRedo}
                title="Redo (Ctrl+Shift+Z)"
                className="p-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Redo2 size={16} />
              </button>
            </div>
            {toolMode === "brush" && (
              <div className="w-36">
                <SliderControl label="Pen Size" value={penSize} min={1} max={MAX_PEN_SIZE} unit="px" onChange={setPenSize} />
              </div>
            )}
            <div className="w-36">
              <SliderControl
                label="Brightness"
                value={brightness}
                min={0}
                max={255}
                disabled={brightnessLoading}
                onChange={handleBrightnessChange}
              />
            </div>
            <SavedArrangements
              settingsKey={SAVED_ARRANGEMENTS_KEY}
              currentData={frames}
              onLoad={(data) => {
                framesHistory.commit(() => data.map(normalizeFrame));
                setActiveFrame(0);
              }}
              previewPixels={(data) => resolveFramePixels(normalizeFrame(data[0] ?? blankFrame(WIDTH, HEIGHT)), WIDTH, HEIGHT, liveData)}
              previewWidth={WIDTH}
              previewHeight={HEIGHT}
            />
            <Schedule<EditorFrame[]>
              settingsKey={SCHEDULE_KEY}
              arrangementsKey={SAVED_ARRANGEMENTS_KEY}
              onFire={handleScheduleFire}
              previewPixels={(data) => resolveFramePixels(normalizeFrame(data[0] ?? blankFrame(WIDTH, HEIGHT)), WIDTH, HEIGHT, liveData)}
              previewWidth={WIDTH}
              previewHeight={HEIGHT}
            />
          </>,
          toolbarSlot
        )}

      <div className="flex-1 flex gap-4 min-h-0">
        <Card className="w-96 shrink-0 overflow-auto p-6 min-h-0 flex flex-col items-center justify-center">
          <div className="bg-black/80 backdrop-blur rounded-xl border border-gray-800 p-6 shadow-2xl w-fit relative">
            {isWidgetFrame && (
              <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/70 backdrop-blur rounded text-xs text-primary font-medium">
                {activeFrameData.kind === "widget" && activeFrameData.widgetType === "clock" && <Clock size={12} />}
                {activeFrameData.kind === "widget" && activeFrameData.widgetType === "battery" && <BatteryMedium size={12} />}
                {activeFrameData.kind === "widget" && activeFrameData.widgetType === "cpu" && <Cpu size={12} />}
                Live widget frame — not editable
              </div>
            )}
            <PixelGrid
              width={WIDTH}
              height={HEIGHT}
              pixels={activePixels}
              cellSize={16}
              gap={4}
              interactive={!isWidgetFrame}
              onPixelDown={active.onPixelDown}
              onPixelEnter={active.onPixelEnter}
              ghostIndices={toolMode === "stamp" ? stamp.ghostIndices : undefined}
            />
          </div>
          {activeFrameData.kind === "widget" && activeFrameData.widgetType === "clock" && (
            <div className="w-full mt-4 p-3 bg-black/20 border border-white/10 rounded-lg flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16">Format</span>
                {(["24h", "12h"] as const).map((format) => (
                  <button
                    key={format}
                    onClick={() => updateActiveClockConfig({ clockFormat: format })}
                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                      (activeFrameData.clockFormat ?? "24h") === format
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    {format}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16">Style</span>
                {(["digital", "analog"] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => updateActiveClockConfig({ clockStyle: style })}
                    className={`px-2 py-1 rounded text-xs font-medium border capitalize transition-colors ${
                      (activeFrameData.clockStyle ?? "digital") === style
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
        {/* Marquee generator first, Stamp palette below it when active —
            same column width throughout regardless of which is showing. */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <Card className="p-3 shrink-0">
            <h3 className="text-sm font-bold text-white mb-2">Generate Marquee Text</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={marqueeText}
                onChange={(e) => setMarqueeText(e.target.value)}
                placeholder="Type a message..."
                title="Replaces the current frame sequence — text that fits the panel becomes one still frame, longer text scrolls."
                style={{ colorScheme: "dark" }}
                className="flex-1 min-w-[160px] px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-200"
              />
              <div className="w-40">
                <SliderControl
                  label="Scroll Speed"
                  value={marqueeSpeed}
                  min={1}
                  max={MAX_MARQUEE_SPEED}
                  unit=" rows/frame"
                  onChange={setMarqueeSpeed}
                />
              </div>
              <button
                onClick={handleGenerateMarquee}
                disabled={!marqueeText.trim()}
                title="Generates frames from the typed text, replacing the current sequence"
                className="flex items-center gap-2 px-3 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 size={16} /> Generate
              </button>
            </div>
          </Card>
          {toolMode === "stamp" && (
            <Card className="flex-1 overflow-y-auto p-4 min-h-0">
              <StampPalette
                panelWidth={WIDTH}
                activeStamp={activeStamp}
                onChangeStamp={setActiveStamp}
                onClear={clearActiveFrame}
                clearLabel="Clear current frame"
              />
            </Card>
          )}
        </div>
      </div>

      {status && status !== "Uploading..." && status !== "Success" && status !== "Sending pattern..." && status !== "Pattern sent" && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">{status}</div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h3 className="text-sm font-bold text-white">
            Frame {activeFrame + 1} / {frames.length}
          </h3>
          <div className="flex items-center gap-3">
            <div className="w-40">
              <SliderControl
                label="Playback Speed"
                value={playbackInterval}
                min={MIN_FRAME_INTERVAL_MS}
                max={MAX_FRAME_INTERVAL_MS}
                step={50}
                unit=" ms/frame"
                onChange={setPlaybackInterval}
              />
            </div>
            <button
              onClick={() => setPlaying((p) => !p)}
              title={playing ? "Pause (stops live playback on the device)" : "Play (streams frames to the device live)"}
              className="p-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white"
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              onClick={addFrame}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20"
            >
              <Plus size={16} /> Add Frame
            </button>
            <div
              className="flex gap-1 p-1 border border-white/10 rounded-lg"
              title="Insert a live widget frame after the selected one — it re-renders from current system data every time it's shown, instead of a fixed picture"
            >
              {WIDGET_FRAME_BUTTONS.map(({ type, label, icon: Icon }) => {
                const disabled = type === "battery" && !ecAvailable;
                return (
                  <button
                    key={type}
                    onClick={() => addWidgetFrame(type)}
                    disabled={disabled}
                    title={disabled ? "Needs the Framework EC driver — unavailable on this machine (see System Health)" : label}
                    className="p-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
            <button
              onClick={clearAllFrames}
              title="Clear all frames — resets to a single blank frame"
              className="p-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white"
            >
              <Eraser size={16} />
            </button>
            <button
              onClick={uploadCurrentFrame}
              disabled={status === "Uploading..."}
              title="Upload the current frame to the matrix"
              className="flex items-center gap-2 px-3 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={16} /> {status === "Uploading..." ? "Sending..." : "Upload to Matrix"}
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {frames.map((frame, i) => (
            <div
              key={i}
              draggable
              onDragStart={(e) => {
                dragFrameIndexRef.current = i;
                // Chromium (WebView2) treats a drag with no transferred
                // data as invalid regardless of what onDragOver does —
                // every drop target shows the "not allowed" cursor
                // without this, even though preventDefault() below is
                // otherwise all a same-page reorder needs.
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverIndex !== i) setDragOverIndex(i);
              }}
              onDragLeave={() => {
                setDragOverIndex((prev) => (prev === i ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleFrameDrop(i);
              }}
              onDragEnd={() => {
                dragFrameIndexRef.current = null;
                setDragOverIndex(null);
              }}
              onClick={() => {
                setPlaying(false);
                setActiveFrame(i);
              }}
              title="Drag to reorder"
              className={`relative shrink-0 p-1 rounded border cursor-grab active:cursor-grabbing group ${
                activeFrame === i ? "border-primary bg-primary/10" : "border-white/10 bg-black/20 hover:border-white/30"
              } ${dragOverIndex === i ? "ring-2 ring-primary" : ""}`}
            >
              <PixelGrid
                width={WIDTH}
                height={HEIGHT}
                pixels={resolveFramePixels(frame, WIDTH, HEIGHT, liveData)}
                cellSize={1}
                gap={0.5}
                interactive={false}
              />
              {frame.kind === "widget" && (
                <div className="absolute top-0.5 left-0.5 bg-black/70 rounded-sm p-0.5 text-primary">
                  {frame.widgetType === "clock" && <Clock size={8} />}
                  {frame.widgetType === "battery" && <BatteryMedium size={8} />}
                  {frame.widgetType === "cpu" && <Cpu size={8} />}
                </div>
              )}
              {frames.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFrame(i);
                  }}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
