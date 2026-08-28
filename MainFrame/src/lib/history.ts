// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Generic undo/redo history, shared by Matrix Studio's Canvas (pixel
 * buffer) and Animator (frame array) tabs. The transition functions are
 * pure and unit-tested; useHistory is a thin React wrapper, and
 * useUndoRedoShortcuts wires Ctrl/Cmd+Z (and Shift+Z / Ctrl+Y for redo)
 * to a given undo/redo pair.
 */
import { useCallback, useEffect, useState } from "react";

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

function resolve<T>(updater: T | ((prev: T) => T), prev: T): T {
  return typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
}

/** Starting history with no undo/redo steps yet. */
export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

/**
 * Records the current `present` as one undo step, applies `next`, and
 * clears `future` — a fresh commit invalidates any redo branch, matching
 * standard editor undo semantics.
 */
export function historyCommit<T>(state: HistoryState<T>, next: T, maxHistory = 50): HistoryState<T> {
  return { past: [...state.past, state.present].slice(-maxHistory), present: next, future: [] };
}

/** Moves one step back; a no-op (same reference) when there's nothing to undo. */
export function historyUndo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
}

/** Moves one step forward; a no-op (same reference) when there's nothing to redo. */
export function historyRedo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
}

export interface HistoryApi<T> {
  present: T;
  /** Applies `updater` as a new undo step. */
  commit: (updater: T | ((prev: T) => T)) => void;
  /** Applies `updater` without recording a new step — merges into the step already committed at gesture start (e.g. mid-drag brush strokes). */
  applySilent: (updater: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replaces `present` and clears all history — for initial hydration (e.g. loading saved frames), not user edits. */
  reset: (value: T) => void;
}

export function useHistory<T>(initial: T, maxHistory = 50): HistoryApi<T> {
  const [state, setState] = useState<HistoryState<T>>(() => initHistory(initial));

  const commit = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setState((s) => historyCommit(s, resolve(updater, s.present), maxHistory));
    },
    [maxHistory]
  );

  const applySilent = useCallback((updater: T | ((prev: T) => T)) => {
    setState((s) => ({ ...s, present: resolve(updater, s.present) }));
  }, []);

  const undo = useCallback(() => setState(historyUndo), []);
  const redo = useCallback(() => setState(historyRedo), []);
  const reset = useCallback((value: T) => setState(initHistory(value)), []);

  return {
    present: state.present,
    commit,
    applySilent,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
  };
}

/**
 * Ctrl/Cmd+Z to undo, Shift+Ctrl/Cmd+Z or Ctrl+Y to redo. Ignored while
 * focus is in an input/textarea so it doesn't fight native text-field
 * undo (the Marquee and Stamp-text fields both need their own undo to
 * keep working normally).
 */
export function useUndoRedoShortcuts(undo: () => void, redo: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
}
