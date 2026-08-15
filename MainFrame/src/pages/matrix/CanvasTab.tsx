import type { ReactElement } from "react";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Eraser, Pen, Upload, Moon, Sun } from "lucide-react";
import { PixelGrid } from "../../components/ui/PixelGrid";
import { SliderControl } from "../../components/ui/SliderControl";
import type { MatrixStudioContext } from "./MatrixStudio";

const WIDTH = 9;
const HEIGHT = 34;

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
 */
export default function CanvasTab(): ReactElement {
  const { panel } = useOutletContext<MatrixStudioContext>();
  const [pixels, setPixels] = useState<number[]>(new Array(WIDTH * HEIGHT).fill(0));
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [brightness, setBrightness] = useState(255);
  const [status, setStatus] = useState<string>("");

  const handlePixelAction = (index: number): void => {
    setPixels((prev) => {
      const next = [...prev];
      next[index] = tool === "pen" ? 255 : 0;
      return next;
    });
  };

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

  const handleSleep = async (sleep: boolean): Promise<void> => {
    try {
      await invoke("set_matrix_sleep", { panel, sleep });
    } catch (error) {
      console.error("Sleep toggle failed:", error);
    }
  };

  return (
    <div
      className="h-full flex flex-col"
      onPointerUp={() => setIsDrawing(false)}
      onPointerLeave={() => setIsDrawing(false)}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTool("pen")}
            className={`p-2 rounded-lg border flex items-center gap-2 ${tool === "pen" ? "bg-primary text-black border-primary" : "bg-black/20 border-white/10 text-gray-400"}`}
          >
            <Pen size={18} /> Pen
          </button>
          <button
            onClick={() => setTool("eraser")}
            className={`p-2 rounded-lg border flex items-center gap-2 ${tool === "eraser" ? "bg-primary text-black border-primary" : "bg-black/20 border-white/10 text-gray-400"}`}
          >
            <Eraser size={18} /> Eraser
          </button>
          <select
            onChange={(e) => applyPattern(e.target.value as PatternId)}
            defaultValue=""
            className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white"
          >
            <option value="" disabled>Pattern...</option>
            {PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button
            title="Sleep"
            onClick={() => handleSleep(true)}
            className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-gray-400 hover:text-white"
          >
            <Moon size={18} />
          </button>
          <button
            title="Wake"
            onClick={() => handleSleep(false)}
            className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-gray-400 hover:text-white"
          >
            <Sun size={18} />
          </button>
        </div>
        <button
          onClick={uploadToDevice}
          disabled={status === "Uploading..."}
          className="px-4 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <Upload size={18} /> {status === "Uploading..." ? "Sending..." : "Upload to Matrix"}
        </button>
      </div>

      <div className="w-full max-w-xs mb-4">
        <SliderControl label="Brightness" value={brightness} min={0} max={255} onChange={handleBrightnessChange} />
      </div>

      {status && status !== "Uploading..." && status !== "Success" && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
          {status}
        </div>
      )}

      <div className="flex flex-1 justify-center items-center overflow-auto bg-[#111] rounded-xl border border-white/5 w-full py-8">
        <div className="bg-black/80 backdrop-blur rounded-xl border border-gray-800 p-8 shadow-2xl inline-block relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-xl blur opacity-20" />
          <div className="relative z-10">
            <PixelGrid
              width={WIDTH}
              height={HEIGHT}
              pixels={pixels}
              onPixelDown={(i) => {
                setIsDrawing(true);
                handlePixelAction(i);
              }}
              onPixelEnter={(i) => isDrawing && handlePixelAction(i)}
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
