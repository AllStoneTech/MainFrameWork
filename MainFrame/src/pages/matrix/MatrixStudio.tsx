// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shell for the Matrix Studio pillar. See the exported component's doc
 * comment below for the panel model.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Moon, Sun } from "lucide-react";
import { TabBar } from "../../components/ui/TabBar";
import type { ConnectedDevice } from "../../lib/types";
import { RESUME_EVENT } from "../../lib/systemEvents";

/** Which of the two independent 9x34 LED Matrix boards is targeted. */
export type Panel = "Panel 1" | "Panel 2";

/**
 * Outlet context passed down to Canvas/Widgets/Animator/Editor tabs.
 * `toolbarSlot` is an empty DOM node rendered next to the TabBar pills;
 * a tab with its own toolbar (tool mode, undo/redo, Pen Size,
 * Brightness, Saved, Schedule) portals those controls into it via
 * `createPortal` so they render on the TabBar's row without lifting
 * that tab's state up into this shell. Null until the ref callback
 * below has fired, and simply left unused by tabs (like Widgets) that
 * have no toolbar.
 */
export interface MatrixStudioContext {
  panel: Panel;
  toolbarSlot: HTMLDivElement | null;
}

/**
 * Shell for the Matrix Studio pillar. Holds the panel switcher (the LED
 * Matrix module is two independent 9x34 boards, each its own serial port
 * per matrix_control.rs) and the tab bar; tab content renders through
 * the nested route Outlet.
 *
 * The tab bar only lists Widgets and Editor — Canvas and Animator were
 * folded into EditorTab.tsx (see its doc comment) and hidden from here,
 * but their routes stay registered in App.tsx and their components are
 * untouched, so nothing is actually lost if that turns out to be the
 * wrong call; they're just not linked from the nav anymore.
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
 * Sleep/Wake live here rather than in a tab so they're available
 * regardless of which one you're in — panel power state isn't specific
 * to an editor. `sleepState` is queried from the real device (`GetSleep`,
 * `get_matrix_sleep`) on mount and on every panel switch (cleared to
 * `null` the instant the switch happens, rather than left showing the
 * outgoing panel's state until the new query resolves), rather than
 * just assuming "awake" — sleep persists on-device across app restarts
 * (see matrix_control.rs's module doc comment), so that assumption was
 * wrong whenever MainFrameWork started up with a panel already asleep.
 * `handleSleep` itself *is* genuinely optimistic (updates the button
 * immediately, rolls back on failure) — it wasn't before, despite an
 * earlier version of this comment claiming so.
 */
export default function MatrixStudio(): ReactElement {
  const [panel, setPanel] = useState<Panel>("Panel 1");
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
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

  // Re-queries whenever the selected panel changes (including the
  // initial one on mount) — each panel has independent sleep state.
  useEffect(() => {
    invoke<boolean>("get_matrix_sleep", { panel })
      .then((sleeping) => setSleepState(sleeping ? "asleep" : "awake"))
      .catch((error) => {
        console.error("Sleep state query failed:", error);
        setSleepState(null);
      });
  }, [panel]);

  // Also re-queries after the host resumes from sleep: the LED Matrix
  // module power-cycles across a host suspend (see power_watch.rs and
  // EditorTab.tsx's own RESUME_EVENT handling), so a Sleep/Wake toggle
  // showing "Sleeping" from before the laptop slept could easily be
  // stale — the panel came back awake without MainFrameWork asking.
  useEffect(() => {
    const unlisten = listen(RESUME_EVENT, () => {
      invoke<boolean>("get_matrix_sleep", { panel })
        .then((sleeping) => setSleepState(sleeping ? "asleep" : "awake"))
        .catch((error) => console.error("Post-resume sleep state query failed:", error));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [panel]);

  const onlyOnePanel = panelCount !== null && panelCount <= 1;

  const selectPanel = (p: Panel): void => {
    setPanel(p);
    setSleepError(null);
    // Cleared rather than left showing the outgoing panel's state — the
    // `get_matrix_sleep` effect above re-queries on every panel change,
    // but that query takes a real serial round-trip, so without this
    // the Sleep/Wake buttons would keep showing the previous panel's
    // state for a moment after switching, looking like they lag.
    setSleepState(null);
  };

  const handleSleep = async (sleep: boolean): Promise<void> => {
    setSleepError(null);
    // Updated immediately rather than after the round-trip resolves —
    // waiting for `await` first meant clicking Sleep/Wake had a visible
    // delay before the button highlighted, despite this having been
    // documented as "optimistic." Rolled back if the command fails.
    const previousState = sleepState;
    setSleepState(sleep ? "asleep" : "awake");
    try {
      await invoke("set_matrix_sleep", { panel, sleep });
    } catch (error) {
      console.error("Sleep toggle failed:", error);
      setSleepError(String(error));
      setSleepState(previousState);
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
                    ? "bg-primary/10 border-primary/50 text-primary hover:bg-primary/20"
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
                    ? "bg-primary/10 border-primary/50 text-primary hover:bg-primary/20"
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

      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <TabBar
          items={[
            { to: "/matrix/editor", label: "Editor" },
            { to: "/matrix/widgets", label: "Widgets" },
          ]}
        />
        {/* Populated via createPortal by whichever tab has its own
            toolbar (see MatrixStudioContext's doc comment) — empty on
            tabs like Widgets that don't. */}
        <div ref={setToolbarSlot} className="flex items-center gap-3 flex-wrap" />
      </div>

      <div className="flex-1 min-h-0">
        <Outlet context={{ panel, toolbarSlot } satisfies MatrixStudioContext} />
      </div>
    </div>
  );
}
