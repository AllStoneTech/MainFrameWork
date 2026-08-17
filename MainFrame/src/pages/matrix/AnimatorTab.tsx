// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Frame-by-frame animation editor tab (Matrix Studio). See the exported
 * component's doc comment below for how Play/Upload relate to the real
 * device protocol and what's deliberately not implemented yet.
 */
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Play, Pause, Plus, Trash2, Upload } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PixelGrid } from "../../components/ui/PixelGrid";
import { SliderControl } from "../../components/ui/SliderControl";
import { useBrushPaint } from "../../lib/pixelBrush";
import { loadSettings, patchSettings } from "../../lib/settings";
import type { MatrixStudioContext } from "./MatrixStudio";

const WIDTH = 9;
const HEIGHT = 34;
const FRAME_INTERVAL_MS = 200;
const MAX_PEN_SIZE = 5;
const SETTINGS_KEY = "matrix_animator_frames";
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
 * Pen/Eraser tool, same shared Pen Size control.
 */
export default function AnimatorTab(): ReactElement {
  const { panel } = useOutletContext<MatrixStudioContext>();
  const [frames, setFrames] = useState<number[][]>([BLANK_FRAME()]);
  const [activeFrame, setActiveFrame] = useState(0);
  const [penSize, setPenSize] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("");
  const intervalRef = useRef<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = settings[SETTINGS_KEY] as number[][] | undefined;
      if (saved && saved.length > 0) {
        setFrames(saved);
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
      }, FRAME_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [playing, frames, panel]);

  const setActiveFramePixels = (updater: (prev: number[]) => number[]): void => {
    setFrames((prev) => {
      const next = [...prev];
      next[activeFrame] = updater(next[activeFrame]);
      return next;
    });
  };

  const { onPixelDown, onPixelEnter, stopDrawing } = useBrushPaint(
    frames[activeFrame],
    setActiveFramePixels,
    WIDTH,
    HEIGHT,
    penSize
  );

  const addFrame = (): void => {
    setFrames((prev) => [...prev, BLANK_FRAME()]);
    setActiveFrame(frames.length);
  };

  const deleteFrame = (index: number): void => {
    if (frames.length === 1) return;
    setFrames((prev) => prev.filter((_, i) => i !== index));
    setActiveFrame((prev) => Math.max(0, prev >= index ? prev - 1 : prev));
  };

  const uploadCurrentFrame = async (): Promise<void> => {
    setStatus("Uploading...");
    try {
      await invoke("update_matrix", { imgData: frames[activeFrame], panel });
      setStatus("Success");
      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error}`);
    }
  };

  return (
    <div
      className="h-full flex flex-col gap-4"
      onPointerUp={stopDrawing}
      onPointerLeave={stopDrawing}
    >
      {/* overflow-auto (previously missing entirely, so an oversized grid
          just clipped with no way to scroll) + no items-center, same
          top-clipping trap as CanvasTab — see its comment for why. */}
      <Card className="flex-1 overflow-auto p-6 min-h-0">
        <div className="bg-black/80 backdrop-blur rounded-xl border border-gray-800 p-6 shadow-2xl mx-auto w-fit">
          <PixelGrid
            width={WIDTH}
            height={HEIGHT}
            pixels={frames[activeFrame]}
            cellSize={16}
            gap={4}
            onPixelDown={onPixelDown}
            onPixelEnter={onPixelEnter}
          />
        </div>
      </Card>

      {status && status !== "Uploading..." && status !== "Success" && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">{status}</div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h3 className="text-sm font-bold text-white">
            Frame {activeFrame + 1} / {frames.length}
          </h3>
          <div className="flex items-center gap-3">
            <div className="w-36">
              <SliderControl label="Pen Size" value={penSize} min={1} max={MAX_PEN_SIZE} unit="px" onChange={setPenSize} />
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
              onClick={uploadCurrentFrame}
              disabled={status === "Uploading..." || playing}
              title={playing ? "Stop playback to upload a single frame" : "Upload the current frame to the matrix"}
              className="flex items-center gap-2 px-3 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={16} /> {status === "Uploading..." ? "Sending..." : "Upload to Matrix"}
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {frames.map((frame, i) => (
            <div
              key={i}
              onClick={() => {
                setPlaying(false);
                setActiveFrame(i);
              }}
              className={`relative shrink-0 p-1.5 rounded-lg border cursor-pointer group ${
                activeFrame === i ? "border-primary bg-primary/10" : "border-white/10 bg-black/20 hover:border-white/30"
              }`}
            >
              <PixelGrid width={WIDTH} height={HEIGHT} pixels={frame} cellSize={2} gap={1} interactive={false} />
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
