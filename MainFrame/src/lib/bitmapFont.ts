// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Hand-authored 5x7 bitmap font (A-Z, 0-9, space, and basic punctuation)
 * and the layout logic that turns a string into a flat bitmap. Shared by
 * Matrix Studio's stamp tool (StampPalette) and AnimatorTab's marquee
 * generator (marqueeAnimator.ts), so both draw letters from the same
 * glyph shapes.
 *
 * Glyphs stay upright and are meant to be stacked along the panel's
 * HEIGHT axis (34), not laid out left-to-right — see renderText's doc
 * comment for why: the panel is only 9 columns wide, so a conventional
 * horizontal line of text would show at most ~1 character at a time.
 */

/** Every glyph is GLYPH_WIDTH columns x GLYPH_HEIGHT rows. */
export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

/** Flat GLYPH_WIDTH*GLYPH_HEIGHT row-major array, values 0|1. */
export type Glyph = number[];

// Authored as 7 row-strings per glyph ('1' = lit) for readability, then
// flattened once at module load. Each string must be GLYPH_WIDTH chars.
const RAW_FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00000", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

function flatten(rows: string[]): Glyph {
  return rows.join("").split("").map(Number);
}

/** All-zero glyph, used for unsupported characters. */
export const BLANK_GLYPH: Glyph = new Array(GLYPH_WIDTH * GLYPH_HEIGHT).fill(0);

/** A-Z, 0-9, space, and `. , ! ? : -`, each a flat 0|1 GLYPH_WIDTH*GLYPH_HEIGHT array. */
export const FONT: Record<string, Glyph> = Object.fromEntries(
  Object.entries(RAW_FONT).map(([char, rows]) => [char, flatten(rows)])
);

/**
 * Looks up a single character's glyph, case-insensitive (the font only
 * defines uppercase shapes). Unsupported characters fall back to
 * BLANK_GLYPH rather than throwing or being skipped, so callers never
 * need a try/catch and text length always maps predictably to layout
 * height in renderText.
 */
export function getGlyph(char: string): Glyph {
  return FONT[char.toUpperCase()] ?? BLANK_GLYPH;
}

/** A rendered string, as a flat 0|1 bitmap `width` columns wide. */
export interface TextBitmap {
  width: number;
  height: number;
  pixels: number[];
}

/**
 * Lays `text` out as a bitmap `panelWidth` columns wide: each glyph stays
 * upright (GLYPH_WIDTH x GLYPH_HEIGHT, not rotated) and is horizontally
 * centered within `panelWidth`, and glyphs are stacked along the HEIGHT
 * axis with `glyphGap` blank rows between consecutive characters.
 *
 * This reads top-to-bottom rather than left-to-right by design: on a
 * panel only `panelWidth` (9) columns wide, a horizontal line of 5px-wide
 * glyphs would show at most ~1 character before running off the edge,
 * while stacking vertically along the 34-row axis shows several at once.
 * Used unpadded by the stamp tool's text mode, and as the input to
 * marqueeAnimator's scroll-window padding for longer messages.
 */
export function renderText(text: string, panelWidth: number, glyphGap = 1): TextBitmap {
  if (text.length === 0) {
    return { width: panelWidth, height: 0, pixels: [] };
  }

  const height = text.length * GLYPH_HEIGHT + (text.length - 1) * glyphGap;
  const pixels = new Array(panelWidth * height).fill(0);
  const leftMargin = Math.floor((panelWidth - GLYPH_WIDTH) / 2);

  for (let charIndex = 0; charIndex < text.length; charIndex++) {
    const glyph = getGlyph(text[charIndex]);
    const rowOffset = charIndex * (GLYPH_HEIGHT + glyphGap);
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        const destCol = leftMargin + col;
        if (destCol < 0 || destCol >= panelWidth) continue;
        pixels[(rowOffset + row) * panelWidth + destCol] = glyph[row * GLYPH_WIDTH + col];
      }
    }
  }

  return { width: panelWidth, height, pixels };
}
