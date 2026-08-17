// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shared square-brush painting for Matrix Studio's Canvas and Animator
 * tabs, so both draw against the flat row-major WIDTH*HEIGHT brightness
 * buffer (see matrix_control.rs's pack_pixels) the same way instead of
 * duplicating pixel-toggle logic per tab.
 */
import { useRef, useState } from "react";

/**
 * Returns a new pixel buffer with a `size`x`size` square centered on
 * `index` set to `value` (0 or 255), clipped to the grid bounds. `size`
 * 1 behaves like a single-pixel click.
 */
export function paintBrush(
  pixels: number[],
  index: number,
  width: number,
  height: number,
  size: number,
  value: number
): number[] {
  const next = [...pixels];
  const centerRow = Math.floor(index / width);
  const centerCol = index % width;
  const before = Math.floor((size - 1) / 2);
  for (let dr = -before; dr < size - before; dr++) {
    const row = centerRow + dr;
    if (row < 0 || row >= height) continue;
    for (let dc = -before; dc < size - before; dc++) {
      const col = centerCol + dc;
      if (col < 0 || col >= width) continue;
      next[row * width + col] = value;
    }
  }
  return next;
}

/**
 * Click-to-toggle, drag-to-paint interaction shared by Canvas and
 * Animator: there's no separate Pen/Eraser tool. Clicking a pixel flips
 * it, and dragging from there paints the rest of the stroke with
 * whatever value that first pixel became — a stroke started on a dark
 * cell draws, one started on a lit cell erases, without a mode toggle.
 */
export function useBrushPaint(
  pixels: number[],
  setPixels: (updater: (prev: number[]) => number[]) => void,
  width: number,
  height: number,
  penSize: number
): {
  onPixelDown: (index: number) => void;
  onPixelEnter: (index: number) => void;
  stopDrawing: () => void;
} {
  const paintValueRef = useRef(255);
  const [isDrawing, setIsDrawing] = useState(false);

  const onPixelDown = (index: number): void => {
    const value = pixels[index] > 0 ? 0 : 255;
    paintValueRef.current = value;
    setIsDrawing(true);
    setPixels((prev) => paintBrush(prev, index, width, height, penSize, value));
  };

  const onPixelEnter = (index: number): void => {
    if (!isDrawing) return;
    setPixels((prev) => paintBrush(prev, index, width, height, penSize, paintValueRef.current));
  };

  const stopDrawing = (): void => setIsDrawing(false);

  return { onPixelDown, onPixelEnter, stopDrawing };
}
