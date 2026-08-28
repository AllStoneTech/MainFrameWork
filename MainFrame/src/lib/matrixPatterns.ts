// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The LED Matrix firmware's built-in patterns (see `commands.md` in
 * FrameworkComputer/inputmodule-rs) — distinct from this app's own
 * client-drawn patterns (CanvasTab.tsx's `generatePattern`/`PatternId`).
 * These are rendered entirely on the module's own firmware via the
 * `Pattern` command; the host never sees the resulting pixels, so
 * `previewBuiltinPattern` below is a *local approximation* for the
 * on-screen grid, not the real thing — see its own doc comment.
 *
 * Any of these 8 patterns can additionally be scrolled via the
 * firmware's separate `Animate` command — animate isn't a property of
 * the pattern itself, it's a bool toggle layered on top of whichever
 * pattern is currently set. `BUILTIN_PATTERNS` enumerates the 8 once;
 * callers pair each with both a static and an animated selection.
 */
import { invoke } from "@tauri-apps/api/core";
import { renderText } from "./bitmapFont";

export interface BuiltinPattern {
  id: number;
  label: string;
}

const WIDTH = 9;
const HEIGHT = 34;

// Percentage (id 0) needs a fill-level parameter the other 7 don't; a
// UI control just for that one pattern isn't worth it here, so it's
// exposed as a fixed 50% fill — a reasonable "half lit" preset.
const PERCENTAGE_DEFAULT = 50;

export const BUILTIN_PATTERNS: BuiltinPattern[] = [
  { id: 0, label: "Percentage (50%)" },
  { id: 1, label: "Gradient" },
  { id: 2, label: "Double Gradient" },
  { id: 3, label: "Lotus (Horizontal)" },
  { id: 4, label: "Zig Zag" },
  { id: 5, label: "Full Brightness" },
  { id: 6, label: "Panic" },
  { id: 7, label: "Lotus (Vertical)" },
];

/**
 * Sends a built-in pattern to the device with an explicit Animate on/off
 * so the result is deterministic regardless of whatever animate state a
 * previous selection left behind — one round trip (`set_matrix_pattern_and_animate`,
 * one serial port session) rather than two separate commands, since the
 * two were always sent together from here anyway and each independently
 * opening the port was pure added latency.
 */
export async function applyBuiltinPattern(panel: string, patternId: number, animate: boolean): Promise<void> {
  await invoke("set_matrix_pattern_and_animate", {
    panel,
    patternId,
    percentage: patternId === 0 ? PERCENTAGE_DEFAULT : null,
    animate,
  });
}

function blankFrame(): number[] {
  return new Array(WIDTH * HEIGHT).fill(0);
}

function textPreview(text: string): number[] {
  const bitmap = renderText(text, WIDTH);
  const frame = blankFrame();
  const topPad = Math.max(0, Math.floor((HEIGHT - bitmap.height) / 2));
  for (let row = 0; row < bitmap.height && topPad + row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      frame[(topPad + row) * WIDTH + col] = bitmap.pixels[row * WIDTH + col] > 0 ? 255 : 0;
    }
  }
  return frame;
}

// A small ordered-dither threshold so a "density" (0-1) reads as a
// speckled fill rather than a single sharp on/off edge — used to
// approximate the two brightness-gradient patterns on a 1-bit display.
function ditherRow(row: number, density: number): number[] {
  const out: number[] = [];
  for (let col = 0; col < WIDTH; col++) {
    const threshold = ((col * 5 + row * 3) % 8) / 8;
    out.push(threshold < density ? 255 : 0);
  }
  return out;
}

/**
 * A reasonable local approximation of what a built-in firmware pattern
 * probably looks like, purely so the on-screen grid doesn't sit there
 * looking stale/unchanged after picking one — see the module doc
 * comment for why this can't be pixel-exact (the firmware renders these
 * itself and never reports the result back). The text patterns
 * (Lotus/Panic) reuse this app's own 5x7 font rather than attempting to
 * match the firmware's; the two Lotus orientations aren't distinguished
 * for the same reason.
 */
export function previewBuiltinPattern(id: number): number[] {
  switch (id) {
    case 0: {
      // Percentage: fills from the bottom up, matching a typical
      // progress/level indicator; fixed at the same 50% as PERCENTAGE_DEFAULT.
      const frame = blankFrame();
      const filledRows = Math.round(HEIGHT * (PERCENTAGE_DEFAULT / 100));
      for (let row = HEIGHT - filledRows; row < HEIGHT; row++) {
        for (let col = 0; col < WIDTH; col++) frame[row * WIDTH + col] = 255;
      }
      return frame;
    }
    case 1: {
      const frame: number[] = [];
      for (let row = 0; row < HEIGHT; row++) frame.push(...ditherRow(row, row / (HEIGHT - 1)));
      return frame;
    }
    case 2: {
      const mid = (HEIGHT - 1) / 2;
      const frame: number[] = [];
      for (let row = 0; row < HEIGHT; row++) frame.push(...ditherRow(row, 1 - Math.abs(row - mid) / mid));
      return frame;
    }
    case 3:
    case 7:
      return textPreview("LOTUS");
    case 4: {
      const frame = blankFrame();
      for (let row = 0; row < HEIGHT; row++) {
        for (let col = 0; col < WIDTH; col++) {
          frame[row * WIDTH + col] = (row + col) % 6 < 3 ? 255 : 0;
        }
      }
      return frame;
    }
    case 5:
      return new Array(WIDTH * HEIGHT).fill(255);
    case 6:
      return textPreview("PANIC");
    default:
      return blankFrame();
  }
}
