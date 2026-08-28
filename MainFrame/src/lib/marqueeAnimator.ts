// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * "Intelligent" text-to-animation for Matrix Studio's Animator tab: turns
 * a typed string directly into a sequence of frames, rather than
 * requiring the message to be hand-drawn one frame at a time.
 *
 * Built on bitmapFont.ts's vertical glyph stacking (see its doc comment
 * for why text is laid out top-to-bottom rather than left-to-right on
 * this panel's aspect ratio). "Intelligent" specifically means: text that
 * already fits within the panel height doesn't get animated at all — it
 * comes back as one centered static frame — and text that doesn't fit
 * gets padded with a full panel-height of blank margin on each side so it
 * scrolls cleanly on-screen and back off, rather than jump-cutting.
 */
import { renderText, type TextBitmap } from "./bitmapFont";

export interface MarqueeOptions {
  panelWidth: number;
  panelHeight: number;
  /** Blank rows between stacked glyphs, forwarded to renderText. Default 1. */
  glyphGap?: number;
  /** Rows the scroll window advances per generated frame — the "speed" knob. Default 1. */
  stepRows?: number;
}

function blankFrame(panelWidth: number, panelHeight: number): number[] {
  return new Array(panelWidth * panelHeight).fill(0);
}

function toBrightness(bit: number): number {
  return bit > 0 ? 255 : 0;
}

/** Vertically centers a bitmap that already fits within panelHeight into a single frame. */
function centeredFrame(bitmap: TextBitmap, panelWidth: number, panelHeight: number): number[] {
  const frame = blankFrame(panelWidth, panelHeight);
  const topPad = Math.floor((panelHeight - bitmap.height) / 2);
  for (let row = 0; row < bitmap.height; row++) {
    const destRow = topPad + row;
    if (destRow < 0 || destRow >= panelHeight) continue;
    for (let col = 0; col < panelWidth; col++) {
      frame[destRow * panelWidth + col] = toBrightness(bitmap.pixels[row * panelWidth + col]);
    }
  }
  return frame;
}

/** Extracts one panelHeight-row window starting at row `windowStart` from a padded strip. */
function windowFrame(padded: number[], panelWidth: number, panelHeight: number, windowStart: number): number[] {
  const frame = new Array(panelWidth * panelHeight);
  const base = windowStart * panelWidth;
  for (let i = 0; i < panelWidth * panelHeight; i++) {
    frame[i] = toBrightness(padded[base + i]);
  }
  return frame;
}

/**
 * Renders `text` and turns it into a frame sequence for AnimatorTab:
 * - Blank/whitespace-only text: a single blank frame.
 * - Text that fits within `panelHeight` once laid out: a single frame,
 *   vertically centered — no pointless scrolling of a message that
 *   already fits on-screen.
 * - Longer text: padded with one `panelHeight` of blank rows before and
 *   after (clean scroll-in/scroll-out, no jarring loop seam), then a
 *   `panelHeight`-row window slides down it in `stepRows`-row steps. The
 *   final (fully scrolled-off) window position is always included as the
 *   last frame even if `stepRows` doesn't evenly divide the distance, so
 *   playback always ends clean rather than skipping the tail.
 */
export function generateMarqueeFrames(text: string, opts: MarqueeOptions): number[][] {
  const { panelWidth, panelHeight, glyphGap = 1, stepRows = 1 } = opts;

  if (text.trim().length === 0) {
    return [blankFrame(panelWidth, panelHeight)];
  }

  const bitmap = renderText(text, panelWidth, glyphGap);

  if (bitmap.height <= panelHeight) {
    return [centeredFrame(bitmap, panelWidth, panelHeight)];
  }

  const paddedHeight = panelHeight + bitmap.height + panelHeight;
  const padded = new Array(panelWidth * paddedHeight).fill(0);
  for (let i = 0; i < bitmap.pixels.length; i++) {
    padded[panelHeight * panelWidth + i] = bitmap.pixels[i];
  }

  const maxStart = paddedHeight - panelHeight;
  const step = Math.max(1, Math.floor(stepRows));
  const frames: number[][] = [];
  for (let windowStart = 0; windowStart <= maxStart; windowStart += step) {
    frames.push(windowFrame(padded, panelWidth, panelHeight, windowStart));
  }

  const lastStart = (frames.length - 1) * step;
  if (lastStart !== maxStart) {
    frames.push(windowFrame(padded, panelWidth, panelHeight, maxStart));
  }

  return frames;
}
