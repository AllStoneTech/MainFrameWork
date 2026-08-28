// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Pattern picker for Matrix Studio's Canvas and Editor tabs — a
 * two-level grouped popover (Custom vs. Built-in, each built-in pattern
 * offering its own Static/Animated choice) replacing a flat `<select>`.
 * A native `<select>` with `<optgroup>` can't avoid listing every
 * built-in pattern name twice (once under Static, once under Animated),
 * since optgroups can't nest — this groups by pattern name once
 * instead, with the static/animated choice as two small buttons on that
 * same row.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { BUILTIN_PATTERNS } from "../../lib/matrixPatterns";

interface CustomPatternOption {
  id: string;
  label: string;
}

interface PatternPickerProps {
  customPatterns: CustomPatternOption[];
  /** What the trigger button shows — the caller owns "what's currently selected," this component doesn't track it. */
  selectedLabel: string;
  onSelectCustom: (id: string) => void;
  onSelectBuiltin: (id: number, animate: boolean) => void;
}

export function PatternPicker({
  customPatterns,
  selectedLabel,
  onSelectCustom,
  onSelectBuiltin,
}: PatternPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Pattern picker"
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-sm text-gray-200 hover:text-white"
      >
        <span className="max-w-[10rem] truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-72 z-20 p-2 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl max-h-96 overflow-y-auto">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide px-2 py-1">Custom</div>
          {customPatterns.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelectCustom(p.id);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 rounded-lg text-sm text-gray-200 hover:bg-white/10"
            >
              {p.label}
            </button>
          ))}

          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide px-2 py-1 mt-2 border-t border-white/5 pt-2">
            Built-in
          </div>
          {BUILTIN_PATTERNS.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-white/5">
              <span className="text-sm text-gray-200 truncate">{p.label}</span>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onSelectBuiltin(p.id, false);
                    setOpen(false);
                  }}
                  className="px-2 py-0.5 rounded bg-black/20 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-white/30"
                >
                  Static
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectBuiltin(p.id, true);
                    setOpen(false);
                  }}
                  className="px-2 py-0.5 rounded bg-black/20 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-white/30"
                >
                  Animated
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
