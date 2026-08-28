// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shared stamp placement for Matrix Studio's Canvas and Animator tabs,
 * parallel to pixelBrush.ts's paintBrush/useBrushPaint but for placing a
 * whole glyph/icon/text bitmap at once instead of painting pixel-by-pixel.
 * A stamp always OR-merges onto the buffer (only turns pixels on) rather
 * than toggling, since erasing an unwanted stamp is already the brush
 * tool's job.
 */
import { useState } from "react";

/** A symbol to stamp: any width x height 0/1 (or 0/255) bitmap. */
export interface StampGlyph {
  width: number;
  height: number;
  pixels: number[];
}

/**
 * Row-major indices in a `gridWidth`x`gridHeight` buffer that `stamp`
 * would light up if top-left anchored at `anchorIndex`, clipped to grid
 * bounds and restricted to cells where the stamp itself is "on" (> 0).
 * Shared by placeStamp (to merge) and useStampPlace (to compute the hover
 * ghost) so both agree exactly on what a placement covers.
 */
export function stampFootprint(
  anchorIndex: number,
  gridWidth: number,
  gridHeight: number,
  stamp: StampGlyph
): number[] {
  const anchorRow = Math.floor(anchorIndex / gridWidth);
  const anchorCol = anchorIndex % gridWidth;
  const footprint: number[] = [];

  for (let row = 0; row < stamp.height; row++) {
    const destRow = anchorRow + row;
    if (destRow < 0 || destRow >= gridHeight) continue;
    for (let col = 0; col < stamp.width; col++) {
      const destCol = anchorCol + col;
      if (destCol < 0 || destCol >= gridWidth) continue;
      if (stamp.pixels[row * stamp.width + col] > 0) {
        footprint.push(destRow * gridWidth + destCol);
      }
    }
  }

  return footprint;
}

/**
 * Returns a new pixel buffer with `stamp` OR-merged on top, top-left
 * anchored at `anchorIndex` and clipped to bounds. Cells where the stamp
 * is 0 are left untouched — this never erases existing "on" pixels.
 */
export function placeStamp(
  pixels: number[],
  anchorIndex: number,
  gridWidth: number,
  gridHeight: number,
  stamp: StampGlyph
): number[] {
  const next = [...pixels];
  for (const index of stampFootprint(anchorIndex, gridWidth, gridHeight, stamp)) {
    next[index] = 255;
  }
  return next;
}

/**
 * Hover-preview + click-to-commit interaction for the stamp tool. Unlike
 * useBrushPaint, hovering never mutates the live buffer — it only tracks
 * which indices to render as a translucent ghost (via PixelGrid's
 * ghostIndices prop); the buffer is only touched on click, via
 * placeStamp, which reads the current buffer from setPixels's updater
 * argument rather than needing the live pixels passed in directly (unlike
 * useBrushPaint, placement never depends on what's already there —
 * there's no toggle decision to make). Passing `stamp: null` (no symbol
 * selected yet) makes both callbacks no-ops.
 */
export function useStampPlace(
  setPixels: (updater: (prev: number[]) => number[]) => void,
  width: number,
  height: number,
  stamp: StampGlyph | null
): {
  ghostIndices: Set<number>;
  onPixelDown: (index: number) => void;
  onPixelEnter: (index: number) => void;
  onPixelLeaveGrid: () => void;
} {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const ghostIndices =
    hoverIndex !== null && stamp !== null
      ? new Set(stampFootprint(hoverIndex, width, height, stamp))
      : new Set<number>();

  const onPixelDown = (index: number): void => {
    if (!stamp) return;
    setPixels((prev) => placeStamp(prev, index, width, height, stamp));
  };

  const onPixelEnter = (index: number): void => setHoverIndex(index);
  const onPixelLeaveGrid = (): void => setHoverIndex(null);

  return { ghostIndices, onPixelDown, onPixelEnter, onPixelLeaveGrid };
}
