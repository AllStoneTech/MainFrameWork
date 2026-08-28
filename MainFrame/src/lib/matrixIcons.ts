// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Small hand-authored icon set for Matrix Studio's stamp tool (see
 * StampPalette.tsx). Each icon is full panel width (9) so it can be
 * stamped as a single self-contained symbol, and 7 rows tall to match
 * bitmapFont.ts's GLYPH_HEIGHT so palette thumbnails line up visually
 * with letter/digit glyphs.
 */

export const ICON_WIDTH = 9;
export const ICON_HEIGHT = 7;

export interface IconDef {
  id: string;
  label: string;
  pixels: number[];
}

// Authored as 7 row-strings ('1' = lit) for readability, flattened below.
const RAW_ICONS: { id: string; label: string; rows: string[] }[] = [
  {
    id: "battery",
    label: "Battery",
    rows: ["000000000", "011111110", "010000011", "011011011", "010000011", "011111110", "000000000"],
  },
  {
    id: "heart",
    label: "Heart",
    rows: ["001101100", "011111110", "111111111", "111111111", "011111110", "001111100", "000010000"],
  },
  {
    id: "wifi",
    label: "Wifi",
    rows: ["000000000", "011111110", "100000001", "001111100", "010000010", "000111000", "000010000"],
  },
  {
    id: "arrow-up",
    label: "Arrow Up",
    rows: ["000010000", "000111000", "001111100", "011111110", "000010000", "000010000", "000010000"],
  },
  {
    id: "star",
    label: "Star",
    rows: ["000010000", "000010000", "111111111", "001111100", "010101010", "010000010", "001000100"],
  },
  {
    id: "smile",
    label: "Smile",
    rows: ["001111100", "010000010", "101000101", "100000001", "101000101", "011101110", "001111100"],
  },
  {
    id: "sad",
    label: "Sad",
    rows: ["001111100", "010000010", "101000101", "100000001", "100111001", "011000110", "001111100"],
  },
  {
    id: "wink",
    label: "Wink",
    rows: ["001111100", "010000010", "101001111", "100000001", "101000101", "011101110", "001111100"],
  },
  {
    id: "note",
    label: "Note",
    rows: ["000001100", "000001010", "000001100", "000001000", "000001000", "001111000", "001111000"],
  },
  {
    id: "bell",
    label: "Bell",
    rows: ["000010000", "000111000", "001111100", "001111100", "011111110", "111111111", "000010000"],
  },
  {
    id: "check",
    label: "Check",
    rows: ["000000010", "000000100", "010001000", "001010000", "000100000", "000000000", "000000000"],
  },
  {
    id: "x-mark",
    label: "X",
    rows: ["010000010", "001000100", "000101000", "000010000", "000101000", "001000100", "010000010"],
  },
  {
    id: "lightning",
    label: "Lightning",
    rows: ["000011000", "000110000", "001100000", "011111100", "000001100", "000011000", "000110000"],
  },
];

function flatten(rows: string[]): number[] {
  return rows.join("").split("").map(Number);
}

export const ICONS: IconDef[] = RAW_ICONS.map(({ id, label, rows }) => ({
  id,
  label,
  pixels: flatten(rows),
}));

/** Looks up an icon by id; returns undefined for an unknown id. */
export function getIcon(id: string): IconDef | undefined {
  return ICONS.find((icon) => icon.id === id);
}
