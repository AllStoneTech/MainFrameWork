// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Maps KeymapTab.tsx's visual key positions to the Framework Laptop 16
 * ANSI keyboard's real firmware matrix (row, col) — what
 * `get_keymap_keycode`/`set_keymap_keycode` actually address. VIA itself
 * gets this from a per-keyboard JSON layout definition; this app doesn't
 * have one, so it's reconstructed here directly from Framework's own
 * firmware source instead:
 *
 * - `FrameworkComputer/qmk_firmware`, branch `fl16-2026-remap-keys`
 *   (fetched 2026-09-01), `keyboards/framework/ansi/ansi.h`'s `LAYOUT`
 *   macro — gives each named position (`K1`, `K2`, ...) its (row, col)
 *   in the 8x16 matrix (`MATRIX_ROWS`/`MATRIX_COLS` in that keyboard's
 *   `config.h`).
 * - The same branch's `keyboards/framework/ansi/keymaps/default/keymap.c`
 *   — gives each named position its real-world key identity (`K110` is
 *   `KC_ESC`, etc.), by matching argument order in the `LAYOUT(...)` call
 *   against the macro's own parameter list.
 *
 * Cross-referencing those two files by hand for all 78 keys is exactly
 * the kind of transcription work a single mistake in silently produces a
 * *plausible-looking* wrong mapping (clicking "Q" would remap some other
 * real key), so treat this table with real caution:
 *
 * - **Firmware-version risk**: `fl16-2026-remap-keys` is a branch name
 *   that reads as in-progress work adding dynamic-keymap support — the
 *   matrix layout itself is unlikely to change (it's fixed by the PCB),
 *   but there's no guarantee this exact branch is what's actually
 *   flashed on a given keyboard right now. If dynamic-keymap commands
 *   come back unsupported, that's a firmware capability gap, not
 *   something this table can fix — see KeymapTab.tsx's handling of that.
 * - **ANSI only**: the ISO/JIS variants (`keyboards/framework/iso`,
 *   `.../jis`) have their own `LAYOUT` macros and were not checked —
 *   this table would need redoing for those.
 * - **Bottom-row modifier cluster is an approximation**: the visual
 *   layout's Ctrl/Win/Alt/Space/Alt/Fn/Ctrl order doesn't exactly match
 *   the physical left-to-right order (real order is
 *   Ctrl, Fn, Win, Alt, Space, Alt, Ctrl, then the arrow cluster, which
 *   isn't in the visual grid at all yet) — each visual key still maps to
 *   a real, distinct modifier key, just not necessarily the one in that
 *   exact physical position.
 * - The physical top row's real base-layer functions are media keys
 *   (Mute, Volume, Brightness, etc.) with F1-F12 only active on the Fn
 *   layer — the visual grid's "F1".."F12" labels are positional (which
 *   switch types F1 when Fn is held), matching the physical keycap's
 *   dual legend, not a claim about what layer 0 currently does there.
 */

/** `[row, col]` in the 8x16 matrix (`config.h`: `MATRIX_ROWS 8`, `MATRIX_COLS 16`). */
export type MatrixPosition = [number, number];

export const ANSI_MATRIX_POSITIONS: Record<string, MatrixPosition> = {
  Esc: [7, 5],
  F1: [3, 5],
  F2: [2, 5],
  F3: [6, 4],
  F4: [3, 4],
  F5: [4, 10],
  F6: [3, 10],
  F7: [2, 10],
  F8: [1, 15],
  F9: [3, 11],
  F10: [4, 8],
  F11: [6, 8],
  F12: [3, 13],
  Del: [0, 1],

  "`": [4, 2],
  "1": [5, 2],
  "2": [5, 5],
  "3": [5, 4],
  "4": [5, 6],
  "5": [4, 6],
  "6": [4, 7],
  "7": [5, 7],
  "8": [5, 10],
  "9": [5, 8],
  "0": [4, 13],
  "-": [2, 13],
  "=": [4, 14],
  Backspace: [5, 14],

  Tab: [3, 2],
  Q: [0, 2],
  W: [6, 5],
  E: [2, 4],
  R: [6, 6],
  T: [3, 6],
  Y: [3, 7],
  U: [6, 7],
  I: [6, 10],
  O: [3, 8],
  P: [5, 13],
  "[": [6, 13],
  "]": [6, 14],
  "\\": [2, 8],

  Caps: [4, 4],
  A: [7, 2],
  S: [4, 5],
  D: [7, 14],
  F: [7, 6],
  G: [2, 6],
  H: [2, 7],
  J: [7, 7],
  K: [7, 10],
  L: [7, 8],
  ";": [7, 13],
  "'": [0, 14],
  Enter: [1, 14],

  // Both "Shift" entries in KeymapTab's row share this same visual label —
  // keyed separately here since they're different physical keys.
  ShiftLeft: [1, 9],
  Z: [1, 5],
  X: [0, 5],
  C: [0, 0],
  V: [0, 6],
  B: [1, 6],
  N: [1, 7],
  M: [0, 7],
  ",": [0, 10],
  ".": [0, 8],
  "/": [0, 13],
  ShiftRight: [0, 9],

  CtrlLeft: [1, 12],
  Win: [3, 1],
  AltLeft: [1, 3],
  Space: [1, 4],
  AltRight: [0, 3],
  Fn: [2, 2],
  CtrlRight: [0, 12],
};
