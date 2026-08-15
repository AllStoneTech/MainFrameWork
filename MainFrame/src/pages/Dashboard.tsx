// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Landing page. Scans for connected Framework Laptop 16 input/matrix
 * modules via the Rust-side `scan_devices` command on mount and renders
 * them as a labeled bay hero, a "Hardware Summary" card, and a
 * "Connected Modules" list — all three driven off the same scan result,
 * no mock data.
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Laptop, Keyboard, Grid3X3, Calculator, RefreshCw } from "lucide-react";
import type { ConnectedDevice } from "../lib/types";

/** Home page: hardware bay hero, hardware summary, and connected-device list. */
export default function Dashboard() {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastScanned, setLastScanned] = useState<Date | null>(null);

  const scanDevices = async () => {
    setLoading(true);
    try {
      const result = await invoke<ConnectedDevice[]>("scan_devices");
      setDevices(result);
      setLastScanned(new Date());
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scanDevices();
  }, []);

  // Maps a device_type string from scan_devices to its display icon;
  // Macropad and Matrix currently share the same Grid3X3 glyph.
  const getIcon = (type: string) => {
    switch (type) {
      case "Keyboard": return <Keyboard size={24} className="text-primary" />;
      case "Numpad": return <Calculator size={24} className="text-primary" />;
      case "Macropad": return <Grid3X3 size={24} className="text-primary" />;
      case "Matrix": return <Grid3X3 size={24} className="text-primary" />;
      default: return <Laptop size={24} className="text-gray-400" />;
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <button
          onClick={scanDevices}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          title="Refresh Hardware"
        >
          <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Hero: labeled bay layout, per UI_UX.md "Hero Section" (real 3D/SVG render is a later pass).
          Each bay carries its own icon + label so it's legible even when nothing is connected —
          color alone (the old version) told you nothing without already knowing the layout. */}
      <div className="bg-[#161616] rounded-xl border border-white/5 shadow-xl mb-6 p-8 flex items-center justify-center overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        <div className="flex gap-4 p-4 rounded-lg border border-[#3a3a3a] relative z-10">
          {[
            {
              label: "Matrix",
              icon: Grid3X3,
              connected: devices.some((d) => d.device_type === "Matrix"),
            },
            {
              label: "Keyboard",
              icon: Keyboard,
              connected: devices.some((d) => d.device_type === "Keyboard"),
            },
            {
              label: devices.some((d) => d.device_type === "Macropad") ? "Macropad" : "Numpad",
              icon: devices.some((d) => d.device_type === "Macropad") ? Grid3X3 : Calculator,
              connected: devices.some((d) => d.device_type === "Numpad" || d.device_type === "Macropad"),
            },
          ].map((bay) => (
            <div
              key={bay.label}
              className={`flex flex-col items-center justify-center gap-2 w-28 h-32 rounded-lg border-2 transition-colors ${
                bay.connected ? "border-primary bg-primary/5" : "border-[#333]"
              }`}
            >
              <bay.icon size={26} className={bay.connected ? "text-primary" : "text-gray-600"} />
              <span
                className={`text-xs font-medium uppercase tracking-wide ${
                  bay.connected ? "text-primary" : "text-gray-500"
                }`}
              >
                {bay.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Hardware Summary card: every value here comes from the last
            scan_devices result — no mock/placeholder content. */}
        <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-4">Hardware Summary</h3>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-4xl font-bold text-white">{devices.length}</span>
              <span className="relative flex h-3 w-3 mb-2">
                {devices.length > 0 && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${devices.length > 0 ? "bg-green-500" : "bg-gray-600"}`}></span>
              </span>
            </div>
            <div className="text-xs text-gray-400 font-mono">
              {devices.length === 1 ? "DEVICE CONNECTED" : "DEVICES CONNECTED"}
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-white/5 flex justify-between text-xs text-gray-400">
            <span>LAST SCAN</span>
            <span className="font-mono text-white">
              {lastScanned ? lastScanned.toLocaleTimeString() : "—"}
            </span>
          </div>
        </div>

        <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 shadow-xl">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-4">Connected Modules</h3>
          {devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm border-2 border-dashed border-white/5 rounded-lg">
              <Laptop size={24} className="mb-2 opacity-50" />
              <span>No Framework Detected</span>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((dev, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-black/40 rounded-lg border border-primary/20 hover:border-primary/50 transition-colors group">
                  <div className="p-2 bg-primary/10 rounded-md text-primary group-hover:bg-primary group-hover:text-black transition-colors">
                    {getIcon(dev.device_type)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">{dev.description}</div>
                    <div className="text-[10px] text-gray-400 font-mono">PID: 0x{dev.pid.toString(16).toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
