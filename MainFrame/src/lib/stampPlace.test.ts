// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { placeStamp, stampFootprint, type StampGlyph } from "./stampPlace";

const GRID_WIDTH = 9;
const GRID_HEIGHT = 34;

// 2x2 fully-lit stamp, small enough to test clipping at every edge.
const SOLID_2X2: StampGlyph = { width: 2, height: 2, pixels: [1, 1, 1, 1] };
const BLANK_2X2: StampGlyph = { width: 2, height: 2, pixels: [0, 0, 0, 0] };
// Checkerboard stamp so "only stamp-on cells are touched" is verifiable.
const CHECKER_2X2: StampGlyph = { width: 2, height: 2, pixels: [1, 0, 0, 1] };

function blankBuffer(): number[] {
  return new Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
}

describe("stampFootprint", () => {
  it("returns only the in-bounds, stamp-on indices for a fully in-bounds anchor", () => {
    const anchor = 5 * GRID_WIDTH + 3; // row 5, col 3
    const footprint = stampFootprint(anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2);
    expect(footprint.sort((a, b) => a - b)).toEqual(
      [anchor, anchor + 1, anchor + GRID_WIDTH, anchor + GRID_WIDTH + 1].sort((a, b) => a - b)
    );
  });

  it("skips stamp cells that are 0", () => {
    const anchor = 5 * GRID_WIDTH + 3;
    const footprint = stampFootprint(anchor, GRID_WIDTH, GRID_HEIGHT, CHECKER_2X2);
    expect(footprint.sort((a, b) => a - b)).toEqual([anchor, anchor + GRID_WIDTH + 1].sort((a, b) => a - b));
  });

  it("clips at the right edge", () => {
    const anchor = 0 * GRID_WIDTH + (GRID_WIDTH - 1); // last column, top row
    const footprint = stampFootprint(anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2);
    expect(footprint.sort((a, b) => a - b)).toEqual([anchor, anchor + GRID_WIDTH].sort((a, b) => a - b));
  });

  it("clips at the bottom edge", () => {
    const anchor = (GRID_HEIGHT - 1) * GRID_WIDTH + 3; // last row
    const footprint = stampFootprint(anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2);
    expect(footprint.sort((a, b) => a - b)).toEqual([anchor, anchor + 1].sort((a, b) => a - b));
  });

  it("returns an empty footprint when the stamp has zero in-bounds overlap", () => {
    // Negative index simulates "anchored above/left of the grid" — every
    // destination cell for a 2x2 stamp falls outside bounds.
    const offGridAnchor = -2;
    const footprint = stampFootprint(offGridAnchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2);
    expect(footprint).toEqual([]);
  });
});

describe("placeStamp", () => {
  it("OR-merges the stamp onto a copy of the buffer", () => {
    const pixels = blankBuffer();
    const anchor = 5 * GRID_WIDTH + 3;
    const result = placeStamp(pixels, anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2);
    for (const index of stampFootprint(anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2)) {
      expect(result[index]).toBe(255);
    }
  });

  it("does not erase existing on-pixels under stamp-off cells", () => {
    const pixels = blankBuffer();
    const anchor = 5 * GRID_WIDTH + 3;
    // Pre-light the cell that CHECKER_2X2 leaves off (top-right of the 2x2).
    const offCellIndex = anchor + 1;
    pixels[offCellIndex] = 255;

    const result = placeStamp(pixels, anchor, GRID_WIDTH, GRID_HEIGHT, CHECKER_2X2);
    expect(result[offCellIndex]).toBe(255);
  });

  it("clips cleanly at grid edges without throwing or writing out of bounds", () => {
    const pixels = blankBuffer();
    const anchor = (GRID_HEIGHT - 1) * GRID_WIDTH + (GRID_WIDTH - 1); // bottom-right corner
    expect(() => placeStamp(pixels, anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2)).not.toThrow();
    const result = placeStamp(pixels, anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2);
    expect(result).toHaveLength(GRID_WIDTH * GRID_HEIGHT);
    expect(result[GRID_WIDTH * GRID_HEIGHT - 1]).toBe(255);
  });

  it("leaves the buffer unchanged for an all-zero stamp", () => {
    const pixels = blankBuffer();
    const anchor = 5 * GRID_WIDTH + 3;
    const result = placeStamp(pixels, anchor, GRID_WIDTH, GRID_HEIGHT, BLANK_2X2);
    expect(result).toEqual(pixels);
  });

  it("returns a new array and never mutates the input", () => {
    const pixels = blankBuffer();
    const anchor = 5 * GRID_WIDTH + 3;
    const result = placeStamp(pixels, anchor, GRID_WIDTH, GRID_HEIGHT, SOLID_2X2);
    expect(result).not.toBe(pixels);
    expect(pixels.every((v) => v === 0)).toBe(true);
  });
});
