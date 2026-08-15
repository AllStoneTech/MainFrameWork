// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shell for the Input Commander pillar. See the exported component's doc
 * comment below for the device-switcher/tab-bar relationship.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Keyboard, Calculator, Grid3X3 } from "lucide-react";
import { TabBar } from "../../components/ui/TabBar";

type InputDevice = "Keyboard" | "Numpad" | "Macropad";

const DEVICES: { id: InputDevice; label: string; icon: typeof Keyboard }[] = [
  { id: "Keyboard", label: "Main Keyboard", icon: Keyboard },
  { id: "Numpad", label: "Numpad", icon: Calculator },
  { id: "Macropad", label: "RGB Macropad", icon: Grid3X3 },
];

/**
 * Shell for the Input Commander pillar. Holds the active-device switcher
 * (Keyboard / Numpad / Macropad are independent HID devices per
 * ARCHITECT.md's Device Manager) and the Keymap/Lighting/Macros tab bar;
 * the actual tab content renders through the nested route Outlet.
 */
export default function InputStudio(): ReactElement {
  // TODO: replace with real connected-device list from scan_devices once
  // per-device targeting is wired into keyboard_mapper.rs.
  const [activeDevice, setActiveDevice] = useState<InputDevice>("Keyboard");

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Input Studio</h1>
        <div className="flex gap-2">
          {DEVICES.map((device) => (
            <button
              key={device.id}
              onClick={() => setActiveDevice(device.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                activeDevice === device.id
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              <device.icon size={16} />
              {device.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <TabBar
          items={[
            { to: "/input/keymap", label: "Keymap" },
            { to: "/input/lighting", label: "Lighting" },
            { to: "/input/macros", label: "Macros" },
          ]}
        />
      </div>

      <div className="flex-1 min-h-0">
        <Outlet context={{ activeDevice }} />
      </div>
    </div>
  );
}
