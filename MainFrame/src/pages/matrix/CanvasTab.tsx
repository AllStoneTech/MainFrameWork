// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Live draw canvas tab (Matrix Studio). See the exported component's doc
 * comment below for the wire protocol this speaks to the real device.
 */
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Redo2, Undo2, Upload } from "lucide-react";
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
import { loadSettings, patchSettings } from "../../lib/settings";
import { useStampPlace, type StampGlyph } from "../../lib/stampPlace";
import type { MatrixStudioContext } from "./MatrixStudio";

const SETTINGS_KEY = "matrix_canvas_pixels";
const SAVED_DESIGNS_KEY = "matrix_canvas_saved_designs";
const SCHEDULE_KEY = "matrix_canvas_schedule";

const WIDTH = 9;
const HEIGHT = 34;
const MAX_PEN_SIZE = 5;
// Coalesces rapid-fire slider drags into one device write instead of one
// per drag tick — see EditorTab.tsx's identical constant for why.
const BRIGHTNESS_DEBOUNCE_MS = 80;

export type PatternId = "blank" | "full" | "checkerboard" | "every2row" | "every3row" | "every2col" | "every3col";

// Presets mirrored from the PATTERNS list in FrameworkComputer/dotmatrixtool
// @ 4154b14 (app.js), applied to our flat WIDTH*HEIGHT brightness buffer.
// https://github.com/FrameworkComputer/dotmatrixtool/blob/4154b149ba962305af2b72a51ba419e244796f18/app.js
const PATTERNS: { id: PatternId; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "full", label: "Full" },
  { id: "checkerboard", label: "Checkerboard" },
  { id: "every2row", label: "Every 2nd Row" },
  { id: "every3row", label: "Every 3rd Row" },
  { id: "every2col", label: "Every 2nd Col" },
  { id: "every3col", label: "Every 3rd Col" },
];

export function generatePattern(id: PatternId): number[] {
  const out = new Array(WIDTH * HEIGHT).fill(0);
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const i = row * WIDTH + col;
      let on = false;
      switch (id) {
        case "full": on = true; break;
        case "checkerboard": on = (row + col) % 2 === 0; break;
        case "every2row": on = row % 2 === 0; break;
        case "every3row": on = row % 3 === 0; break;
        case "every2col": on = col % 2 === 0; break;
        case "every3col": on = col % 3 === 0; break;
        default: on = false;
      }
      out[i] = on ? 255 : 0;
    }
  }
  return out;
}

/**
 * Live draw canvas for the LED Matrix module. Uploads the flat pixel
 * buffer via `update_matrix`, which frames commands as
 * `[0x32,0xAC,cmd,...params]` and bit-packs the buffer into the 39-byte
 * DRAW_CMD payload matrix_control.rs expects. Confirmed working against
 * a real module — see the doc comment at the top of matrix_control.rs.
 *
 * No separate Pen/Eraser tool — see `useBrushPaint`'s doc comment for the
 * click-to-toggle, drag-to-paint model this shares with AnimatorTab, and
 * the Pen Size slider for brush width. A separate Brush/Stamp tool mode
 * (see ToolModeToggle) switches painting to placing whole symbols instead
 * — see `useStampPlace` in stampPlace.ts, which this shares with
 * AnimatorTab the same way it shares useBrushPaint.
 *
 * `pixels` is undo/redo-able via `useHistory` (history.ts) — a whole
 * brush stroke or a single stamp placement is one undo step, not one per
 * pixel; see `isGestureStartRef` below for how the two hooks' painting
 * gets collapsed into that.
 *
 * Tool mode, undo/redo, Pen Size, Brightness, Saved, and Schedule render
 * into `toolbarSlot` (see MatrixStudioContext) via a portal, so they sit
 * on the same row as the Canvas/Widgets/Animator tab pills instead of
 * taking up a row of their own here — only the Pattern select and
 * Upload stay in this component's own toolbar.
 *
 * `pixels` persists to the same encrypted settings blob AnimatorTab's
 * `frames` does, under its own key — previously Canvas didn't persist
 * at all, unlike Animator.
 *
 * `PatternPicker` mixes two unrelated things, kept straight by which of
 * its two callbacks fires: this app's own client-drawn patterns (edits
 * `pixels` locally, needs Upload same as any other drawing) and the LED
 * Matrix firmware's built-in patterns (matrixPatterns.ts — a direct
 * device command; the firmware renders these itself and never reports
 * pixels back, so `pixels` is updated from `previewBuiltinPattern`'s
 * local approximation instead, purely so the grid doesn't look stale).
 *
 * Brightness initializes from the device's actual current value (see
 * `get_matrix_brightness`), re-queried on every panel switch, rather
 * than assuming a hardcoded default.
 */
export default function CanvasTab(): ReactElement {
  const { panel, toolbarSlot } = useOutletContext<MatrixStudioContext>();
  const pixelsHistory = useHistory<number[]>(new Array(WIDTH * HEIGHT).fill(0));
  const pixels = pixelsHistory.present;
  const [penSize, setPenSize] = useState(1);
  const [brightness, setBrightness] = useState(255);
  const [brightnessLoading, setBrightnessLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [activeStamp, setActiveStamp] = useState<StampGlyph | null>(null);
  const [selectedPatternLabel, setSelectedPatternLabel] = useState("Pattern...");
  const brightnessTimeoutRef = useRef<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = settings[SETTINGS_KEY] as number[] | undefined;
      if (saved && saved.length === WIDTH * HEIGHT) {
        pixelsHistory.reset(saved);
      }
      loaded.current = true;
    });
    // Runs once on mount — pixelsHistory's functions are stable (see history.ts).
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    patchSettings({ [SETTINGS_KEY]: pixels }).catch((err) => console.error("Failed to save canvas pixels:", err));
  }, [pixels]);

  // Initializes the Brightness slider from the device's actual current
  // value rather than a hardcoded guess — re-queried on every panel
  // switch, since Panel 1/Panel 2 have independent brightness. Disabled
  // for the duration of the query rather than left showing the outgoing
  // panel's value — see EditorTab.tsx's identical effect for why.
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
    return () => {
      if (brightnessTimeoutRef.current) window.clearTimeout(brightnessTimeoutRef.current);
    };
  }, []);

  // True at the start of a gesture (pointerDown) — the first paint call
  // commits a new undo step; every subsequent call in the same gesture
  // (drag, or the ghost-preview-then-click of a stamp) applies silently
  // so the whole gesture is one step. Reset on pointer release.
  const isGestureStartRef = useRef(true);
  const paint = (updater: (prev: number[]) => number[]): void => {
    if (isGestureStartRef.current) {
      pixelsHistory.commit(updater);
      isGestureStartRef.current = false;
    } else {
      pixelsHistory.applySilent(updater);
    }
  };

  const brush = useBrushPaint(pixels, paint, WIDTH, HEIGHT, penSize);
  const stamp = useStampPlace(paint, WIDTH, HEIGHT, activeStamp);
  const active = toolMode === "stamp" ? stamp : brush;

  // Switching tools mid-gesture (e.g. a drag) shouldn't leave either
  // hook's interaction state stuck, so both stop/clear on every pointer
  // release regardless of which one is currently active.
  const stopInteraction = (): void => {
    brush.stopDrawing();
    stamp.onPixelLeaveGrid();
    isGestureStartRef.current = true;
  };

  useUndoRedoShortcuts(pixelsHistory.undo, pixelsHistory.redo);

  const clearCanvas = (): void => pixelsHistory.commit(() => new Array(WIDTH * HEIGHT).fill(0));

  const uploadPixelsToDevice = async (data: number[]): Promise<void> => {
    setStatus("Uploading...");
    try {
      await invoke("update_matrix", { imgData: Array.from(data), panel });
      setStatus("Success");
      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error}`);
    }
  };
  const uploadToDevice = (): Promise<void> => uploadPixelsToDevice(pixels);

  // A scheduled entry both loads its snapshot into the editor (so it's
  // visible/undoable like any other edit) and immediately uploads it —
  // the point of scheduling is to actually show it on the device, not
  // just stage it for a manual Upload click.
  const handleScheduleFire = (data: number[]): void => {
    pixelsHistory.commit(() => data);
    uploadPixelsToDevice(data);
  };

  // Picking a pattern — custom or built-in — updates the device
  // immediately rather than requiring a separate manual Upload click;
  // committing to `pixelsHistory` still records it as one undo step.
  const handleSelectCustomPattern = (id: string): void => {
    const def = PATTERNS.find((p) => p.id === id);
    const data = generatePattern(id as PatternId);
    pixelsHistory.commit(() => data);
    setSelectedPatternLabel(def?.label ?? "Pattern...");
    uploadPixelsToDevice(data);
  };

  // Built-in patterns are a direct device command (see matrixPatterns.ts)
  // — the firmware renders these itself and never reports pixels back,
  // so `previewBuiltinPattern` only ever approximates what's now
  // actually on the panel, purely so the grid doesn't look stale.
  const handleSelectBuiltinPattern = (id: number, animate: boolean): void => {
    const def = BUILTIN_PATTERNS.find((p) => p.id === id);
    setSelectedPatternLabel(`${def?.label ?? "Pattern"} (${animate ? "Animated" : "Static"})`);
    pixelsHistory.commit(() => previewBuiltinPattern(id));
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

  // Updates the slider instantly on every drag tick, but debounces the
  // actual device write — see EditorTab.tsx's identical handler for why.
  const handleBrightnessChange = (value: number): void => {
    setBrightness(value);
    if (brightnessTimeoutRef.current) window.clearTimeout(brightnessTimeoutRef.current);
    brightnessTimeoutRef.current = window.setTimeout(() => {
      invoke("set_matrix_brightness", { panel, brightness: value }).catch((error) => {
        console.error("Brightness update failed:", error);
      });
    }, BRIGHTNESS_DEBOUNCE_MS);
  };

  return (
    <div className="h-full flex flex-col" onPointerUp={stopInteraction} onPointerLeave={stopInteraction}>
      {toolbarSlot &&
        createPortal(
          <>
            <PatternPicker
              customPatterns={PATTERNS}
              selectedLabel={selectedPatternLabel}
              onSelectCustom={handleSelectCustomPattern}
              onSelectBuiltin={handleSelectBuiltinPattern}
            />
            <ToolModeToggle mode={toolMode} onChange={setToolMode} />
            <div className="flex gap-1">
              <button
                onClick={pixelsHistory.undo}
                disabled={!pixelsHistory.canUndo}
                title="Undo (Ctrl+Z)"
                className="p-2 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Undo2 size={16} />
              </button>
              <button
                onClick={pixelsHistory.redo}
                disabled={!pixelsHistory.canRedo}
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
              settingsKey={SAVED_DESIGNS_KEY}
              currentData={pixels}
              onLoad={(data) => pixelsHistory.commit(() => data)}
              previewPixels={(data) => data}
              previewWidth={WIDTH}
              previewHeight={HEIGHT}
            />
            <Schedule<number[]>
              settingsKey={SCHEDULE_KEY}
              arrangementsKey={SAVED_DESIGNS_KEY}
              onFire={handleScheduleFire}
              previewPixels={(data) => data}
              previewWidth={WIDTH}
              previewHeight={HEIGHT}
            />
          </>,
          toolbarSlot
        )}

      <div className="flex justify-end mb-4">
        <button
          onClick={uploadToDevice}
          disabled={status === "Uploading..."}
          className="px-4 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <Upload size={18} /> {status === "Uploading..." ? "Sending..." : "Upload to Matrix"}
        </button>
      </div>

      {status && status !== "Uploading..." && status !== "Success" && status !== "Sending pattern..." && status !== "Pattern sent" && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
          {status}
        </div>
      )}

      {/* Grid on the left, stamp palette (when active) to its right. The
          grid box is a small fixed pixel size, so its container is kept
          narrow (w-96) rather than eating the whole row — the palette
          gets whatever's left (flex-1), which lets more letters/icons
          fit per row before wrapping, meaning less scrolling in it. */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* overflow-auto + a plain block flow here (no items-center) —
            centering an overflowing flex child clips its start edge and
            only lets you scroll toward the end, which is why the top of
            the grid used to be unreachable. Horizontal centering is safe
            via mx-auto on the inner box since width rarely exceeds the
            container. */}
        <div className="w-96 shrink-0 overflow-auto bg-[#111] rounded-xl border border-white/5 py-8">
          <div className="bg-black/80 backdrop-blur rounded-xl border border-gray-800 p-8 shadow-2xl inline-block relative mx-auto w-fit">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-xl blur opacity-20" />
            <div className="relative z-10">
              <PixelGrid
                width={WIDTH}
                height={HEIGHT}
                pixels={pixels}
                cellSize={16}
                gap={4}
                onPixelDown={active.onPixelDown}
                onPixelEnter={active.onPixelEnter}
                ghostIndices={toolMode === "stamp" ? stamp.ghostIndices : undefined}
              />
            </div>
          </div>
        </div>

        {toolMode === "stamp" && (
          <div className="flex-1 overflow-y-auto bg-[#111] rounded-xl border border-white/5 p-3">
            <StampPalette
              panelWidth={WIDTH}
              activeStamp={activeStamp}
              onChangeStamp={setActiveStamp}
              onClear={clearCanvas}
              clearLabel="Clear canvas"
            />
          </div>
        )}
      </div>

      <div className="mt-4 text-center text-gray-400 text-xs">
        {WIDTH}x{HEIGHT} Single Color LED Matrix • Framework Laptop 16
      </div>
    </div>
  );
}
