// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Brush/Stamp switch shared by Matrix Studio's Canvas and Animator tabs,
 * styled off the same pill-group pattern MatrixStudio already uses for
 * its Panel 1/2 switcher.
 */
import type { ReactElement } from "react";

export type ToolMode = "brush" | "stamp";

const MODES: ToolMode[] = ["brush", "stamp"];

interface ToolModeToggleProps {
  mode: ToolMode;
  onChange: (mode: ToolMode) => void;
}

export function ToolModeToggle({ mode, onChange }: ToolModeToggleProps): ReactElement {
  return (
    <div className="flex gap-1 p-1 bg-black/20 border border-white/10 rounded-lg w-fit">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
            mode === m ? "bg-primary text-black" : "text-gray-400 hover:text-white"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
