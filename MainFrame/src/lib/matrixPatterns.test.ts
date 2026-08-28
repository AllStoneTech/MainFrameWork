// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { BUILTIN_PATTERNS, previewBuiltinPattern } from "./matrixPatterns";

const WIDTH = 9;
const HEIGHT = 34;

describe("BUILTIN_PATTERNS", () => {
  it("has exactly 8 entries, matching the firmware's Pattern command (commands.md)", () => {
    expect(BUILTIN_PATTERNS).toHaveLength(8);
  });

  it("has unique, contiguous ids starting at 0 (the firmware's Pattern parameter)", () => {
    const ids = BUILTIN_PATTERNS.map((p) => p.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("every entry has a non-empty label", () => {
    for (const pattern of BUILTIN_PATTERNS) {
      expect(pattern.label.length).toBeGreaterThan(0);
    }
  });
});

describe("previewBuiltinPattern", () => {
  it("returns a WIDTH*HEIGHT buffer of only 0/255 for every known id", () => {
    for (const { id } of BUILTIN_PATTERNS) {
      const frame = previewBuiltinPattern(id);
      expect(frame).toHaveLength(WIDTH * HEIGHT);
      expect(frame.every((v) => v === 0 || v === 255)).toBe(true);
    }
  });

  it("returns an all-blank frame for an unknown id", () => {
    expect(previewBuiltinPattern(99).every((v) => v === 0)).toBe(true);
  });

  it("Full Brightness (5) is entirely on", () => {
    expect(previewBuiltinPattern(5).every((v) => v === 255)).toBe(true);
  });

  it("Percentage (0) fills roughly half the rows, from the bottom", () => {
    const frame = previewBuiltinPattern(0);
    const onCount = frame.filter((v) => v === 255).length;
    expect(onCount).toBeCloseTo(WIDTH * HEIGHT * 0.5, -1);
    // Bottom-most row should be lit, top-most row should not be.
    expect(frame.slice(0, WIDTH).every((v) => v === 0)).toBe(true);
    expect(frame.slice(-WIDTH).every((v) => v === 255)).toBe(true);
  });

  it("Lotus (3) and Lotus (7) render identically (orientation isn't distinguished — see doc comment)", () => {
    expect(previewBuiltinPattern(3)).toEqual(previewBuiltinPattern(7));
  });

  it("Lotus and Panic previews are non-blank (the text actually renders)", () => {
    expect(previewBuiltinPattern(3).some((v) => v === 255)).toBe(true);
    expect(previewBuiltinPattern(6).some((v) => v === 255)).toBe(true);
  });

  it("Gradient (1) is dimmer at the top than the bottom", () => {
    const frame = previewBuiltinPattern(1);
    const topRows = frame.slice(0, WIDTH * 5).filter((v) => v === 255).length;
    const bottomRows = frame.slice(-WIDTH * 5).filter((v) => v === 255).length;
    expect(bottomRows).toBeGreaterThan(topRows);
  });

  it("Double Gradient (2) is brighter in the middle than at either edge", () => {
    const frame = previewBuiltinPattern(2);
    const topRows = frame.slice(0, WIDTH * 5).filter((v) => v === 255).length;
    const midStart = Math.floor(HEIGHT / 2) * WIDTH - Math.floor((WIDTH * 5) / 2);
    const midRows = frame.slice(midStart, midStart + WIDTH * 5).filter((v) => v === 255).length;
    const bottomRows = frame.slice(-WIDTH * 5).filter((v) => v === 255).length;
    expect(midRows).toBeGreaterThan(topRows);
    expect(midRows).toBeGreaterThan(bottomRows);
  });
});
