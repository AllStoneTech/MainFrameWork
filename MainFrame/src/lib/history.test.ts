// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { historyCommit, historyRedo, historyUndo, initHistory, type HistoryState } from "./history";

describe("historyCommit", () => {
  it("pushes the current present onto past and applies the new value", () => {
    const state = initHistory(1);
    const next = historyCommit(state, 2);
    expect(next).toEqual({ past: [1], present: 2, future: [] });
  });

  it("clears future — a new commit invalidates any redo branch", () => {
    const state: HistoryState<number> = { past: [1], present: 2, future: [3] };
    const next = historyCommit(state, 4);
    expect(next.future).toEqual([]);
  });

  it("caps past at maxHistory, dropping the oldest entries", () => {
    const state: HistoryState<number> = { past: [1, 2, 3], present: 4, future: [] };
    const next = historyCommit(state, 5, 3);
    expect(next.past).toEqual([2, 3, 4]);
  });
});

describe("historyUndo", () => {
  it("moves the last past entry into present and present into future", () => {
    const state: HistoryState<number> = { past: [1, 2], present: 3, future: [] };
    const next = historyUndo(state);
    expect(next).toEqual({ past: [1], present: 2, future: [3] });
  });

  it("is a no-op (same reference) when there's nothing to undo", () => {
    const state = initHistory(1);
    expect(historyUndo(state)).toBe(state);
  });
});

describe("historyRedo", () => {
  it("moves the first future entry into present and present into past", () => {
    const state: HistoryState<number> = { past: [1], present: 2, future: [3, 4] };
    const next = historyRedo(state);
    expect(next).toEqual({ past: [1, 2], present: 3, future: [4] });
  });

  it("is a no-op (same reference) when there's nothing to redo", () => {
    const state = initHistory(1);
    expect(historyRedo(state)).toBe(state);
  });
});

describe("undo/redo round-trip", () => {
  it("redo after undo restores the exact prior state", () => {
    const committed = historyCommit(initHistory(1), 2);
    const undone = historyUndo(committed);
    const redone = historyRedo(undone);
    expect(redone).toEqual(committed);
  });

  it("undo after redo restores the prior state again", () => {
    const state: HistoryState<number> = { past: [1], present: 2, future: [3] };
    const redone = historyRedo(state);
    const undoneAgain = historyUndo(redone);
    expect(undoneAgain).toEqual(state);
  });
});
