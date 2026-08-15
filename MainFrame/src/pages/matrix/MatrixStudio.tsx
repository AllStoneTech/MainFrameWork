// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shell for the Matrix Studio pillar. See the exported component's doc
 * comment below for the Left/Right panel model.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "../../components/ui/TabBar";
import type { ConnectedDevice } from "../../lib/types";

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
 *
 * Panel count comes from a `scan_devices` call on mount: each installed
 * Matrix board enumerates as its own USB device (same VID/PID), so the
 * count of `device_type === "Matrix"` entries tells us whether one or two
 * boards are physically present. When only one is found, "Right" is
 * disabled rather than left clickable-but-broken — matrix_control.rs's own
 * `port_for_panel` would otherwise fail with "Right Matrix panel not
 * found" the moment you tried to use it. (Which physical board that one
 * panel maps to — always "Left" by the backend's port-sort-order
 * assumption — is still unverified against real dual-panel hardware, same
 * caveat as matrix_control.rs.)
 */
export default function MatrixStudio(): ReactElement {
  const [panel, setPanel] = useState<Panel>("Left");
  const [panelCount, setPanelCount] = useState<number | null>(null);

  useEffect(() => {
    invoke<ConnectedDevice[]>("scan_devices")
      .then((devices) => {
        const count = devices.filter((d) => d.device_type === "Matrix").length;
        setPanelCount(count);
        if (count <= 1) setPanel("Left");
      })
      .catch((error) => console.error("Matrix panel scan failed:", error));
  }, []);

  const onlyOnePanel = panelCount !== null && panelCount <= 1;

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Matrix Studio</h1>
        <div className="flex gap-2 p-1 bg-black/20 border border-white/10 rounded-lg">
          {(["Left", "Right"] as const).map((p) => {
            const disabled = p === "Right" && onlyOnePanel;
            return (
              <button
                key={p}
                onClick={() => !disabled && setPanel(p)}
                disabled={disabled}
                title={disabled ? "Only one LED Matrix panel detected" : undefined}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  disabled
                    ? "text-gray-600 cursor-not-allowed"
                    : panel === p
                    ? "bg-primary text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {p} Panel
              </button>
            );
          })}
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
