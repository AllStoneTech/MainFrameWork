// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Frame-by-frame animation editor tab (Matrix Studio). See the exported
 * component's doc comment below for how Play/Upload relate to the real
 * device protocol and what's deliberately not implemented yet.
 */
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Eraser, Play, Pause, Plus, Redo2, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PixelGrid } from "../../components/ui/PixelGrid";
import { SavedArrangements } from "../../components/ui/SavedArrangements";
import { Schedule } from "../../components/ui/Schedule";
import { SliderControl } from "../../components/ui/SliderControl";
import { StampPalette } from "../../components/ui/StampPalette";
import { ToolModeToggle, type ToolMode } from "../../components/ui/ToolModeToggle";
import { useHistory, useUndoRedoShortcuts } from "../../lib/history";
import { useBrushPaint } from "../../lib/pixelBrush";
import { useStampPlace, type StampGlyph } from "../../lib/stampPlace";
import { generateMarqueeFrames } from "../../lib/marqueeAnimator";
import { loadSettings, patchSettings } from "../../lib/settings";
import { normalizeFrame, resolveFramePixels } from "../../lib/matrixFrames";
import type { MatrixStudioContext } from "./MatrixStudio";

const WIDTH = 9;
const HEIGHT = 34;
const DEFAULT_FRAME_INTERVAL_MS = 200;
const MIN_FRAME_INTERVAL_MS = 50;
const MAX_FRAME_INTERVAL_MS = 1000;
const MAX_PEN_SIZE = 5;
const MAX_MARQUEE_SPEED = 4;
// Exported so EditorTab.tsx (the combined Canvas+Animator editor) can
// read/write the exact same persisted data — a single canvas is just a
// 1-frame animation, so the two tabs are meant to be two views over one
// live dataset, not separate copies.
export const SETTINGS_KEY = "matrix_animator_frames";
export const SAVED_ARRANGEMENTS_KEY = "matrix_animator_saved_arrangements";
export const SCHEDULE_KEY = "matrix_animator_schedule";
const BLANK_FRAME = (): number[] => new Array(WIDTH * HEIGHT).fill(0);

/**
 * Frame-by-frame animation editor for the LED Matrix. Frames persist to
 * the same encrypted settings blob LightingTab uses. Both "Upload to
 * Matrix" and Play push frames to the real device via the same
 * `update_matrix` command CanvasTab uses — Play just calls it on every
 * frame tick instead of once. This streams frames live from the host
 * rather than storing the sequence on-device via the module's ANIMATE_CMD
 * (see ANIMATE_CMD in FrameworkComputer/dotmatrixtool @ 4154b14, app.js:
 * https://github.com/FrameworkComputer/dotmatrixtool/blob/4154b149ba962305af2b72a51ba419e244796f18/app.js)
 * — that would let the panel animate without MainFrameWork running, but
 * needs its own protocol verification pass against real hardware before
 * relying on it.
 *
 * Drawing on the active frame uses the same click-to-toggle,
 * drag-to-paint `useBrushPaint` model as CanvasTab — no separate
 * Pen/Eraser tool, same shared Pen Size control. A Brush/Stamp tool mode
 * (see ToolModeToggle) additionally lets a single frame be built by
 * placing whole symbols via `useStampPlace`, shared with CanvasTab.
 *
 * The "Generate Marquee Text" panel is a separate, higher-level way to fill
 * `frames` entirely: generateMarqueeFrames (marqueeAnimator.ts) turns a
 * typed string directly into a frame sequence — a static centered frame
 * if it already fits the panel, otherwise a scrolling sequence — and
 * replaces the whole `frames` array in one action rather than requiring
 * every frame to be hand-drawn.
 *
 * `frames` is undo/redo-able via `useHistory` (history.ts): a brush
 * stroke or stamp placement on the active frame, Add/Delete Frame,
 * Clear, and marquee Generate are each one undo step. `activeFrame`
 * (which frame you're *viewing*) deliberately isn't part of that
 * history — undo restores frame content/count, not your scroll
 * position.
 *
 * Tool mode, undo/redo, Pen Size, and Saved render into `toolbarSlot`
 * (see MatrixStudioContext) via a portal, so they sit on the same row
 * as the Canvas/Widgets/Animator tab pills rather than a row of their
 * own here.
 */
export default function AnimatorTab(): ReactElement {
  const { panel, toolbarSlot } = useOutletContext<MatrixStudioContext>();
  const framesHistory = useHistory<number[][]>([BLANK_FRAME()]);
  const frames = framesHistory.present;
  // activeFrame isn't part of the undo history (see the doc comment
  // above), so undo/redo, loading a saved arrangement, or a marquee
  // Generate can all shrink frames.length out from under it. Deriving
  // the clamped value at render time (rather than correcting it in an
  // effect afterward) matters: an out-of-bounds index would make
  // frames[activeFrame] undefined *during* that same render, crashing
  // PixelGrid before any effect gets a chance to run.
  const [activeFrameIndex, setActiveFrame] = useState(0);
  const activeFrame = Math.min(activeFrameIndex, frames.length - 1);
  const [penSize, setPenSize] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [playbackInterval, setPlaybackInterval] = useState(DEFAULT_FRAME_INTERVAL_MS);
  const [status, setStatus] = useState("");
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [activeStamp, setActiveStamp] = useState<StampGlyph | null>(null);
  const [marqueeText, setMarqueeText] = useState("");
  const [marqueeSpeed, setMarqueeSpeed] = useState(1);
  const intervalRef = useRef<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = settings[SETTINGS_KEY] as unknown[] | undefined;
      if (saved && saved.length > 0) {
        // This tab only ever works with plain pixel arrays — it doesn't
        // have EditorTab.tsx's live "widget frame" feature (Clock/
        // Battery/CPU Load), being the hidden, non-primary route (see
        // EditorTab.tsx's module doc comment). A widget frame saved from
        // EditorTab resolves here to a one-time static snapshot rather
        // than live-updating, so loading it can't crash; saving again
        // from this tab then "downgrades" it to that fixed snapshot
        // going forward — an accepted trade-off for a route that isn't
        // meant to be actively used.
        const staticFrames = saved.map((raw) =>
          resolveFramePixels(normalizeFrame(raw), WIDTH, HEIGHT, { now: new Date(), batteryPercent: null, cpuPercent: null })
        );
        // reset, not commit: hydrating from disk on mount shouldn't
        // create a spurious first undo step back to a blank frame.
        framesHistory.reset(staticFrames);
      }
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    patchSettings({ [SETTINGS_KEY]: frames }).catch((err) => console.error("Failed to save animator frames:", err));
  }, [frames]);

  // While playing, each tick both advances the preview and pushes the new
  // frame to the real device — so Play doubles as live on-device playback,
  // not just a local animation preview.
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

  // True at the start of a gesture (pointerDown) — the first paint call
  // commits a new undo step (on the whole `frames` array, not just this
  // frame's pixels, so undo restores frame count/content coherently);
  // every subsequent call in the same gesture applies silently so a
  // whole stroke/placement is one step. Reset on pointer release.
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

  // Mirrors CanvasTab's stopInteraction: whichever tool isn't active
  // still gets its interaction state cleared on every pointer release, so
  // switching tools mid-gesture can't leave stale drag/hover state.
  const stopInteraction = (): void => {
    brush.stopDrawing();
    stamp.onPixelLeaveGrid();
    isGestureStartRef.current = true;
  };

  useUndoRedoShortcuts(framesHistory.undo, framesHistory.redo);

  const addFrame = (): void => {
    framesHistory.commit((prev) => [...prev, BLANK_FRAME()]);
    setActiveFrame(frames.length);
  };

  const deleteFrame = (index: number): void => {
    if (frames.length === 1) return;
    framesHistory.commit((prev) => prev.filter((_, i) => i !== index));
    setActiveFrame((prev) => Math.max(0, prev >= index ? prev - 1 : prev));
  };

  // Per confirmed scope: Clear (in the Stamp palette) blanks only the
  // active frame — other frames and the frame count are untouched.
  const clearActiveFrame = (): void => {
    framesHistory.commit((prev) => {
      const next = [...prev];
      next[activeFrame] = BLANK_FRAME();
      return next;
    });
  };

  // Distinct from clearActiveFrame: this resets the whole sequence back
  // to a single blank frame, not just the one you're looking at.
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

  // Replaces the whole frame sequence with a generated marquee and starts
  // playback immediately, so typing a message and clicking Generate is
  // enough to see it animate without a separate Play step. Routed
  // through history.commit, so an unwanted generation is itself undoable.
  const handleGenerateMarquee = (): void => {
    if (!marqueeText.trim()) return;
    const generated = generateMarqueeFrames(marqueeText, { panelWidth: WIDTH, panelHeight: HEIGHT, stepRows: marqueeSpeed });
    framesHistory.commit(() => generated);
    setActiveFrame(0);
    setPlaying(generated.length > 1);
  };

  // A scheduled entry loads its snapshotted frames and starts playing
  // immediately — same "load and go" shape as handleGenerateMarquee,
  // since the point of scheduling is to actually show it, not just
  // stage it for a manual Play click.
  const handleScheduleFire = (data: number[][]): void => {
    framesHistory.commit(() => data);
    setActiveFrame(0);
    setPlaying(data.length > 1);
  };

  return (
    <div
      className="h-full flex flex-col gap-4"
      onPointerUp={stopInteraction}
      onPointerLeave={stopInteraction}
    >
      {toolbarSlot &&
        createPortal(
          <>
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

      {/* Grid, stamp palette (when active), and the marquee generator as
          separate sibling panels sharing one row, not one shared scroll
          window. The grid box is a small fixed pixel size, so its Card
          is kept narrow (w-96) rather than eating the whole row; the
          right column gets whatever's left (flex-1) and stacks the
          palette above the marquee generator, matching the palette's
          width instead of a full-width strip below — which also means
          this whole row (and so the grid) gets whatever vertical room
          that strip used to take. */}
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
        <div className="flex-1 flex flex-col gap-4 min-h-0">
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
          <Card className="p-4 shrink-0">
            <h3 className="text-sm font-bold text-white mb-3">Generate Marquee Text</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={marqueeText}
                onChange={(e) => setMarqueeText(e.target.value)}
                placeholder="Type a message..."
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
            <p className="text-xs text-gray-500 mt-2">
              Replaces the current frame sequence — text that fits the panel becomes one still frame, longer text scrolls.
            </p>
          </Card>
        </div>
      </div>

      {status && status !== "Uploading..." && status !== "Success" && (
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

        {/* Always shown, kept small — a full row of every frame reads
            better here than hiding frames behind a scrubber, as long as
            each thumbnail stays compact. */}
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
