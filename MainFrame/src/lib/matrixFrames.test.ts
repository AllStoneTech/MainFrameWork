// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { blankFrame, normalizeFrame, resolveFramePixels, type EditorFrame } from "./matrixFrames";
import { renderWidgetSlice } from "./matrixWidgets";

const WIDTH = 9;
const HEIGHT = 34;
const liveData = { now: new Date(2026, 0, 1, 9, 30), batteryPercent: 80, cpuPercent: 40 };

describe("blankFrame", () => {
  it("produces an all-zero static frame of the right size", () => {
    const frame = blankFrame(WIDTH, HEIGHT);
    expect(frame).toEqual({ kind: "static", pixels: new Array(WIDTH * HEIGHT).fill(0) });
  });
});

describe("normalizeFrame", () => {
  it("wraps a legacy bare pixel array as a static frame", () => {
    const legacy = [1, 0, 1, 0];
    expect(normalizeFrame(legacy)).toEqual({ kind: "static", pixels: legacy });
  });

  it("passes an already-normalized static frame through unchanged", () => {
    const frame: EditorFrame = { kind: "static", pixels: [1, 2, 3] };
    expect(normalizeFrame(frame)).toEqual(frame);
  });

  it("passes an already-normalized widget frame through unchanged", () => {
    const frame: EditorFrame = { kind: "widget", widgetType: "clock", clockFormat: "12h" };
    expect(normalizeFrame(frame)).toEqual(frame);
  });
});

describe("resolveFramePixels", () => {
  it("returns a static frame's own pixels unchanged", () => {
    const pixels = [1, 2, 3, 4];
    const frame: EditorFrame = { kind: "static", pixels };
    expect(resolveFramePixels(frame, WIDTH, HEIGHT, liveData)).toBe(pixels);
  });

  it("renders a widget frame the same way matrixWidgets.ts's renderWidgetSlice would", () => {
    const frame: EditorFrame = { kind: "widget", widgetType: "battery" };
    expect(resolveFramePixels(frame, WIDTH, HEIGHT, liveData)).toEqual(
      renderWidgetSlice({ type: "battery" }, WIDTH, HEIGHT, liveData)
    );
  });

  it("passes clockFormat/clockStyle through for a clock widget frame", () => {
    const frame: EditorFrame = { kind: "widget", widgetType: "clock", clockFormat: "12h", clockStyle: "analog" };
    expect(resolveFramePixels(frame, WIDTH, HEIGHT, liveData)).toEqual(
      renderWidgetSlice({ type: "clock", clockFormat: "12h", clockStyle: "analog" }, WIDTH, HEIGHT, liveData)
    );
  });

  it("re-renders a widget frame differently as liveData changes, unlike a static frame", () => {
    const frame: EditorFrame = { kind: "widget", widgetType: "cpu" };
    const atLow = resolveFramePixels(frame, WIDTH, HEIGHT, { ...liveData, cpuPercent: 10 });
    const atHigh = resolveFramePixels(frame, WIDTH, HEIGHT, { ...liveData, cpuPercent: 90 });
    expect(atLow).not.toEqual(atHigh);
  });
});
