// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { paintBrush } from "./pixelBrush";

const WIDTH = 9;
const HEIGHT = 34;

function blankBuffer(): number[] {
  return new Array(WIDTH * HEIGHT).fill(0);
}

describe("paintBrush", () => {
  it("behaves like a single-pixel click when size is 1", () => {
    const pixels = blankBuffer();
    const index = 5 * WIDTH + 3;
    const result = paintBrush(pixels, index, WIDTH, HEIGHT, 1, 255);
    expect(result[index]).toBe(255);
    expect(result.filter((v) => v === 255)).toHaveLength(1);
  });

  it("paints a size x size square centered on the index", () => {
    const pixels = blankBuffer();
    const centerRow = 10;
    const centerCol = 4;
    const index = centerRow * WIDTH + centerCol;
    const result = paintBrush(pixels, index, WIDTH, HEIGHT, 3, 255);

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        expect(result[(centerRow + dr) * WIDTH + (centerCol + dc)]).toBe(255);
      }
    }
    expect(result.filter((v) => v === 255)).toHaveLength(9);
  });

  it("applies the given value, including erasing with 0", () => {
    const pixels = new Array(WIDTH * HEIGHT).fill(255);
    const index = 5 * WIDTH + 3;
    const result = paintBrush(pixels, index, WIDTH, HEIGHT, 1, 0);
    expect(result[index]).toBe(0);
  });

  it("clips the brush at the grid edges without throwing", () => {
    const pixels = blankBuffer();
    const cornerIndex = 0; // row 0, col 0
    expect(() => paintBrush(pixels, cornerIndex, WIDTH, HEIGHT, 3, 255)).not.toThrow();
    const result = paintBrush(pixels, cornerIndex, WIDTH, HEIGHT, 3, 255);
    // Only the in-bounds portion of the 3x3 square (rows -1..1, cols -1..1
    // clipped to >=0) should be painted: a 2x2 quadrant.
    expect(result.filter((v) => v === 255)).toHaveLength(4);
  });

  it("returns a new array and does not mutate the input", () => {
    const pixels = blankBuffer();
    const result = paintBrush(pixels, 0, WIDTH, HEIGHT, 1, 255);
    expect(result).not.toBe(pixels);
    expect(pixels.every((v) => v === 0)).toBe(true);
  });
});
