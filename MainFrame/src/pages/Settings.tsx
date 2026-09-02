// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * App-level preferences page (theme, stealth mode, Pro upsell, about
 * block). See the exported component's doc comment below for persistence
 * status.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Lock, Info, Clock } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { isEnabled as isAutostartEnabled, enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";
import { Card } from "../components/ui/Card";
import { Toggle } from "../components/ui/Toggle";
import { StatusPill } from "../components/ui/StatusPill";
import { loadSettings, patchSettings } from "../lib/settings";

/**
 * App-level preferences. Theme/stealth-mode map to Docs/DATA_SCHEMA.md's
 * Global Config block. Dark theme is fixed on for now (toggle disabled).
 * Stealth mode is persisted via `save_settings` and also flips the tray
 * icon's live visibility through the `set_tray_visible` command. Start
 * on Boot is backed by `tauri-plugin-autostart` — its toggle reads/writes
 * the OS's actual startup registration directly (Windows Registry Run
 * key / Linux `.desktop` autostart entry) rather than a value in
 * `save_settings`, so it can't drift from what the OS will really do.
 */
export default function Settings(): ReactElement {
  const [darkTheme, setDarkTheme] = useState(true);
  const [stealthMode, setStealthMode] = useState(false);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [startOnBootError, setStartOnBootError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((settings) => {
      if (typeof settings.stealth_mode === "boolean") {
        setStealthMode(settings.stealth_mode);
      }
    });
    isAutostartEnabled()
      .then(setStartOnBoot)
      .catch((err: unknown) => console.error("Failed to query autostart state:", err));
  }, []);

  const handleStealthModeChange = (checked: boolean): void => {
    setStealthMode(checked);
    patchSettings({ stealth_mode: checked }).catch((err: unknown) =>
      console.error("Failed to save stealth mode:", err)
    );
    invoke("set_tray_visible", { visible: !checked }).catch((err: unknown) =>
      console.error("Failed to update tray visibility:", err)
    );
  };

  const handleStartOnBootChange = async (checked: boolean): Promise<void> => {
    const previous = startOnBoot;
    setStartOnBoot(checked);
    setStartOnBootError(null);
    try {
      await (checked ? enableAutostart() : disableAutostart());
    } catch (err) {
      console.error("Failed to update autostart registration:", err);
      setStartOnBoot(previous);
      setStartOnBootError(String(err));
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-white mb-6">Settings</h1>

      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">General</h3>
          <div className="space-y-5">
            <Toggle checked={darkTheme} onChange={setDarkTheme} label="Dark Theme" description="MainFrameWork is dark-mode only for now" disabled />
            <Toggle
              checked={stealthMode}
              onChange={handleStealthModeChange}
              label="Stealth Mode"
              description="Hide the tray icon"
            />
            <Toggle
              checked={startOnBoot}
              onChange={(checked) => {
                handleStartOnBootChange(checked).catch((err: unknown) =>
                  console.error("Unhandled autostart toggle error:", err)
                );
              }}
              label="Start on Boot"
              description="Launch MainFrameWork automatically when you log in"
            />
            {startOnBootError && (
              <div className="text-xs text-red-500">Failed to update: {startOnBootError}</div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="text-primary" size={18} />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Pro & Drivers</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white font-medium">Community Edition</div>
              <div className="text-xs text-gray-400 mt-0.5">Cloud Sync, Unlimited Profiles, and GameSense require Pro</div>
            </div>
            <button
              disabled
              title="Not implemented yet"
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-400 rounded-lg text-sm font-bold cursor-not-allowed"
            >
              <Clock size={16} /> Coming Soon
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5">
            <StatusPill label="CrosEC Driver: Checked in System Health" variant="warning" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Info className="text-gray-400" size={18} />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">About</h3>
          </div>
          <div className="text-sm text-gray-400 space-y-1 mt-3">
            <div>MainFrameWork v0.1.0 (Portable)</div>
            <div className="text-xs text-gray-400">GPLv3 Community Edition</div>
            <div className="text-xs text-gray-400 pt-2">
              Designed and created by{" "}
              <button
                onClick={() =>
                  openUrl("https://www.AllStoneTech.com/MainFramework").catch((err: unknown) =>
                    console.error("Failed to open link:", err)
                  )
                }
                className="text-primary hover:underline"
              >
                All Stone Tech
              </button>
            </div>
            <div className="text-xs text-gray-500 pt-2 leading-relaxed">
              Unofficial and independent — not affiliated with, endorsed by, or supported by
              Framework Computer Inc.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
