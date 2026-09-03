// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  renderClockWidget,
  renderAnalogClockWidget,
  renderBarWidget,
  renderWidgetSlice,
  composeWidgetLayout,
  fitBitmapToHeight,
  type WidgetInstance,
} from "./matrixWidgets";

const WIDTH = 9;

function countLit(pixels: number[]): number {
  return pixels.filter((p) => p > 0).length;
}

describe("fitBitmapToHeight", () => {
  it("centers a shorter bitmap with blank padding", () => {
    const pixels = new Array(WIDTH * 4).fill(1);
    const out = fitBitmapToHeight(pixels, 4, WIDTH, 10);
    expect(out.length).toBe(WIDTH * 10);
    // 3 rows of top padding, then 4 lit rows, then 3 rows of bottom padding.
    expect(out.slice(0, WIDTH * 3).every((p) => p === 0)).toBe(true);
    expect(out.slice(WIDTH * 3, WIDTH * 7).every((p) => p === 1)).toBe(true);
    expect(out.slice(WIDTH * 7).every((p) => p === 0)).toBe(true);
  });

  it("crops a taller bitmap to the first `height` rows", () => {
    const pixels = new Array(WIDTH * 10).fill(1);
    const out = fitBitmapToHeight(pixels, 10, WIDTH, 4);
    expect(out.length).toBe(WIDTH * 4);
    expect(out.every((p) => p === 1)).toBe(true);
  });

  it("leaves an exact-height bitmap unchanged", () => {
    const pixels = Array.from({ length: WIDTH * 5 }, (_, i) => i % 2);
    expect(fitBitmapToHeight(pixels, 5, WIDTH, 5)).toEqual(pixels);
  });
});

describe("renderClockWidget (digital)", () => {
  it("renders nothing when the slice is too short even for minutes", () => {
    const out = renderClockWidget(WIDTH, 5, new Date(2026, 0, 1, 14, 7));
    expect(countLit(out)).toBe(0);
  });

  it("renders only minutes in a compact-but-not-full slice", () => {
    // 15 rows fits "MM" (2 * 7 + 1) but not "HHMM" (4 * 7 + 3 = 31).
    const withMinutes = renderClockWidget(WIDTH, 15, new Date(2026, 0, 1, 14, 7));
    const blank = renderClockWidget(WIDTH, 5, new Date(2026, 0, 1, 14, 7));
    expect(countLit(withMinutes)).toBeGreaterThan(countLit(blank));
  });

  it("renders all four digits once the slice is tall enough", () => {
    const compact = renderClockWidget(WIDTH, 15, new Date(2026, 0, 1, 14, 7));
    const full = renderClockWidget(WIDTH, 31, new Date(2026, 0, 1, 14, 7));
    expect(countLit(full)).toBeGreaterThan(countLit(compact));
    expect(full.length).toBe(WIDTH * 31);
  });

  it("defaults to 24h format (14:07 keeps the 14, not 02)", () => {
    const default24 = renderClockWidget(WIDTH, 31, new Date(2026, 0, 1, 14, 7));
    const explicit24 = renderClockWidget(WIDTH, 31, new Date(2026, 0, 1, 14, 7), "24h");
    expect(default24).toEqual(explicit24);
  });

  it("renders 12h format differently from 24h for an afternoon hour", () => {
    const time = new Date(2026, 0, 1, 14, 7); // 2:07 PM
    const h24 = renderClockWidget(WIDTH, 31, time, "24h");
    const h12 = renderClockWidget(WIDTH, 31, time, "12h");
    expect(h12).not.toEqual(h24);
  });

  it("renders 12 (not 00) for 12h format at midnight", () => {
    const midnight = new Date(2026, 0, 1, 0, 7);
    const noon = new Date(2026, 0, 1, 12, 7);
    // Both should show "12" for the hour in 12h format -> identical bitmaps.
    expect(renderClockWidget(WIDTH, 31, midnight, "12h")).toEqual(renderClockWidget(WIDTH, 31, noon, "12h"));
  });
});

describe("renderAnalogClockWidget", () => {
  it("renders fully blank when the slice is too small to draw a face", () => {
    expect(countLit(renderAnalogClockWidget(WIDTH, 2, new Date()))).toBe(0);
  });

  it("lights the center pixel and a ring of face pixels for a large-enough slice", () => {
    const out = renderAnalogClockWidget(WIDTH, 20, new Date(2026, 0, 1, 3, 0, 0));
    const centerX = Math.floor(WIDTH / 2);
    const centerY = Math.floor((20 - Math.min(WIDTH, 20)) / 2) + Math.floor(Math.min(WIDTH, 20) / 2);
    expect(out[centerY * WIDTH + centerX]).toBeGreaterThan(0);
    expect(countLit(out)).toBeGreaterThan(1);
  });

  it("changes as the minute hand moves, holding the hour fixed", () => {
    const a = renderAnalogClockWidget(WIDTH, 20, new Date(2026, 0, 1, 3, 0, 0));
    const b = renderAnalogClockWidget(WIDTH, 20, new Date(2026, 0, 1, 3, 30, 0));
    expect(a).not.toEqual(b);
  });

  it("routes through renderClockWidget when style is analog", () => {
    const time = new Date(2026, 0, 1, 6, 15);
    expect(renderClockWidget(WIDTH, 20, time, "24h", "analog")).toEqual(renderAnalogClockWidget(WIDTH, 20, time));
  });
});

describe("renderBarWidget", () => {
  it("fills 0% as entirely blank", () => {
    expect(countLit(renderBarWidget(WIDTH, 20, 0, "solid"))).toBe(0);
  });

  it("fills 100% as entirely lit for a solid bar", () => {
    const out = renderBarWidget(WIDTH, 20, 100, "solid");
    expect(countLit(out)).toBe(WIDTH * 20);
  });

  it("fills from the bottom, not the top", () => {
    const out = renderBarWidget(WIDTH, 10, 50, "solid");
    const topHalf = out.slice(0, WIDTH * 5);
    const bottomHalf = out.slice(WIDTH * 5);
    expect(countLit(topHalf)).toBe(0);
    expect(countLit(bottomHalf)).toBe(WIDTH * 5);
  });

  it("clamps out-of-range percentages instead of producing a nonsense fill", () => {
    expect(renderBarWidget(WIDTH, 10, 150, "solid")).toEqual(renderBarWidget(WIDTH, 10, 100, "solid"));
    expect(renderBarWidget(WIDTH, 10, -20, "solid")).toEqual(renderBarWidget(WIDTH, 10, 0, "solid"));
  });

  it("lights roughly half the pixels in a fully-filled hatched bar, unlike solid", () => {
    const solid = renderBarWidget(WIDTH, 20, 100, "solid");
    const hatched = renderBarWidget(WIDTH, 20, 100, "hatched");
    expect(countLit(solid)).toBe(WIDTH * 20);
    expect(countLit(hatched)).toBeLessThan(countLit(solid));
    expect(countLit(hatched)).toBeGreaterThan(0);
  });
});

describe("renderWidgetSlice", () => {
  const data = { now: new Date(2026, 0, 1, 9, 30), batteryPercent: 80, cpuPercent: 40 };

  it("dispatches to the right renderer per widget type", () => {
    expect(renderWidgetSlice({ type: "battery" }, WIDTH, 20, data)).toEqual(renderBarWidget(WIDTH, 20, 80, "solid"));
    expect(renderWidgetSlice({ type: "cpu" }, WIDTH, 20, data)).toEqual(renderBarWidget(WIDTH, 20, 40, "hatched"));
    expect(renderWidgetSlice({ type: "clock" }, WIDTH, 31, data)).toEqual(renderClockWidget(WIDTH, 31, data.now));
  });

  it("passes clockFormat/clockStyle through to the clock renderer", () => {
    const instance: WidgetInstance = { type: "clock", clockFormat: "12h", clockStyle: "analog" };
    expect(renderWidgetSlice(instance, WIDTH, 20, data)).toEqual(renderAnalogClockWidget(WIDTH, 20, data.now));
  });

  it("renders eq as blank — no live audio backend to draw from", () => {
    expect(countLit(renderWidgetSlice({ type: "eq" }, WIDTH, 20, data))).toBe(0);
  });

  it("treats missing battery/cpu data as 0% rather than throwing", () => {
    const missing = { now: data.now, batteryPercent: null, cpuPercent: null };
    expect(countLit(renderWidgetSlice({ type: "battery" }, WIDTH, 20, missing))).toBe(0);
    expect(countLit(renderWidgetSlice({ type: "cpu" }, WIDTH, 20, missing))).toBe(0);
  });
});

describe("composeWidgetLayout", () => {
  const HEIGHT = 34;
  const data = { now: new Date(2026, 0, 1, 9, 30), batteryPercent: 100, cpuPercent: 100 };
  const battery: WidgetInstance = { type: "battery" };

  it("renders fully blank for an empty layout", () => {
    expect(composeWidgetLayout([], WIDTH, HEIGHT, data)).toEqual(new Array(WIDTH * HEIGHT).fill(0));
  });

  it("gives a single widget the entire panel", () => {
    expect(composeWidgetLayout([battery], WIDTH, HEIGHT, data)).toEqual(renderWidgetSlice(battery, WIDTH, HEIGHT, data));
  });

  it("splits the panel evenly (with any remainder on the last slice) across multiple widgets", () => {
    // 34 / 3 = 11 remainder 1 -> slices of 11, 11, 12.
    const out = composeWidgetLayout([battery, battery, battery], WIDTH, HEIGHT, data);
    const expectedTop = renderBarWidget(WIDTH, 11, 100, "solid");
    const expectedMiddle = renderBarWidget(WIDTH, 11, 100, "solid");
    const expectedBottom = renderBarWidget(WIDTH, 12, 100, "solid");
    expect(out.slice(0, WIDTH * 11)).toEqual(expectedTop);
    expect(out.slice(WIDTH * 11, WIDTH * 22)).toEqual(expectedMiddle);
    expect(out.slice(WIDTH * 22)).toEqual(expectedBottom);
  });

  it("produces a buffer of exactly width * height regardless of widget count", () => {
    for (const count of [1, 2, 3, 4]) {
      const widgets: WidgetInstance[] = new Array(count).fill(battery);
      expect(composeWidgetLayout(widgets, WIDTH, HEIGHT, data).length).toBe(WIDTH * HEIGHT);
    }
  });
});
