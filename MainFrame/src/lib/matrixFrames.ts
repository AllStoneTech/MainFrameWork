// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Frame type for Matrix Studio's Editor tab: either a hand-drawn static
 * frame, or a "live widget" frame that renders fresh from current
 * system data every time it's displayed (Clock/Battery/CPU Load — see
 * matrixWidgets.ts for the actual rendering). This is what lets an
 * animation "rotate through" a widget instead of only ever baking in
 * whatever was true the moment it was inserted.
 *
 * Persisted under the same settings key AnimatorTab.tsx also reads/
 * writes (`SETTINGS_KEY`, exported from AnimatorTab.tsx) — `normalizeFrame`
 * upgrades an already-saved plain pixel array (the pre-widget-frame
 * format, still what AnimatorTab.tsx itself writes) into
 * `{kind:"static", pixels}` transparently, so existing saved animations
 * keep loading correctly and round-tripping through AnimatorTab doesn't
 * corrupt anything either.
 */
import { renderWidgetSlice, type WidgetInstance, type WidgetType, type ClockFormat, type ClockStyle, type WidgetLiveData } from "./matrixWidgets";

export type EditorFrame =
  | { kind: "static"; pixels: number[] }
  | { kind: "widget"; widgetType: WidgetType; clockFormat?: ClockFormat; clockStyle?: ClockStyle };

/** A blank static frame of the given panel size. */
export function blankFrame(width: number, height: number): EditorFrame {
  return { kind: "static", pixels: new Array(width * height).fill(0) };
}

/**
 * Upgrades a possibly-legacy persisted frame into the current shape. A
 * bare `number[]` (everything saved before widget frames existed, and
 * still what AnimatorTab.tsx writes) becomes `{kind:"static", pixels}`;
 * anything already shaped like an `EditorFrame` passes through as-is.
 */
export function normalizeFrame(raw: unknown): EditorFrame {
  if (Array.isArray(raw)) return { kind: "static", pixels: raw as number[] };
  return raw as EditorFrame;
}

/**
 * Resolves a frame to its actual pixel buffer for display/upload right
 * now: a static frame's own pixels, unchanged, or a widget frame
 * rendered fresh from `liveData` — the whole point of a widget frame is
 * that this can return a different buffer on every call as `liveData`
 * changes, unlike a static frame which always resolves to the same one.
 */
export function resolveFramePixels(frame: EditorFrame, width: number, height: number, liveData: WidgetLiveData): number[] {
  if (frame.kind === "static") return frame.pixels;
  const instance: WidgetInstance = { type: frame.widgetType, clockFormat: frame.clockFormat, clockStyle: frame.clockStyle };
  return renderWidgetSlice(instance, width, height, liveData);
}
