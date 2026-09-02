// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Visual keymap editor tab (Input Studio). See the exported component's
 * doc comment below for what is and isn't wired to real hardware yet.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card } from "../../components/ui/Card";
import { ANSI_MATRIX_POSITIONS } from "../../lib/frameworkAnsiMatrix";
import { BASIC_KEYCODES, MEDIA_KEYCODES, KC_NO, KC_TRANSPARENT, describeKeycode, momentaryLayer, macroPlay } from "../../lib/qmkKeycodes";

interface KeyDef {
  label: string;
  width?: number;
  /** Key into `ANSI_MATRIX_POSITIONS`/state, when it differs from the
   * display `label` — needed for the physical keys (Shift/Ctrl/Alt) that
   * appear twice with the same label but are two distinct real keys. */
  matrixKey?: string;
}

// Framework Laptop 16 ANSI keyboard layout. Row/col addressing for every
// key below comes from `ANSI_MATRIX_POSITIONS` (frameworkAnsiMatrix.ts) —
// see that file's doc comment for sourcing and caveats (firmware-version
// risk, ANSI-only, and why the physical top row's labels are positional
// rather than a claim about what's assigned there right now).
const KEYBOARD_ROWS: KeyDef[][] = [
  [
    { label: "Esc" }, { label: "F1" }, { label: "F2" }, { label: "F3" }, { label: "F4" },
    { label: "F5" }, { label: "F6" }, { label: "F7" }, { label: "F8" }, { label: "F9" },
    { label: "F10" }, { label: "F11" }, { label: "F12" }, { label: "Del" },
  ],
  [
    { label: "`" }, { label: "1" }, { label: "2" }, { label: "3" }, { label: "4" }, { label: "5" },
    { label: "6" }, { label: "7" }, { label: "8" }, { label: "9" }, { label: "0" }, { label: "-" },
    { label: "=" }, { label: "Backspace", width: 2 },
  ],
  [
    { label: "Tab", width: 1.5 }, { label: "Q" }, { label: "W" }, { label: "E" }, { label: "R" },
    { label: "T" }, { label: "Y" }, { label: "U" }, { label: "I" }, { label: "O" }, { label: "P" },
    { label: "[" }, { label: "]" }, { label: "\\", width: 1.5 },
  ],
  [
    { label: "Caps", width: 1.75 }, { label: "A" }, { label: "S" }, { label: "D" }, { label: "F" },
    { label: "G" }, { label: "H" }, { label: "J" }, { label: "K" }, { label: "L" }, { label: ";" },
    { label: "'" }, { label: "Enter", width: 2.25 },
  ],
  [
    { label: "Shift", width: 2.25, matrixKey: "ShiftLeft" }, { label: "Z" }, { label: "X" }, { label: "C" }, { label: "V" },
    { label: "B" }, { label: "N" }, { label: "M" }, { label: "," }, { label: "." }, { label: "/" },
    { label: "Shift", width: 2.75, matrixKey: "ShiftRight" },
  ],
  [
    { label: "Ctrl", width: 1.25, matrixKey: "CtrlLeft" }, { label: "Win", width: 1.25 }, { label: "Alt", width: 1.25, matrixKey: "AltLeft" },
    { label: "Space", width: 6.25 }, { label: "Alt", width: 1.25, matrixKey: "AltRight" }, { label: "Fn", width: 1.25 },
    { label: "Ctrl", width: 1.25, matrixKey: "CtrlRight" },
  ],
];

type AssignCategory = "Basic" | "Media" | "Layer" | "Macro";
const CATEGORIES: AssignCategory[] = ["Basic", "Media", "Layer", "Macro"];

/**
 * Visual keymap editor: layer tabs + a clickable keyboard render + an
 * assign panel, mirroring the layout Framework's own VIA fork
 * (keyboard.frame.work) uses.
 *
 * Reads and writes the real keyboard over VIA's dynamic-keymap raw-HID
 * commands (`get_keymap_keycode`/`set_keymap_keycode` in
 * keyboard_mapper.rs) — each visual key's physical (layer, row, col)
 * comes from `frameworkAnsiMatrix.ts`. See that file's doc comment for
 * the biggest caveat: this depends on the keyboard's *firmware* actually
 * supporting dynamic keymaps, which may not be what's flashed on a given
 * unit yet. If `get_keymap_layer_count` fails on mount, this shows a
 * banner explaining that instead of quietly falling back to a fake
 * layer count — silently guessing "4 layers" and letting every
 * subsequent read/write fail one at a time would be a much more
 * confusing failure mode than saying so up front.
 */
export default function KeymapTab(): ReactElement {
  const [layer, setLayer] = useState(0);
  const [layerCount, setLayerCount] = useState<number | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [macroCount, setMacroCount] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keycodes, setKeycodes] = useState<Record<string, number>>({});
  const [loadingLayer, setLoadingLayer] = useState(false);
  const [category, setCategory] = useState<AssignCategory>("Basic");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    invoke<number>("get_keymap_layer_count")
      .then(setLayerCount)
      .catch((err: unknown) => {
        console.error("get_keymap_layer_count failed:", err);
        setUnsupported(String(err));
      });
    invoke<number>("get_macro_count")
      .then(setMacroCount)
      .catch((err: unknown) => console.error("get_macro_count failed (Macro category will be empty):", err));
  }, []);

  // Reloads every visible key's real keycode whenever the layer changes
  // (including the first load). One HID round trip per key — there's no
  // bulk read available without knowing the firmware's matrix size up
  // front (see frameworkAnsiMatrix.ts's doc comment) — but they're fired
  // concurrently; keyboard_mapper.rs's `send_and_read` holds the device
  // lock across each individual write+read, so concurrent calls
  // serialize safely on the Rust side rather than needing to be awaited
  // one at a time here.
  useEffect(() => {
    if (layerCount === null) return;
    let cancelled = false;
    setLoadingLayer(true);
    setSelectedKey(null);
    const entries = Object.entries(ANSI_MATRIX_POSITIONS);
    Promise.all(
      entries.map(async ([key, [row, col]]) => {
        const code = await invoke<number>("get_keymap_keycode", { layer, row, col });
        return [key, code] as const;
      })
    )
      .then((results) => {
        if (cancelled) return;
        setKeycodes(Object.fromEntries(results));
        setLoadingLayer(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load keymap layer:", err);
        setLoadingLayer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [layer, layerCount]);

  const assign = async (keycode: number): Promise<void> => {
    if (!selectedKey) return;
    const position = ANSI_MATRIX_POSITIONS[selectedKey];
    if (!position) return;
    const [row, col] = position;
    const previous = keycodes[selectedKey];
    setAssignError(null);
    setKeycodes((prev) => ({ ...prev, [selectedKey]: keycode }));
    try {
      await invoke("set_keymap_keycode", { layer, row, col, keycode });
    } catch (err) {
      console.error("Failed to set keycode:", err);
      setAssignError(String(err));
      setKeycodes((prev) => ({ ...prev, [selectedKey]: previous }));
    }
  };

  const handleResetKeymap = async (): Promise<void> => {
    if (!window.confirm("Reset every layer's keymap to the firmware's default? This can't be undone from here.")) {
      return;
    }
    setResetting(true);
    setAssignError(null);
    try {
      await invoke("reset_keymap");
      setKeycodes({});
      setLayer((l) => l); // Re-trigger the layer-load effect for the current layer.
    } catch (err) {
      console.error("Failed to reset keymap:", err);
      setAssignError(String(err));
    } finally {
      setResetting(false);
    }
  };

  if (unsupported) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-bold text-white mb-2">Keymap editing unavailable</h2>
        <p className="text-sm text-gray-400 max-w-xl">
          The keyboard didn&apos;t respond to a dynamic-keymap query (
          <code className="text-xs bg-black/30 px-1 py-0.5 rounded">get_keymap_layer_count</code>). This usually
          means the currently-flashed firmware doesn&apos;t have dynamic-keymap support built in yet, rather than a
          bug in MainFrameWork — see <code className="text-xs bg-black/30 px-1 py-0.5 rounded">frameworkAnsiMatrix.ts</code>
          &apos;s doc comment for why that can happen.
        </p>
        <p className="text-xs text-gray-500 mt-3 font-mono break-all">{unsupported}</p>
      </Card>
    );
  }

  return (
    <div className="flex gap-6 h-full">
      <Card className="flex-1 p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          {layerCount === null ? (
            <span className="text-xs text-gray-400">Loading layers...</span>
          ) : (
            Array.from({ length: layerCount }, (_, l) => l).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLayer(l);
                  setSelectedKey(null);
                }}
                className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                  layer === l
                    ? "bg-primary text-black"
                    : "bg-black/20 border border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                {l}
              </button>
            ))
          )}
          <span className="ml-2 text-xs text-gray-400">Layer {layer}{loadingLayer && " · loading..."}</span>
          <button
            onClick={() => {
              handleResetKeymap().catch((err: unknown) => console.error("Unhandled reset error:", err));
            }}
            disabled={resetting || layerCount === null}
            title="Reset every layer to the firmware default"
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resetting ? "Resetting..." : "Reset Keymap"}
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-1.5">
          {KEYBOARD_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="flex gap-1.5">
              {row.map((key, colIdx) => {
                const id = key.matrixKey ?? key.label;
                const isSelected = selectedKey === id;
                const code = keycodes[id];
                const assigned = code !== undefined && code !== KC_NO && code !== KC_TRANSPARENT;
                return (
                  <button
                    key={`${rowIdx}-${colIdx}`}
                    onClick={() => setSelectedKey(id)}
                    style={{ flexGrow: key.width ?? 1 }}
                    title={code !== undefined ? `Assigned: ${describeKeycode(code)}` : undefined}
                    className={`h-10 rounded-md text-xs font-medium border transition-colors truncate px-1 ${
                      isSelected
                        ? "bg-primary border-primary text-black"
                        : assigned
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "bg-[#1a1a1a] border-white/10 text-gray-300 hover:border-white/30"
                    }`}
                  >
                    {key.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <Card className="w-72 p-6 shrink-0 overflow-y-auto">
        <h3 className="text-sm font-bold text-white mb-1">Key Assignment</h3>
        {!selectedKey ? (
          <p className="text-xs text-gray-400 mt-4">Select a key to assign an action.</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-1">Editing layer {layer}</p>
            <p className="text-xs text-primary mb-4">
              Currently: {keycodes[selectedKey] !== undefined ? describeKeycode(keycodes[selectedKey]) : "..."}
            </p>

            <div className="flex gap-1 mb-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    category === cat
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {assignError && <p className="text-xs text-red-500 mb-2 break-all">{assignError}</p>}

            <div className="space-y-1 max-h-80 overflow-y-auto">
              {category === "Basic" &&
                [
                  { name: "None", label: "None (KC_NO)", code: KC_NO },
                  { name: "Transparent", label: "Transparent", code: KC_TRANSPARENT },
                  ...BASIC_KEYCODES,
                ].map((k) => (
                  <button
                    key={k.name}
                    onClick={() => {
                      assign(k.code).catch((err: unknown) => console.error("Unhandled assign error:", err));
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-sm border border-white/10 bg-black/20 text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                  >
                    {k.label}
                  </button>
                ))}
              {category === "Media" &&
                MEDIA_KEYCODES.map((k) => (
                  <button
                    key={k.name}
                    onClick={() => {
                      assign(k.code).catch((err: unknown) => console.error("Unhandled assign error:", err));
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-sm border border-white/10 bg-black/20 text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                  >
                    {k.label}
                  </button>
                ))}
              {category === "Layer" &&
                (layerCount === null ? (
                  <p className="text-xs text-gray-500">Loading...</p>
                ) : (
                  Array.from({ length: layerCount }, (_, l) => l).map((l) => (
                    <button
                      key={l}
                      onClick={() => {
                        assign(momentaryLayer(l)).catch((err: unknown) => console.error("Unhandled assign error:", err));
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-sm border border-white/10 bg-black/20 text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                    >
                      Momentary: Layer {l}
                    </button>
                  ))
                ))}
              {category === "Macro" &&
                (macroCount === 0 ? (
                  <p className="text-xs text-gray-500">No macro slots reported by the keyboard.</p>
                ) : (
                  Array.from({ length: macroCount }, (_, m) => m).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        assign(macroPlay(m)).catch((err: unknown) => console.error("Unhandled assign error:", err));
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-sm border border-white/10 bg-black/20 text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                    >
                      Play Macro {m}
                    </button>
                  ))
                ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
