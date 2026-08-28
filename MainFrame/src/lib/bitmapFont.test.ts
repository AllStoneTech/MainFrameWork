// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { BLANK_GLYPH, GLYPH_HEIGHT, GLYPH_WIDTH, getGlyph, renderText } from "./bitmapFont";

describe("getGlyph", () => {
  it("is case-insensitive", () => {
    expect(getGlyph("A")).toEqual(getGlyph("a"));
  });

  it("returns a non-blank glyph of the correct length for a known letter", () => {
    const glyph = getGlyph("A");
    expect(glyph).toHaveLength(GLYPH_WIDTH * GLYPH_HEIGHT);
    expect(glyph.some((v) => v !== 0)).toBe(true);
  });

  it("falls back to BLANK_GLYPH for an unsupported character without throwing", () => {
    expect(() => getGlyph("$")).not.toThrow();
    expect(getGlyph("$")).toEqual(BLANK_GLYPH);
  });

  it("treats space as an explicitly blank (but supported) glyph", () => {
    expect(getGlyph(" ")).toEqual(BLANK_GLYPH);
  });
});

describe("renderText", () => {
  it("returns a zero-height bitmap for an empty string", () => {
    expect(renderText("", 9)).toEqual({ width: 9, height: 0, pixels: [] });
  });

  it("renders a single glyph horizontally centered within panelWidth", () => {
    const { width, height, pixels } = renderText("A", 9);
    expect(width).toBe(9);
    expect(height).toBe(GLYPH_HEIGHT);

    const leftMargin = Math.floor((9 - GLYPH_WIDTH) / 2);
    const glyphA = getGlyph("A");
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let col = 0; col < 9; col++) {
        const expected =
          col >= leftMargin && col < leftMargin + GLYPH_WIDTH ? glyphA[row * GLYPH_WIDTH + (col - leftMargin)] : 0;
        expect(pixels[row * 9 + col]).toBe(expected);
      }
    }
  });

  it("stacks multiple glyphs along height with a default 1-row gap", () => {
    const { height } = renderText("AB", 9);
    expect(height).toBe(2 * GLYPH_HEIGHT + 1);
  });

  it("respects glyphGap, including a gap of 0", () => {
    expect(renderText("AB", 9, 0).height).toBe(2 * GLYPH_HEIGHT);
    expect(renderText("AB", 9, 3).height).toBe(2 * GLYPH_HEIGHT + 3);
  });

  it("still consumes a glyph slot for unsupported characters rather than dropping them", () => {
    const { height } = renderText("A#B", 9);
    expect(height).toBe(3 * GLYPH_HEIGHT + 2);
  });
});
