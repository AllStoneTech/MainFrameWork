// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  encodeMacroSteps,
  decodeMacroBytes,
  splitMacroBuffer,
  joinMacroBuffer,
  ensureSlotCount,
  type MacroStep,
} from "./macroEncoding";

describe("encodeMacroSteps", () => {
  it("encodes a tap as prefix + tap-code + keycode", () => {
    expect(encodeMacroSteps([{ type: "tap", keycode: 0x04 }])).toEqual([0x01, 0x01, 0x04]);
  });

  it("encodes down/up with their own op codes", () => {
    expect(encodeMacroSteps([{ type: "down", keycode: 0xe1 }])).toEqual([0x01, 0x02, 0xe1]);
    expect(encodeMacroSteps([{ type: "up", keycode: 0xe1 }])).toEqual([0x01, 0x03, 0xe1]);
  });

  it("encodes a delay as ASCII digits terminated by '|'", () => {
    expect(encodeMacroSteps([{ type: "delay", ms: 250 }])).toEqual([
      0x01, 0x04, "2".charCodeAt(0), "5".charCodeAt(0), "0".charCodeAt(0), 0x7c,
    ]);
  });

  it("floors a delay below 1ms up to 1ms rather than emitting no digits", () => {
    expect(encodeMacroSteps([{ type: "delay", ms: 0 }])).toEqual([0x01, 0x04, "1".charCodeAt(0), 0x7c]);
  });

  it("encodes text as literal ASCII bytes with no escape prefix", () => {
    expect(encodeMacroSteps([{ type: "text", text: "hi" }])).toEqual(["h".charCodeAt(0), "i".charCodeAt(0)]);
  });

  it("drops non-ASCII characters from text rather than emitting bad bytes", () => {
    expect(encodeMacroSteps([{ type: "text", text: "aéb" }])).toEqual(["a".charCodeAt(0), "b".charCodeAt(0)]);
  });

  it("concatenates multiple steps in order", () => {
    const steps: MacroStep[] = [
      { type: "down", keycode: 0xe1 },
      { type: "tap", keycode: 0x04 },
      { type: "up", keycode: 0xe1 },
    ];
    expect(encodeMacroSteps(steps)).toEqual([0x01, 0x02, 0xe1, 0x01, 0x01, 0x04, 0x01, 0x03, 0xe1]);
  });
});

describe("decodeMacroBytes", () => {
  it("round-trips tap/down/up/delay/text through encode then decode", () => {
    const steps: MacroStep[] = [
      { type: "down", keycode: 0xe1 },
      { type: "tap", keycode: 0x04 },
      { type: "up", keycode: 0xe1 },
      { type: "delay", ms: 100 },
      { type: "text", text: "hello" },
    ];
    expect(decodeMacroBytes(encodeMacroSteps(steps))).toEqual(steps);
  });

  it("collapses consecutive literal characters into one text step", () => {
    const bytes = encodeMacroSteps([{ type: "text", text: "abc" }]);
    expect(decodeMacroBytes(bytes)).toEqual([{ type: "text", text: "abc" }]);
  });

  it("splits text around an escape sequence into separate steps", () => {
    const bytes = [
      ...encodeMacroSteps([{ type: "text", text: "ab" }]),
      ...encodeMacroSteps([{ type: "tap", keycode: 0x28 }]),
      ...encodeMacroSteps([{ type: "text", text: "cd" }]),
    ];
    expect(decodeMacroBytes(bytes)).toEqual([
      { type: "text", text: "ab" },
      { type: "tap", keycode: 0x28 },
      { type: "text", text: "cd" },
    ]);
  });

  it("treats a truncated escape sequence at the end as literal bytes", () => {
    // 0x01 with nothing meaningful after it shouldn't crash or vanish.
    expect(decodeMacroBytes([0x01])).toEqual([]);
    expect(decodeMacroBytes(["a".charCodeAt(0), 0x01])).toEqual([{ type: "text", text: "a" }]);
  });

  it("returns an empty step list for an empty macro", () => {
    expect(decodeMacroBytes([])).toEqual([]);
  });
});

describe("splitMacroBuffer / joinMacroBuffer", () => {
  it("splits a buffer with several 0x00-delimited macros", () => {
    const buffer = [0x04, 0x05, 0x00, 0x06, 0x00];
    expect(splitMacroBuffer(buffer)).toEqual([[0x04, 0x05], [0x06]]);
  });

  it("treats the buffer's unused zero-padded tail as more (empty) delimited slots", () => {
    // Every 0x00 is a delimiter, full stop — trailing padding naturally
    // reads as a run of empty slots. Truncating to the keyboard's real
    // reported slot count is ensureSlotCount's job, not this function's.
    const buffer = [0x04, 0x00, 0, 0, 0, 0];
    expect(splitMacroBuffer(buffer)).toEqual([[0x04], [], [], [], []]);
  });

  it("round-trips split then join back to the same delimited buffer", () => {
    const macros = [[0x04, 0x05], [0x06], []];
    const buffer = joinMacroBuffer(macros);
    expect(buffer).toEqual([0x04, 0x05, 0x00, 0x06, 0x00, 0x00]);
    expect(splitMacroBuffer(buffer)).toEqual(macros);
  });
});

describe("ensureSlotCount", () => {
  it("pads with empty slots up to count", () => {
    expect(ensureSlotCount([[0x04]], 3)).toEqual([[0x04], [], []]);
  });

  it("truncates extra slots beyond count", () => {
    expect(ensureSlotCount([[0x04], [0x05], [0x06]], 2)).toEqual([[0x04], [0x05]]);
  });

  it("leaves an exact-count list unchanged", () => {
    expect(ensureSlotCount([[0x04], [0x05]], 2)).toEqual([[0x04], [0x05]]);
  });
});
