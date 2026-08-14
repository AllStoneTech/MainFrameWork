import type { ReactElement } from "react";
import { useState } from "react";
import { Card } from "../../components/ui/Card";

interface KeyDef {
  label: string;
  width?: number;
}

// Representative Framework 16 ANSI-ish layout. Purely visual for now —
// not the real QMK keycode matrix.
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
    { label: "Shift", width: 2.25 }, { label: "Z" }, { label: "X" }, { label: "C" }, { label: "V" },
    { label: "B" }, { label: "N" }, { label: "M" }, { label: "," }, { label: "." }, { label: "/" },
    { label: "Shift", width: 2.75 },
  ],
  [
    { label: "Ctrl", width: 1.25 }, { label: "Win", width: 1.25 }, { label: "Alt", width: 1.25 },
    { label: "Space", width: 6.25 }, { label: "Alt", width: 1.25 }, { label: "Fn", width: 1.25 },
    { label: "Ctrl", width: 1.25 },
  ],
];

const CATEGORIES = ["Basic", "Media", "Macro", "Layer"] as const;

/**
 * Visual keymap editor: layer tabs + a clickable keyboard render + an
 * assign panel, mirroring the layout Framework's own VIA fork
 * (keyboard.frame.work) uses. Assignments are held in local state only —
 * wiring to the real QMK/VIA raw-HID protocol is a follow-up.
 */
export default function KeymapTab(): ReactElement {
  const [layer, setLayer] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const keyId = (row: number, col: number): string => `L${layer}-${row}-${col}`;

  const assign = (category: string): void => {
    if (!selectedKey) return;
    setAssignments((prev) => ({ ...prev, [selectedKey]: category }));
  };

  return (
    <div className="flex gap-6 h-full">
      <Card className="flex-1 p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          {[0, 1, 2, 3].map((l) => (
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
          ))}
          <span className="ml-2 text-xs text-gray-400">Layer {layer}</span>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-1.5">
          {KEYBOARD_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="flex gap-1.5">
              {row.map((key, colIdx) => {
                const id = keyId(rowIdx, colIdx);
                const isSelected = selectedKey === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedKey(id)}
                    style={{ flexGrow: key.width ?? 1 }}
                    className={`h-10 rounded-md text-xs font-medium border transition-colors truncate px-1 ${
                      isSelected
                        ? "bg-primary border-primary text-black"
                        : assignments[id]
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

      <Card className="w-72 p-6 shrink-0">
        <h3 className="text-sm font-bold text-white mb-1">Key Assignment</h3>
        {!selectedKey ? (
          <p className="text-xs text-gray-400 mt-4">Select a key to assign an action.</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-4">Editing layer {layer}</p>
            <div className="space-y-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => assign(cat)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                    assignments[selectedKey] === cat
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
