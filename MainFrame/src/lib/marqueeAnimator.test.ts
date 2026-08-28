// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { generateMarqueeFrames } from "./marqueeAnimator";
import { GLYPH_HEIGHT, renderText } from "./bitmapFont";

const PANEL_WIDTH = 9;
const PANEL_HEIGHT = 34;

function isAllBlank(frame: number[]): boolean {
  return frame.every((v) => v === 0);
}

describe("generateMarqueeFrames", () => {
  it("returns a single blank frame for an empty string", () => {
    const frames = generateMarqueeFrames("", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(PANEL_WIDTH * PANEL_HEIGHT);
    expect(isAllBlank(frames[0])).toBe(true);
  });

  it("returns a single blank frame for whitespace-only text", () => {
    const frames = generateMarqueeFrames("   ", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT });
    expect(frames).toHaveLength(1);
    expect(isAllBlank(frames[0])).toBe(true);
  });

  it("does not animate text that exactly fits the panel height", () => {
    // 4 chars * 7 + 3 gaps = 31 <= 34.
    const frames = generateMarqueeFrames("HELP", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT });
    expect(renderText("HELP", PANEL_WIDTH).height).toBeLessThanOrEqual(PANEL_HEIGHT);
    expect(frames).toHaveLength(1);
  });

  it("animates text that is exactly one row over the fit boundary", () => {
    // Construct text whose rendered height is panelHeight + 1 by using a
    // 0 glyphGap and enough characters: 5 chars * 7 = 35 = 34 + 1.
    const bitmap = renderText("ABCDE", PANEL_WIDTH, 0);
    expect(bitmap.height).toBe(PANEL_HEIGHT + 1);

    const frames = generateMarqueeFrames("ABCDE", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT, glyphGap: 0 });
    expect(frames.length).toBeGreaterThan(1);
  });

  it("vertically centers text that fits", () => {
    const frames = generateMarqueeFrames("HI", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT });
    const bitmap = renderText("HI", PANEL_WIDTH);
    const topPad = Math.floor((PANEL_HEIGHT - bitmap.height) / 2);

    // Every row strictly above topPad should be fully blank.
    for (let row = 0; row < topPad; row++) {
      const rowSlice = frames[0].slice(row * PANEL_WIDTH, (row + 1) * PANEL_WIDTH);
      expect(isAllBlank(rowSlice)).toBe(true);
    }
    // The content itself should appear starting at topPad.
    expect(isAllBlank(frames[0].slice(topPad * PANEL_WIDTH, (topPad + GLYPH_HEIGHT) * PANEL_WIDTH))).toBe(false);
  });

  it("scroll animation starts and ends on a fully blank frame", () => {
    const frames = generateMarqueeFrames("HELLO WORLD", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT });
    expect(frames.length).toBeGreaterThan(1);
    expect(isAllBlank(frames[0])).toBe(true);
    expect(isAllBlank(frames[frames.length - 1])).toBe(true);
  });

  it("every generated frame has the correct length and only 0/255 values", () => {
    const frames = generateMarqueeFrames("HELLO WORLD", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT });
    for (const frame of frames) {
      expect(frame).toHaveLength(PANEL_WIDTH * PANEL_HEIGHT);
      expect(frame.every((v) => v === 0 || v === 255)).toBe(true);
    }
  });

  it("a larger stepRows strictly reduces the frame count for identical text", () => {
    const text = "HELLO WORLD THIS IS A LONGER MESSAGE";
    const slow = generateMarqueeFrames(text, { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT, stepRows: 1 });
    const fast = generateMarqueeFrames(text, { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT, stepRows: 4 });
    expect(fast.length).toBeLessThan(slow.length);
  });

  it("always ends on the exact final scroll offset even when stepRows doesn't evenly divide it", () => {
    const text = "HELLO WORLD";
    const bitmap = renderText(text, PANEL_WIDTH);
    // Per the documented padding (one full panelHeight of blank margin on
    // each side), the final window position is panelHeight + bitmap.height.
    const maxStart = PANEL_HEIGHT + bitmap.height;
    const step = 3;
    // Confirm this step size doesn't evenly divide the distance, so a
    // correct implementation must append one extra tail frame beyond
    // what plain step-looping would produce.
    expect(maxStart % step).not.toBe(0);

    const frames = generateMarqueeFrames(text, { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT, stepRows: step });
    const impliedLoopFrames = Math.floor(maxStart / step) + 1;
    expect(frames.length).toBe(impliedLoopFrames + 1);
  });

  it("text made entirely of unsupported characters is animated like real text, not treated as empty", () => {
    // "#" isn't in the font, but a long run of them should still exceed
    // the fit boundary and produce a multi-frame scroll, proving it went
    // through the real height calculation rather than the empty-string fast path.
    const frames = generateMarqueeFrames("##########", { panelWidth: PANEL_WIDTH, panelHeight: PANEL_HEIGHT });
    expect(frames.length).toBeGreaterThan(1);
  });
});
