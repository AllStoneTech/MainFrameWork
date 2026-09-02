// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Encodes/decodes VIA macro steps to/from the raw byte format QMK's
 * dynamic-keymap macro buffer actually stores, and splits/joins that
 * buffer's multiple macro slots (VIA has no per-macro offset table —
 * every slot's bytes are just concatenated, each one delimited by a
 * single `0x00`).
 *
 * The escape-sequence byte values (`SS_QMK_PREFIX`/`SS_TAP_CODE`/
 * `SS_DOWN_CODE`/`SS_UP_CODE`/`SS_DELAY_CODE`) are confirmed against
 * `quantum/send_string/send_string_keycodes.h` in qmk/qmk_firmware @
 * master (fetched 2026-09-01):
 * `SS_TAP(kc)` -> `"\1\1" + kc`, `SS_DOWN(kc)` -> `"\1\2" + kc`,
 * `SS_UP(kc)` -> `"\1\3" + kc`, `SS_DELAY(ms)` -> `"\1\4" + digits + "|"`.
 * A byte that isn't part of one of those three-or-more-byte sequences is
 * a literal ASCII character to type (the firmware's own
 * `send_string_part` handles turning that into the right keydown, incl.
 * shift for uppercase/symbols, without this app needing its own
 * per-character keycode table for typed text).
 *
 * The keycode inside a Tap/Down/Up sequence is a single byte (<256) —
 * this only works because the basic USB HID keycode range (letters,
 * digits, common punctuation — see qmkKeycodes.ts's `BASIC_KEYCODES`)
 * fits in one byte and was left untouched by QMK's keycode refactor
 * specifically so Send String kept working; it can't address anything
 * in the wider 0x0100+ quantum-keycode space (modifiers-as-a-combo,
 * layer keys, macros-within-macros, etc.) — fine for what a macro step
 * needs (tap/hold a real key), not a general keycode encoding.
 */

export type MacroStep =
  | { type: "tap"; keycode: number }
  | { type: "down"; keycode: number }
  | { type: "up"; keycode: number }
  | { type: "delay"; ms: number }
  | { type: "text"; text: string };

const SS_QMK_PREFIX = 0x01;
const SS_TAP_CODE = 0x01;
const SS_DOWN_CODE = 0x02;
const SS_UP_CODE = 0x03;
const SS_DELAY_CODE = 0x04;
const DELAY_TERMINATOR = 0x7c; // '|'
const MACRO_SLOT_DELIMITER = 0x00;

/** Encodes a step sequence into the raw bytes for one macro slot (not
 * including the trailing `0x00` slot delimiter — see {@link joinMacroBuffer}). */
export function encodeMacroSteps(steps: MacroStep[]): number[] {
  const bytes: number[] = [];
  for (const step of steps) {
    switch (step.type) {
      case "tap":
        bytes.push(SS_QMK_PREFIX, SS_TAP_CODE, step.keycode & 0xff);
        break;
      case "down":
        bytes.push(SS_QMK_PREFIX, SS_DOWN_CODE, step.keycode & 0xff);
        break;
      case "up":
        bytes.push(SS_QMK_PREFIX, SS_UP_CODE, step.keycode & 0xff);
        break;
      case "delay": {
        bytes.push(SS_QMK_PREFIX, SS_DELAY_CODE);
        const ms = Math.max(1, Math.round(step.ms));
        for (const digit of String(ms)) bytes.push(digit.charCodeAt(0));
        bytes.push(DELAY_TERMINATOR);
        break;
      }
      case "text":
        for (const ch of step.text) {
          const code = ch.charCodeAt(0);
          // Only plain ASCII round-trips through the firmware's own
          // ASCII-to-keycode table; anything else is silently dropped
          // rather than sent as a byte the firmware would misinterpret.
          if (code >= 0x20 && code < 0x7f) bytes.push(code);
        }
        break;
    }
  }
  return bytes;
}

/** Decodes one macro slot's raw bytes back into steps — best-effort:
 * consecutive literal bytes collapse into a single `text` step so
 * re-editing something typed as a string doesn't show as one step per
 * character. An escape sequence that's cut off (e.g. a trailing lone
 * `0x01`) is treated as a literal byte rather than thrown away. */
export function decodeMacroBytes(bytes: number[]): MacroStep[] {
  const steps: MacroStep[] = [];
  let text = "";
  const flushText = (): void => {
    if (text) {
      steps.push({ type: "text", text });
      text = "";
    }
  };

  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === SS_QMK_PREFIX && i + 1 < bytes.length) {
      const op = bytes[i + 1];
      if ((op === SS_TAP_CODE || op === SS_DOWN_CODE || op === SS_UP_CODE) && i + 2 < bytes.length) {
        flushText();
        const keycode = bytes[i + 2];
        steps.push({ type: op === SS_TAP_CODE ? "tap" : op === SS_DOWN_CODE ? "down" : "up", keycode });
        i += 3;
        continue;
      }
      if (op === SS_DELAY_CODE) {
        flushText();
        let j = i + 2;
        let digits = "";
        while (j < bytes.length && bytes[j] !== DELAY_TERMINATOR) {
          digits += String.fromCharCode(bytes[j]);
          j += 1;
        }
        steps.push({ type: "delay", ms: parseInt(digits, 10) || 0 });
        i = j + 1; // Skip the '|' terminator too.
        continue;
      }
    }
    if (b >= 0x20 && b < 0x7f) text += String.fromCharCode(b);
    i += 1;
  }
  flushText();
  return steps;
}

/** Splits the full macro buffer into per-slot byte arrays, delimited by
 * `0x00` (VIA's own format — see this module's doc comment). A trailing
 * slot with no delimiter after it (the buffer's unused tail, still all
 * zero) doesn't produce a spurious empty final entry. */
export function splitMacroBuffer(buffer: number[]): number[][] {
  const macros: number[][] = [];
  let current: number[] = [];
  for (const b of buffer) {
    if (b === MACRO_SLOT_DELIMITER) {
      macros.push(current);
      current = [];
    } else {
      current.push(b);
    }
  }
  if (current.length > 0) macros.push(current);
  return macros;
}

/** Inverse of {@link splitMacroBuffer} — each slot, including empty
 * ones, gets its own trailing `0x00` delimiter so a subsequent read
 * parses back into the same number of slots. */
export function joinMacroBuffer(macros: number[][]): number[] {
  const buffer: number[] = [];
  for (const macro of macros) buffer.push(...macro, MACRO_SLOT_DELIMITER);
  return buffer;
}

/** Pads (or truncates) a split-buffer result to exactly `count` slots —
 * an empty/fresh macro buffer 0x00-splits to zero segments, but the
 * keyboard still reports `count` available slots via `get_macro_count`,
 * and callers (the Macros tab's slot list) need one entry per slot
 * regardless of whether it's been used yet. */
export function ensureSlotCount(macros: number[][], count: number): number[][] {
  const result = macros.slice(0, count);
  while (result.length < count) result.push([]);
  return result;
}
