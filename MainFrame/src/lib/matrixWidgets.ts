// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Renders Matrix Studio's Widgets tab layout into an LED Matrix pixel
 * buffer — the piece the tab itself was missing (see its doc comment):
 * turning a widget stack into actual brightness values for `update_matrix`,
 * rather than just composing a list.
 *
 * The panel is 9 columns wide and 34 rows tall — a narrow vertical strip,
 * not a wide screen — so widgets stack top-to-bottom, each getting an
 * even slice of the available rows (the last slice absorbs any
 * remainder), and each widget's own renderer only has to fill its own
 * `width x sliceHeight` rectangle.
 *
 * Audio EQ has no renderer here on purpose: it would need live system
 * audio levels (loopback capture, or similar), which this app has no
 * backend for yet — faking an animation with no real audio behind it
 * would be actively misleading on a "live data" widget, so
 * `renderWidgetSlice` returns a blank slice for it rather than a fake
 * one. WidgetsTab.tsx disables adding it from the palette for the same
 * reason.
 */
import { renderText, GLYPH_HEIGHT } from "./bitmapFont";

export type WidgetType = "clock" | "battery" | "cpu" | "eq";
export type ClockFormat = "24h" | "12h";
export type ClockStyle = "digital" | "analog";

/** One widget in the active layout — `clockFormat`/`clockStyle` are only
 * meaningful when `type === "clock"`, and default to 24h/digital when
 * omitted (matching this widget's original behavior). */
export interface WidgetInstance {
  type: WidgetType;
  clockFormat?: ClockFormat;
  clockStyle?: ClockStyle;
}

export interface WidgetLiveData {
  now: Date;
  /** 0-100, or null if not yet loaded/unavailable. */
  batteryPercent: number | null;
  /** 0-100, or null if not yet loaded/unavailable. */
  cpuPercent: number | null;
}

/** Rows needed to show "HHMM" (no colon — see this function's doc comment). */
const CLOCK_FULL_HEIGHT = 4 * GLYPH_HEIGHT + 3; // 4 chars, 3 one-row gaps
/** Rows needed to show just "MM". */
const CLOCK_COMPACT_HEIGHT = 2 * GLYPH_HEIGHT + 1;

/**
 * Renders the current time into a `width x height` slice, digital or
 * analog per `style`. Digital skips the colon (":") — bitmapFont.ts
 * stacks characters *vertically*, one glyph per ~8 rows, so a colon
 * would cost as much vertical space as a digit for no added legibility
 * here. Degrades by dropping the hour first (to "MM" alone) rather than
 * cropping arbitrarily when the slice is too short for all four digits,
 * and shows nothing (rather than an unreadable partial glyph) if it's
 * too short even for that.
 */
export function renderClockWidget(
  width: number,
  height: number,
  now: Date,
  format: ClockFormat = "24h",
  style: ClockStyle = "digital"
): number[] {
  if (style === "analog") return renderAnalogClockWidget(width, height, now);

  let hours = now.getHours();
  if (format === "12h") {
    hours = hours % 12;
    if (hours === 0) hours = 12;
  }
  const hh = String(hours).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const text = height >= CLOCK_FULL_HEIGHT ? hh + mm : height >= CLOCK_COMPACT_HEIGHT ? mm : "";
  const bitmap = renderText(text, width);
  return fitBitmapToHeight(bitmap.pixels, bitmap.height, width, height);
}

/**
 * A small analog clock face: a circular outline (as circular as a 1-bit
 * grid this narrow can manage) plus hour/minute hands, radius capped by
 * whichever of `width`/`height` is smaller (typically `width` = 9, since
 * a slice is almost always taller than it is wide) and centered in the
 * slice. Renders fully blank if the slice is too small (under 3px across)
 * for anything recognizable rather than drawing a meaningless dot.
 */
export function renderAnalogClockWidget(width: number, height: number, now: Date): number[] {
  const buffer = new Array(width * height).fill(0);
  const diameter = Math.min(width, height);
  if (diameter < 3) return buffer;

  const radius = Math.floor(diameter / 2);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor((height - diameter) / 2) + radius;

  // Face outline: light pixels whose distance from center lands within
  // half a pixel of the radius — the closest a low-res grid gets to a
  // thin ring rather than a filled disc.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (Math.abs(Math.sqrt(dx * dx + dy * dy) - radius) < 0.75) {
        buffer[y * width + x] = 180;
      }
    }
  }

  // Angle 0 points straight up (12 o'clock), increasing clockwise —
  // matches a real clock face rather than standard screen-space math
  // convention, hence the `- Math.PI / 2` offset below.
  const hourFraction = (now.getHours() % 12) / 12 + now.getMinutes() / 60 / 12;
  const minuteFraction = now.getMinutes() / 60 + now.getSeconds() / 60 / 60;
  const hourAngle = hourFraction * 2 * Math.PI - Math.PI / 2;
  const minuteAngle = minuteFraction * 2 * Math.PI - Math.PI / 2;
  const hourLength = radius * 0.5;
  const minuteLength = radius * 0.85;

  drawLine(
    buffer,
    width,
    height,
    centerX,
    centerY,
    Math.round(centerX + hourLength * Math.cos(hourAngle)),
    Math.round(centerY + hourLength * Math.sin(hourAngle))
  );
  drawLine(
    buffer,
    width,
    height,
    centerX,
    centerY,
    Math.round(centerX + minuteLength * Math.cos(minuteAngle)),
    Math.round(centerY + minuteLength * Math.sin(minuteAngle))
  );
  buffer[centerY * width + centerX] = 255;

  return buffer;
}

/** Bresenham line, clipped to the buffer's bounds (a hand's endpoint can
 * round to just outside the face circle at small radii). */
function drawLine(buffer: number[], width: number, height: number, x0: number, y0: number, x1: number, y1: number): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    if (x >= 0 && x < width && y >= 0 && y < height) buffer[y * width + x] = 255;
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Fits a rendered bitmap into an exactly `height`-tall slice: centers it
 * vertically with blank padding if it's shorter, or crops to the first
 * `height` rows (keeping the top) if it's taller.
 */
export function fitBitmapToHeight(pixels: number[], bitmapHeight: number, width: number, height: number): number[] {
  const out = new Array(width * height).fill(0);
  if (bitmapHeight <= height) {
    const topPad = Math.floor((height - bitmapHeight) / 2);
    for (let row = 0; row < bitmapHeight; row++) {
      for (let col = 0; col < width; col++) {
        out[(topPad + row) * width + col] = pixels[row * width + col];
      }
    }
  } else {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        out[row * width + col] = pixels[row * width + col];
      }
    }
  }
  return out;
}

/**
 * A vertical fill bar (like a thermometer), filling from the bottom —
 * shared rendering for Battery and CPU, differentiated by `pattern` so
 * they're still visually distinct from each other on this single-channel
 * (brightness-only) display: `"solid"` lights every pixel in the filled
 * region, `"hatched"` lights every other one in a checkerboard.
 */
export function renderBarWidget(width: number, height: number, percent: number, pattern: "solid" | "hatched"): number[] {
  const buffer = new Array(width * height).fill(0);
  const clamped = Math.max(0, Math.min(100, percent));
  const filledRows = Math.round(height * (clamped / 100));
  for (let row = height - filledRows; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (pattern === "hatched" && (row + col) % 2 === 1) continue;
      buffer[row * width + col] = 255;
    }
  }
  return buffer;
}

/**
 * Renders one widget instance into its allocated `width x height` slice.
 * Falls back to a blank buffer (logged, not thrown) for a `widget.type`
 * this switch doesn't recognize, rather than returning `undefined` —
 * TypeScript's exhaustiveness checking only guarantees every *known*
 * `WidgetType` is handled, not that a value reaching this function at
 * runtime actually is one. That gap was a real bug, not a hypothetical
 * one: a stale pre-widget-frame saved arrangement fed this a plain
 * pixel array with no `type` field at all, this returned `undefined`,
 * and PixelGrid crashed calling `.map()` on it — see EditorTab.tsx's
 * `handleScheduleFire` doc comment for the fix at the actual source,
 * this is the belt-and-suspenders backstop for whatever the next
 * unanticipated path turns out to be.
 */
export function renderWidgetSlice(widget: WidgetInstance, width: number, height: number, data: WidgetLiveData): number[] {
  switch (widget.type) {
    case "clock":
      return renderClockWidget(width, height, data.now, widget.clockFormat ?? "24h", widget.clockStyle ?? "digital");
    case "battery":
      return renderBarWidget(width, height, data.batteryPercent ?? 0, "solid");
    case "cpu":
      return renderBarWidget(width, height, data.cpuPercent ?? 0, "hatched");
    case "eq":
      // No live audio backend — see this module's doc comment.
      return new Array(width * height).fill(0);
    default:
      console.error("renderWidgetSlice: unrecognized widget type, rendering blank instead of crashing:", widget);
      return new Array(width * height).fill(0);
  }
}

/**
 * Composes the full `width x height` buffer from the active widget
 * stack: divides the rows evenly among widgets (top to bottom, in
 * layout order), any remainder rows going to the last widget, and
 * stitches each one's own rendered slice into place. An empty layout
 * renders as fully blank.
 */
export function composeWidgetLayout(widgets: WidgetInstance[], width: number, height: number, data: WidgetLiveData): number[] {
  const buffer = new Array(width * height).fill(0);
  if (widgets.length === 0) return buffer;

  const baseHeight = Math.floor(height / widgets.length);
  let remainder = height - baseHeight * widgets.length;
  let rowOffset = 0;

  for (const widget of widgets) {
    const sliceHeight = baseHeight + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;

    const slice = renderWidgetSlice(widget, width, sliceHeight, data);
    for (let row = 0; row < sliceHeight; row++) {
      for (let col = 0; col < width; col++) {
        buffer[(rowOffset + row) * width + col] = slice[row * width + col];
      }
    }
    rowOffset += sliceHeight;
  }

  return buffer;
}
