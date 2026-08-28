// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { generatePattern, type PatternId } from "./CanvasTab";

const WIDTH = 9;
const HEIGHT = 34;

function at(pixels: number[], row: number, col: number): number {
  return pixels[row * WIDTH + col];
}

describe("generatePattern", () => {
  const ids: PatternId[] = ["blank", "full", "checkerboard", "every2row", "every3row", "every2col", "every3col"];

  it.each(ids)("produces a WIDTH*HEIGHT buffer of only 0/255 for %s", (id) => {
    const pixels = generatePattern(id);
    expect(pixels).toHaveLength(WIDTH * HEIGHT);
    expect(pixels.every((v) => v === 0 || v === 255)).toBe(true);
  });

  it("blank is entirely off", () => {
    expect(generatePattern("blank").every((v) => v === 0)).toBe(true);
  });

  it("full is entirely on", () => {
    expect(generatePattern("full").every((v) => v === 255)).toBe(true);
  });

  it("checkerboard lights cells where (row+col) is even", () => {
    const pixels = generatePattern("checkerboard");
    expect(at(pixels, 0, 0)).toBe(255);
    expect(at(pixels, 0, 1)).toBe(0);
    expect(at(pixels, 1, 0)).toBe(0);
    expect(at(pixels, 1, 1)).toBe(255);
  });

  it("every2row lights even rows only", () => {
    const pixels = generatePattern("every2row");
    expect(at(pixels, 0, 0)).toBe(255);
    expect(at(pixels, 1, 0)).toBe(0);
    expect(at(pixels, 2, 0)).toBe(255);
  });

  it("every3row lights rows divisible by 3", () => {
    const pixels = generatePattern("every3row");
    expect(at(pixels, 0, 0)).toBe(255);
    expect(at(pixels, 1, 0)).toBe(0);
    expect(at(pixels, 3, 0)).toBe(255);
  });

  it("every2col lights even columns only", () => {
    const pixels = generatePattern("every2col");
    expect(at(pixels, 0, 0)).toBe(255);
    expect(at(pixels, 0, 1)).toBe(0);
    expect(at(pixels, 0, 2)).toBe(255);
  });

  it("every3col lights columns divisible by 3", () => {
    const pixels = generatePattern("every3col");
    expect(at(pixels, 0, 0)).toBe(255);
    expect(at(pixels, 0, 1)).toBe(0);
    expect(at(pixels, 0, 3)).toBe(255);
  });
});
