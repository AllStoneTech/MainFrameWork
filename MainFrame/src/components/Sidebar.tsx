// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Fixed-width left nav rendered by Layout on every page. The nav item
 * list is the single source of truth for the app's top-level routes —
 * keep it in sync with the route tree in App.tsx. The "Device Connected"
 * status pill below reflects a real `scan_devices` result, polled on an
 * interval since the Sidebar mounts once for the app's lifetime (Layout
 * wraps the route Outlet, it isn't remounted on navigation) and there's
 * no push-based hardware_update event from the Rust side yet to react to
 * hot-swaps instead.
 */
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Keyboard, Grid3X3, Cpu, Layers, Settings } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { StatusPill } from "./ui/StatusPill";
import astLogo from "../assets/AST_Icon_Trans_800.png";
import type { ConnectedDevice } from "../lib/types";

/** How often to re-poll `scan_devices` for the sidebar's connection pill, in ms. */
const DEVICE_POLL_INTERVAL_MS = 5000;

/** App-wide navigation sidebar with a live device-connection pill and the AllStoneTech footer link. */
export function Sidebar() {
  const [hasConnectedDevice, setHasConnectedDevice] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const result = await invoke<ConnectedDevice[]>("scan_devices");
        if (!cancelled) setHasConnectedDevice(result.length > 0);
      } catch (error) {
        console.error("Sidebar device poll failed:", error);
      }
    };

    poll();
    const interval = setInterval(poll, DEVICE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Keyboard, label: "Input Studio", path: "/input" },
    { icon: Grid3X3, label: "Matrix Studio", path: "/matrix" },
    { icon: Cpu, label: "System Health", path: "/system" },
    { icon: Layers, label: "Profiles", path: "/profiles" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  return (
    <div className="w-64 bg-[#1a1a1a] border-r border-[#333] flex flex-col h-screen">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Main<span className="text-primary">Frame</span>Work
        </h1>
        <p className="text-xs text-gray-400 mt-1">v0.1.0 • Portable</p>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-[#333] space-y-3">
        <StatusPill
          label={hasConnectedDevice ? "Device Connected" : "No Device"}
          variant={hasConnectedDevice ? "connected" : "disconnected"}
        />
        <button
          type="button"
          onClick={() =>
            openUrl("https://www.AllStoneTech.com").catch((err: unknown) => console.error("Failed to open link:", err))
          }
          title="Designed and Implemented by All Stone Tech"
          className="flex items-center justify-center w-full opacity-50 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-500"
        >
          <img src={astLogo} alt="All Stone Tech Logo" className="h-6 w-auto" />
        </button>
      </div>
    </div>
  );
}
