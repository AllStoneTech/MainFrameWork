import type { ReactElement } from "react";
interface PixelGridProps {
  width: number;
  height: number;
  pixels: number[];
  cellSize?: number;
  gap?: number;
  interactive?: boolean;
  onPixelDown?: (index: number) => void;
  onPixelEnter?: (index: number) => void;
}

/**
 * Renders a flat brightness-value array (0-255 per cell) as a grid of
 * LED-style cells. Shared by Matrix Studio's Canvas and Animator tabs so
 * both draw against the same visual representation of the 9x34 module.
 */
export function PixelGrid({
  width,
  height,
  pixels,
  cellSize = 24,
  gap = 6,
  interactive = true,
  onPixelDown,
  onPixelEnter,
}: PixelGridProps): ReactElement {
  return (
    <div
      role="img"
      aria-label={`${width}x${height} LED matrix`}
      className="grid select-none touch-none"
      style={{ gridTemplateColumns: `repeat(${width}, ${cellSize}px)`, gap }}
    >
      {pixels.map((val, i) => (
        <div
          key={i}
          onPointerDown={() => interactive && onPixelDown?.(i)}
          onPointerEnter={() => interactive && onPixelEnter?.(i)}
          style={{ width: cellSize, height: cellSize }}
          className={`rounded-[2px] transition-colors duration-75 border ${interactive ? "cursor-pointer" : ""} ${
            val > 0
              ? "bg-primary border-primary shadow-[0_0_8px_rgba(255,140,0,0.6)]"
              : "bg-[#111] border-[#222] hover:bg-[#222]"
          }`}
        />
      ))}
    </div>
  );
}
