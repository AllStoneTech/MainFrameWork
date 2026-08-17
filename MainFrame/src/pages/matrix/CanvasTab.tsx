// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Live draw canvas tab (Matrix Studio). See the exported component's doc
 * comment below for the wire protocol this speaks to the real device.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Upload } from "lucide-react";
import { PixelGrid } from "../../components/ui/PixelGrid";
import { SliderControl } from "../../components/ui/SliderControl";
import { useBrushPaint } from "../../lib/pixelBrush";
import type { MatrixStudioContext } from "./MatrixStudio";

const WIDTH = 9;
const HEIGHT = 34;
const MAX_PEN_SIZE = 5;

type PatternId = "blank" | "full" | "checkerboard" | "every2row" | "every3row" | "every2col" | "every3col";

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

// Explicit per-option colors, not just a class on <select>: native <option>
// popups render in their own layer that follows OS dark-mode automatically
// when unstyled, which was landing on low-contrast light-gray-on-dark-gray
// text — illegible. `colorScheme: "dark"` plus explicit option colors below
// fixes it reliably instead of hoping Tailwind classes cascade into that
// layer.
const OPTION_STYLE = { color: "#e5e5e5", backgroundColor: "#1a1a1a" };

function generatePattern(id: PatternId): number[] {
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
 * the Pen Size slider for brush width.
 */
export default function CanvasTab(): ReactElement {
  const { panel } = useOutletContext<MatrixStudioContext>();
  const [pixels, setPixels] = useState<number[]>(new Array(WIDTH * HEIGHT).fill(0));
  const [penSize, setPenSize] = useState(1);
  const [brightness, setBrightness] = useState(255);
  const [status, setStatus] = useState<string>("");

  const { onPixelDown, onPixelEnter, stopDrawing } = useBrushPaint(pixels, setPixels, WIDTH, HEIGHT, penSize);

  const applyPattern = (id: PatternId): void => setPixels(generatePattern(id));

  const uploadToDevice = async (): Promise<void> => {
    setStatus("Uploading...");
    try {
      await invoke("update_matrix", { imgData: Array.from(pixels), panel });
      setStatus("Success");
      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error}`);
    }
  };

  const handleBrightnessChange = async (value: number): Promise<void> => {
    setBrightness(value);
    try {
      await invoke("set_matrix_brightness", { panel, brightness: value });
    } catch (error) {
      console.error("Brightness update failed:", error);
    }
  };

  return (
    <div className="h-full flex flex-col" onPointerUp={stopDrawing} onPointerLeave={stopDrawing}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <select
          onChange={(e) => applyPattern(e.target.value as PatternId)}
          defaultValue=""
          style={{ colorScheme: "dark" }}
          className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-200 hover:text-white"
        >
          <option value="" disabled style={OPTION_STYLE}>Pattern...</option>
          {PATTERNS.map((p) => (
            <option key={p.id} value={p.id} style={OPTION_STYLE}>{p.label}</option>
          ))}
        </select>
        <button
          onClick={uploadToDevice}
          disabled={status === "Uploading..."}
          className="px-4 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <Upload size={18} /> {status === "Uploading..." ? "Sending..." : "Upload to Matrix"}
        </button>
      </div>

      <div className="flex flex-wrap gap-6 w-full max-w-md mb-4">
        <div className="flex-1 min-w-[140px]">
          <SliderControl label="Brightness" value={brightness} min={0} max={255} onChange={handleBrightnessChange} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <SliderControl label="Pen Size" value={penSize} min={1} max={MAX_PEN_SIZE} unit="px" onChange={setPenSize} />
        </div>
      </div>

      {status && status !== "Uploading..." && status !== "Success" && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
          {status}
        </div>
      )}

      {/* overflow-auto + a plain block flow here (no items-center) —
          centering an overflowing flex child clips its start edge and only
          lets you scroll toward the end, which is why the top of the grid
          used to be unreachable. Horizontal centering is safe via mx-auto
          on the inner box since width rarely exceeds the container. */}
      <div className="flex-1 overflow-auto bg-[#111] rounded-xl border border-white/5 w-full py-8">
        <div className="bg-black/80 backdrop-blur rounded-xl border border-gray-800 p-8 shadow-2xl inline-block relative mx-auto w-fit">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-xl blur opacity-20" />
          <div className="relative z-10">
            <PixelGrid
              width={WIDTH}
              height={HEIGHT}
              pixels={pixels}
              cellSize={16}
              gap={4}
              onPixelDown={onPixelDown}
              onPixelEnter={onPixelEnter}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-gray-400 text-xs">
        {WIDTH}x{HEIGHT} Single Color LED Matrix • Framework Laptop 16
      </div>
    </div>
  );
}
