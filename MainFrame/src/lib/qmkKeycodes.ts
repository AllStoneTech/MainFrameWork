// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A curated subset of QMK's keycode table, for the Keymap editor's key
 * assignment picker and for encoding Tap/Down/Up macro steps.
 *
 * Values are the modern (post-refactor) QMK keycode numbering — confirmed
 * against `quantum/keycodes.h` in qmk/qmk_firmware @ master (fetched
 * 2026-09-01; that file itself defines `QMK_KEYCODES_VERSION "0.0.9"` and
 * uses the wide 0x5200+/0x7700+ quantum-feature ranges, which is the
 * modern scheme, not the legacy 0x00-0xFF-only one some older VIA
 * documentation still describes). Framework's own keyboard firmware
 * (FrameworkComputer/qmk_firmware, branch `fl16-2026-remap-keys`,
 * `keyboards/framework/ansi/keymaps/default/keymap.c`) is a recent QMK
 * fork and its default keymap uses these same modern `KC_*` names, so
 * this should match — but that firmware branch may not be what's
 * actually flashed on a given keyboard yet (see KeymapTab.tsx's doc
 * comment for what that means in practice).
 *
 * This is deliberately a curated subset (the keys Framework's own
 * default keymap actually uses), not an exhaustive dump of QMK's several
 * hundred keycodes — see BASIC_KEYCODES' own comment for why going wider
 * isn't free here.
 */

export interface KeycodeDef {
  /** QMK's own name, e.g. "KC_A" — shown in tooltips/labels. */
  name: string;
  /** Short label for the key-assignment picker button. */
  label: string;
  code: number;
}

// Letters, digits, and punctuation below KC_CAPS_LOCK are exactly the USB
// HID keyboard usage IDs, unchanged by QMK's keycode refactor (that's
// *why* the refactor could leave this range alone: Send String macro
// steps rely on it too — see macroEncoding.ts).
export const BASIC_KEYCODES: KeycodeDef[] = [
  { name: "KC_A", label: "A", code: 0x04 },
  { name: "KC_B", label: "B", code: 0x05 },
  { name: "KC_C", label: "C", code: 0x06 },
  { name: "KC_D", label: "D", code: 0x07 },
  { name: "KC_E", label: "E", code: 0x08 },
  { name: "KC_F", label: "F", code: 0x09 },
  { name: "KC_G", label: "G", code: 0x0a },
  { name: "KC_H", label: "H", code: 0x0b },
  { name: "KC_I", label: "I", code: 0x0c },
  { name: "KC_J", label: "J", code: 0x0d },
  { name: "KC_K", label: "K", code: 0x0e },
  { name: "KC_L", label: "L", code: 0x0f },
  { name: "KC_M", label: "M", code: 0x10 },
  { name: "KC_N", label: "N", code: 0x11 },
  { name: "KC_O", label: "O", code: 0x12 },
  { name: "KC_P", label: "P", code: 0x13 },
  { name: "KC_Q", label: "Q", code: 0x14 },
  { name: "KC_R", label: "R", code: 0x15 },
  { name: "KC_S", label: "S", code: 0x16 },
  { name: "KC_T", label: "T", code: 0x17 },
  { name: "KC_U", label: "U", code: 0x18 },
  { name: "KC_V", label: "V", code: 0x19 },
  { name: "KC_W", label: "W", code: 0x1a },
  { name: "KC_X", label: "X", code: 0x1b },
  { name: "KC_Y", label: "Y", code: 0x1c },
  { name: "KC_Z", label: "Z", code: 0x1d },
  { name: "KC_1", label: "1", code: 0x1e },
  { name: "KC_2", label: "2", code: 0x1f },
  { name: "KC_3", label: "3", code: 0x20 },
  { name: "KC_4", label: "4", code: 0x21 },
  { name: "KC_5", label: "5", code: 0x22 },
  { name: "KC_6", label: "6", code: 0x23 },
  { name: "KC_7", label: "7", code: 0x24 },
  { name: "KC_8", label: "8", code: 0x25 },
  { name: "KC_9", label: "9", code: 0x26 },
  { name: "KC_0", label: "0", code: 0x27 },
  { name: "KC_ENTER", label: "Enter", code: 0x28 },
  { name: "KC_ESCAPE", label: "Esc", code: 0x29 },
  { name: "KC_BACKSPACE", label: "Backspace", code: 0x2a },
  { name: "KC_TAB", label: "Tab", code: 0x2b },
  { name: "KC_SPACE", label: "Space", code: 0x2c },
  { name: "KC_MINUS", label: "-", code: 0x2d },
  { name: "KC_EQUAL", label: "=", code: 0x2e },
  { name: "KC_LEFT_BRACKET", label: "[", code: 0x2f },
  { name: "KC_RIGHT_BRACKET", label: "]", code: 0x30 },
  { name: "KC_BACKSLASH", label: "\\", code: 0x31 },
  { name: "KC_SEMICOLON", label: ";", code: 0x33 },
  { name: "KC_QUOTE", label: "'", code: 0x34 },
  { name: "KC_GRAVE", label: "`", code: 0x35 },
  { name: "KC_COMMA", label: ",", code: 0x36 },
  { name: "KC_DOT", label: ".", code: 0x37 },
  { name: "KC_SLASH", label: "/", code: 0x38 },
  { name: "KC_CAPS_LOCK", label: "Caps Lock", code: 0x39 },
  { name: "KC_F1", label: "F1", code: 0x3a },
  { name: "KC_F2", label: "F2", code: 0x3b },
  { name: "KC_F3", label: "F3", code: 0x3c },
  { name: "KC_F4", label: "F4", code: 0x3d },
  { name: "KC_F5", label: "F5", code: 0x3e },
  { name: "KC_F6", label: "F6", code: 0x3f },
  { name: "KC_F7", label: "F7", code: 0x40 },
  { name: "KC_F8", label: "F8", code: 0x41 },
  { name: "KC_F9", label: "F9", code: 0x42 },
  { name: "KC_F10", label: "F10", code: 0x43 },
  { name: "KC_F11", label: "F11", code: 0x44 },
  { name: "KC_F12", label: "F12", code: 0x45 },
  { name: "KC_PRINT_SCREEN", label: "Print Screen", code: 0x46 },
  { name: "KC_SCROLL_LOCK", label: "Scroll Lock", code: 0x47 },
  { name: "KC_PAUSE", label: "Pause", code: 0x48 },
  { name: "KC_INSERT", label: "Insert", code: 0x49 },
  { name: "KC_HOME", label: "Home", code: 0x4a },
  { name: "KC_PAGE_UP", label: "Page Up", code: 0x4b },
  { name: "KC_DELETE", label: "Delete", code: 0x4c },
  { name: "KC_END", label: "End", code: 0x4d },
  { name: "KC_PAGE_DOWN", label: "Page Down", code: 0x4e },
  { name: "KC_RIGHT", label: "Right Arrow", code: 0x4f },
  { name: "KC_LEFT", label: "Left Arrow", code: 0x50 },
  { name: "KC_DOWN", label: "Down Arrow", code: 0x51 },
  { name: "KC_UP", label: "Up Arrow", code: 0x52 },
  { name: "KC_APPLICATION", label: "Menu", code: 0x65 },
  { name: "KC_LEFT_CTRL", label: "Left Ctrl", code: 0xe0 },
  { name: "KC_LEFT_SHIFT", label: "Left Shift", code: 0xe1 },
  { name: "KC_LEFT_ALT", label: "Left Alt", code: 0xe2 },
  { name: "KC_LEFT_GUI", label: "Left Win", code: 0xe3 },
  { name: "KC_RIGHT_CTRL", label: "Right Ctrl", code: 0xe4 },
  { name: "KC_RIGHT_SHIFT", label: "Right Shift", code: 0xe5 },
  { name: "KC_RIGHT_ALT", label: "Right Alt", code: 0xe6 },
  { name: "KC_RIGHT_GUI", label: "Right Win", code: 0xe7 },
];

export const MEDIA_KEYCODES: KeycodeDef[] = [
  { name: "KC_AUDIO_MUTE", label: "Mute", code: 0xa8 },
  { name: "KC_AUDIO_VOL_UP", label: "Volume Up", code: 0xa9 },
  { name: "KC_AUDIO_VOL_DOWN", label: "Volume Down", code: 0xaa },
  { name: "KC_MEDIA_NEXT_TRACK", label: "Next Track", code: 0xab },
  { name: "KC_MEDIA_PREV_TRACK", label: "Previous Track", code: 0xac },
  { name: "KC_MEDIA_PLAY_PAUSE", label: "Play/Pause", code: 0xae },
  { name: "KC_BRIGHTNESS_UP", label: "Brightness Up", code: 0xbd },
  { name: "KC_BRIGHTNESS_DOWN", label: "Brightness Down", code: 0xbe },
];

/** `KC_NO` — an unassigned key position (fires nothing). */
export const KC_NO = 0x0000;
/** `KC_TRANSPARENT` — falls through to the layer below on this layer. */
export const KC_TRANSPARENT = 0x0001;

// QK_MOMENTARY's base value and per-layer stride, from quantum/keycodes.h
// (`QK_MOMENTARY = 0x5220`, `QK_MOMENTARY_MAX = 0x523F` — a 32-layer
// range, i.e. +1 per layer number).
const QK_MOMENTARY = 0x5220;
/** `MO(layer)` — momentary layer switch, matching QMK's own macro. */
export function momentaryLayer(layer: number): number {
  return QK_MOMENTARY + layer;
}

// QK_MACRO_0's base value, from quantum/keycodes.h (`QK_MACRO_0 =
// QK_MACRO = 0x7700`, `QK_MACRO_MAX = 0x777F` — 128 possible slots, though
// the keyboard's actual usable count is whatever `get_macro_count`
// reports at runtime, not this range's size).
const QK_MACRO_0 = 0x7700;
/** Keycode that plays back macro slot `index` (0-based) when tapped. */
export function macroPlay(index: number): number {
  return QK_MACRO_0 + index;
}

/** Inverse of {@link momentaryLayer}: the layer number if `code` is an
 * `MO(n)` keycode, else `null`. */
export function layerFromMomentary(code: number): number | null {
  const layer = code - QK_MOMENTARY;
  return layer >= 0 && layer <= 0x1f ? layer : null;
}

/** Inverse of {@link macroPlay}: the macro slot index if `code` plays one
 * back, else `null`. */
export function macroIndexFromKeycode(code: number): number | null {
  const index = code - QK_MACRO_0;
  return index >= 0 && index <= 0x7f ? index : null;
}

const ALL_NAMED: KeycodeDef[] = [...BASIC_KEYCODES, ...MEDIA_KEYCODES];

/**
 * Best-effort human label for any keycode this app might read back from
 * the device — including ones outside {@link BASIC_KEYCODES}/
 * {@link MEDIA_KEYCODES} (transparent, layer keys, macros, or anything
 * this app doesn't have a name for, since the real keymap can contain
 * keycodes assigned by VIA itself or stock firmware that this curated
 * subset doesn't cover).
 */
export function describeKeycode(code: number): string {
  if (code === KC_NO) return "—";
  if (code === KC_TRANSPARENT) return "▽";
  const named = ALL_NAMED.find((k) => k.code === code);
  if (named) return named.label;
  const layer = layerFromMomentary(code);
  if (layer !== null) return `MO(${layer})`;
  const macroIndex = macroIndexFromKeycode(code);
  if (macroIndex !== null) return `M${macroIndex}`;
  return `0x${code.toString(16).padStart(4, "0")}`;
}
