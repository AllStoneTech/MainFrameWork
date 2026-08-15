// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shell for the Matrix Studio pillar. See the exported component's doc
 * comment below for the Left/Right panel model.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { TabBar } from "../../components/ui/TabBar";

/** Which of the two independent 9x34 LED Matrix boards is targeted. */
export type Panel = "Left" | "Right";

/** Outlet context passed down to Canvas/Widgets/Animator tabs. */
export interface MatrixStudioContext {
  panel: Panel;
}

/**
 * Shell for the Matrix Studio pillar. Holds the Left/Right panel switcher
 * (the LED Matrix module is two independent 9x34 boards, each its own
 * serial port per matrix_control.rs) and the Canvas/Widgets/Animator tab
 * bar; tab content renders through the nested route Outlet.
 */
export default function MatrixStudio(): ReactElement {
  const [panel, setPanel] = useState<Panel>("Left");

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Matrix Studio</h1>
        <div className="flex gap-2 p-1 bg-black/20 border border-white/10 rounded-lg">
          {(["Left", "Right"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPanel(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                panel === p ? "bg-primary text-black" : "text-gray-400 hover:text-white"
              }`}
            >
              {p} Panel
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <TabBar
          items={[
            { to: "/matrix/canvas", label: "Canvas" },
            { to: "/matrix/widgets", label: "Widgets" },
            { to: "/matrix/animator", label: "Animator" },
          ]}
        />
      </div>

      <div className="flex-1 min-h-0">
        <Outlet context={{ panel } satisfies MatrixStudioContext} />
      </div>
    </div>
  );
}
