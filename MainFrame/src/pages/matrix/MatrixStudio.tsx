// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shell for the Matrix Studio pillar. See the exported component's doc
 * comment below for the panel model.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Moon, Sun } from "lucide-react";
import { TabBar } from "../../components/ui/TabBar";
import type { ConnectedDevice } from "../../lib/types";

/** Which of the two independent 9x34 LED Matrix boards is targeted. */
export type Panel = "Panel 1" | "Panel 2";

/** Outlet context passed down to Canvas/Widgets/Animator tabs. */
export interface MatrixStudioContext {
  panel: Panel;
}

/**
 * Shell for the Matrix Studio pillar. Holds the panel switcher (the LED
 * Matrix module is two independent 9x34 boards, each its own serial port
 * per matrix_control.rs) and the Canvas/Widgets/Animator tab bar; tab
 * content renders through the nested route Outlet.
 *
 * Deliberately labeled "Panel 1"/"Panel 2", not "Left"/"Right": there's no
 * way to query which physical bay a given serial port belongs to, so
 * matrix_control.rs's `port_for_panel` just picks by sorted port name.
 * Calling that "Left" or "Right" would assert a physical mapping we can't
 * actually confirm — a real single-panel setup came back mapped to what
 * used to be labeled "Left" while physically installed on the right.
 *
 * Panel count comes from a `scan_devices` call on mount: each installed
 * Matrix board enumerates as its own USB device (same VID/PID), so the
 * count of `device_type === "Matrix"` entries tells us whether one or two
 * boards are physically present. When only one is found, "Panel 2" is
 * disabled rather than left clickable-but-broken — `port_for_panel` would
 * otherwise fail with "Panel 2 not found" the moment you tried to use it.
 *
 * On a Framework Laptop 16 with exactly one panel connected, a separate
 * `get_matrix_bay_hint` call reports which physical USB bay it's actually
 * in (via hub-port topology, not the port-name-sort guess above) and
 * shows it as a caption under the switcher — see that command's doc
 * comment in matrix_control.rs for what it can and can't tell us.
 *
 * Sleep/Wake live here rather than in CanvasTab/AnimatorTab so they're
 * available from both — panel power state isn't specific to which editor
 * you're in. `sleepState` is optimistic (set from what we just sent, not
 * read back from the device) and resets to unknown whenever the selected
 * panel changes, since a freshly-selected panel's actual state is
 * unknown until you interact with it.
 */
export default function MatrixStudio(): ReactElement {
  const [panel, setPanel] = useState<Panel>("Panel 1");
  const [panelCount, setPanelCount] = useState<number | null>(null);
  const [bayHint, setBayHint] = useState<string | null>(null);
  const [sleepState, setSleepState] = useState<"asleep" | "awake" | null>(null);
  const [sleepError, setSleepError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ConnectedDevice[]>("scan_devices")
      .then((devices) => {
        const count = devices.filter((d) => d.device_type === "Matrix").length;
        setPanelCount(count);
        if (count <= 1) setPanel("Panel 1");
      })
      .catch((error) => console.error("Matrix panel scan failed:", error));
    invoke<string | null>("get_matrix_bay_hint")
      .then(setBayHint)
      .catch((error) => console.error("Matrix bay hint failed:", error));
  }, []);

  const onlyOnePanel = panelCount !== null && panelCount <= 1;

  const selectPanel = (p: Panel): void => {
    setPanel(p);
    setSleepState(null);
    setSleepError(null);
  };

  const handleSleep = async (sleep: boolean): Promise<void> => {
    setSleepError(null);
    try {
      await invoke("set_matrix_sleep", { panel, sleep });
      setSleepState(sleep ? "asleep" : "awake");
    } catch (error) {
      console.error("Sleep toggle failed:", error);
      setSleepError(String(error));
    }
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-3xl font-bold text-white">Matrix Studio</h1>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <button
                title="Sleep"
                onClick={() => handleSleep(true)}
                className={`p-2 rounded-lg border transition-colors ${
                  sleepState === "asleep"
                    ? "bg-primary/10 border-primary/50 text-primary"
                    : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <Moon size={16} />
              </button>
              <button
                title="Wake"
                onClick={() => handleSleep(false)}
                className={`p-2 rounded-lg border transition-colors ${
                  sleepState === "awake"
                    ? "bg-primary/10 border-primary/50 text-primary"
                    : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <Sun size={16} />
              </button>
            </div>
            <div className="flex gap-2 p-1 bg-black/20 border border-white/10 rounded-lg">
              {(["Panel 1", "Panel 2"] as const).map((p) => {
                const disabled = p === "Panel 2" && onlyOnePanel;
                return (
                  <button
                    key={p}
                    onClick={() => !disabled && selectPanel(p)}
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
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            {sleepState && (
              <span className="text-xs text-gray-500">
                {sleepState === "asleep" ? "Sleeping" : "Awake"}
              </span>
            )}
            {bayHint && <span className="text-xs text-gray-500">Detected in {bayHint}</span>}
            {sleepError && <span className="text-xs text-red-500 max-w-xs text-right">{sleepError}</span>}
          </div>
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
