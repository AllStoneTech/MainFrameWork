import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eraser, Pen, Upload } from "lucide-react";

const WIDTH = 9;
const HEIGHT = 34;

export default function MatrixStudio() {
  // Flat array of brightness values (0-255). 
  // For MVP, we use 0 (off) or 255 (on).
  const [pixels, setPixels] = useState<number[]>(new Array(WIDTH * HEIGHT).fill(0));
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [status, setStatus] = useState<string>("");

  const handlePixelAction = (index: number) => {
    const newPixels = [...pixels];
    newPixels[index] = tool === "pen" ? 255 : 0;
    setPixels(newPixels);
  };

  const handlePointerDown = (index: number) => {
    setIsDrawing(true);
    handlePixelAction(index);
  };

  const handlePointerEnter = (index: number) => {
    if (isDrawing) {
      handlePixelAction(index);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    setPixels(new Array(WIDTH * HEIGHT).fill(0));
  };

  const uploadToDevice = async () => {
    setStatus("Uploading...");
    try {
      // Protocol: Convert pixels to Uint8Array. 
      // The firmware likely expects rows or columns mapped specifically.
      // For this MVP we send the flat buffer.
      await invoke("update_matrix", { imgData: Array.from(pixels) });
      setStatus("Success");
      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      console.error(error);
      setStatus(`Error: ${error}`);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col" onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Matrix Studio</h1>
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
          <button 
            onClick={clearCanvas}
            className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            Clear
          </button>
          <div className="w-1 bg-[#333] mx-2"></div>
          <button 
            onClick={uploadToDevice}
            disabled={status === "Uploading..."}
            className="px-4 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <Upload size={18} /> {status === "Uploading..." ? "Sending..." : "Upload to Matrix"}
          </button>
        </div>
      </div>
      
      {status && status !== "Uploading..." && status !== "Success" && (
         <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
           {status}
         </div>
      )}

      <div className="flex flex-1 justify-center overflow-auto">
        <div className="bg-black rounded-xl border border-gray-800 p-8 shadow-2xl inline-block">
            {/* The Matrix is tall (9 wide x 34 tall). We render it rotated 90deg visually? Na, let's render it vertical like the numpad. */}
            <div 
              className="grid gap-1.5 select-none touch-none"
              style={{ 
                gridTemplateColumns: `repeat(${WIDTH}, 24px)` 
              }}
            >
              {pixels.map((val, i) => (
                <div
                  key={i}
                  onPointerDown={() => handlePointerDown(i)}
                  onPointerEnter={() => handlePointerEnter(i)}
                  className={`w-6 h-6 rounded-[2px] transition-colors duration-75 cursor-pointer border ${
                    val > 0 
                      ? "bg-primary border-primary shadow-[0_0_8px_rgba(255,140,0,0.6)]" 
                      : "bg-[#111] border-[#222] hover:bg-[#222]"
                  }`}
                />
              ))}
            </div>
        </div>
      </div>

      <div className="mt-4 text-center text-gray-500 text-xs">
        {WIDTH}x{HEIGHT} Single Color LED Matrix • Framework Laptop 16
      </div>
    </div>
  );
}
