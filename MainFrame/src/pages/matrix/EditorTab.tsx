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
 */
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Eraser, Play, Pause, Plus, Redo2, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
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
import { useBrushPaint } from "../../lib/pixelBrush";
import { useStampPlace, type StampGlyph } from "../../lib/stampPlace";
import { generateMarqueeFrames } from "../../lib/marqueeAnimator";
import { loadSettings, patchSettings } from "../../lib/settings";
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
const BLANK_FRAME = (): number[] => new Array(WIDTH * HEIGHT).fill(0);

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
  const framesHistory = useHistory<number[][]>([BLANK_FRAME()]);
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
  const intervalRef = useRef<number | null>(null);
  const brightnessTimeoutRef = useRef<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = settings[SETTINGS_KEY] as number[][] | undefined;
      if (saved && saved.length > 0) {
        framesHistory.reset(saved);
      }
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    patchSettings({ [SETTINGS_KEY]: frames }).catch((err) => console.error("Failed to save frames:", err));
  }, [frames]);

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
          invoke("update_matrix", { imgData: frames[next], panel }).catch((err) => {
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

  const isGestureStartRef = useRef(true);
  const paintActiveFrame = (updater: (prev: number[]) => number[]): void => {
    const framesUpdater = (prevFrames: number[][]): number[][] => {
      const next = [...prevFrames];
      next[activeFrame] = updater(next[activeFrame]);
      return next;
    };
    if (isGestureStartRef.current) {
      framesHistory.commit(framesUpdater);
      isGestureStartRef.current = false;
    } else {
      framesHistory.applySilent(framesUpdater);
    }
  };

  const brush = useBrushPaint(frames[activeFrame], paintActiveFrame, WIDTH, HEIGHT, penSize);
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
      next[activeFrame] = data;
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

  const addFrame = (): void => {
    framesHistory.commit((prev) => [...prev, BLANK_FRAME()]);
    setActiveFrame(frames.length);
  };

  const deleteFrame = (index: number): void => {
    if (frames.length === 1) return;
    framesHistory.commit((prev) => prev.filter((_, i) => i !== index));
    setActiveFrame((prev) => Math.max(0, prev >= index ? prev - 1 : prev));
  };

  const clearActiveFrame = (): void => {
    framesHistory.commit((prev) => {
      const next = [...prev];
      next[activeFrame] = BLANK_FRAME();
      return next;
    });
  };

  // Distinct from clearActiveFrame: resets the whole sequence back to a
  // single blank frame, not just the one you're looking at.
  const clearAllFrames = (): void => {
    framesHistory.commit(() => [BLANK_FRAME()]);
    setActiveFrame(0);
  };

  const uploadFrameToDevice = async (data: number[]): Promise<void> => {
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
    return uploadFrameToDevice(frames[activeFrame]);
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
    const generated = generateMarqueeFrames(marqueeText, { panelWidth: WIDTH, panelHeight: HEIGHT, stepRows: marqueeSpeed });
    framesHistory.commit(() => generated);
    setActiveFrame(0);
    setPlaying(generated.length > 1);
  };

  const handleScheduleFire = (data: number[][]): void => {
    framesHistory.commit(() => data);
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
                framesHistory.commit(() => data);
                setActiveFrame(0);
              }}
              previewPixels={(data) => data[0] ?? BLANK_FRAME()}
              previewWidth={WIDTH}
              previewHeight={HEIGHT}
            />
            <Schedule<number[][]>
              settingsKey={SCHEDULE_KEY}
              arrangementsKey={SAVED_ARRANGEMENTS_KEY}
              onFire={handleScheduleFire}
              previewPixels={(data) => data[0] ?? BLANK_FRAME()}
              previewWidth={WIDTH}
              previewHeight={HEIGHT}
            />
          </>,
          toolbarSlot
        )}

      <div className="flex-1 flex gap-4 min-h-0">
        <Card className="w-96 shrink-0 overflow-auto p-6 min-h-0 flex items-start justify-center">
          <div className="bg-black/80 backdrop-blur rounded-xl border border-gray-800 p-6 shadow-2xl w-fit">
            <PixelGrid
              width={WIDTH}
              height={HEIGHT}
              pixels={frames[activeFrame]}
              cellSize={16}
              gap={4}
              onPixelDown={active.onPixelDown}
              onPixelEnter={active.onPixelEnter}
              ghostIndices={toolMode === "stamp" ? stamp.ghostIndices : undefined}
            />
          </div>
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
              onClick={() => {
                setPlaying(false);
                setActiveFrame(i);
              }}
              className={`relative shrink-0 p-1 rounded border cursor-pointer group ${
                activeFrame === i ? "border-primary bg-primary/10" : "border-white/10 bg-black/20 hover:border-white/30"
              }`}
            >
              <PixelGrid width={WIDTH} height={HEIGHT} pixels={frame} cellSize={1} gap={0.5} interactive={false} />
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
