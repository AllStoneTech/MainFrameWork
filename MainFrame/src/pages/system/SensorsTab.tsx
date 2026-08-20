// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Live telemetry tab (System Health). See the exported component's doc
 * comment below for where these values actually come from.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Thermometer, Fan, Zap } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { DriverGate } from "./DriverGate";
import type { SystemHealthContext } from "./SystemHealth";

interface ThermalSnapshot {
  temps_celsius: [string, number][];
  fans_rpm: [string, number][];
}

interface BatterySnapshot {
  power_draw_watts: number;
}

interface Reading {
  id: string;
  label: string;
  unit: string;
  icon: typeof Thermometer;
  color: string;
  value: number;
  decimals: number;
}

const HISTORY_LEN = 30;
const POLL_INTERVAL_MS = 2000;

function seedHistory(value: number): number[] {
  return new Array(HISTORY_LEN).fill(value);
}

/**
 * Live telemetry strip, modeled on framework-control's sensor graphs.
 * Polls `get_thermal_snapshot` (temps + fan RPM) and `get_battery_snapshot`
 * (power draw) every 2s via `ec_control.rs` — real EC data on Linux, not
 * simulated. Each poll's readings are built into a fresh card list since
 * the EC can report a different number of temp sensors/fans depending on
 * platform (see ec_control.rs's doc comment); history is kept per label so
 * a card doesn't lose its sparkline if the set of reported sensors is
 * stable, which in practice it always is within one boot.
 *
 * Power draw is a soft-fail: some boards (e.g. no battery present) won't
 * report it, and that shouldn't take down the temp/fan cards next to it.
 */
export default function SensorsTab(): ReactElement {
  const { ecAvailable } = useOutletContext<SystemHealthContext>();
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ecAvailable) return;

    const poll = async (): Promise<void> => {
      try {
        const thermal = await invoke<ThermalSnapshot>("get_thermal_snapshot");
        const readings: Record<string, number> = {};
        for (const [label, celsius] of thermal.temps_celsius) readings[`temp:${label}`] = celsius;
        for (const [label, rpm] of thermal.fans_rpm) readings[`fan:${label}`] = rpm;

        try {
          const battery = await invoke<BatterySnapshot>("get_battery_snapshot");
          readings["power:Power Draw"] = battery.power_draw_watts;
        } catch {
          // No battery, or EC doesn't report it on this board — fine, just
          // don't add a power card this poll.
        }

        setHistory((prev) => {
          const next: Record<string, number[]> = {};
          for (const [key, value] of Object.entries(readings)) {
            next[key] = [...(prev[key] ?? seedHistory(value)).slice(-HISTORY_LEN + 1), value];
          }
          return next;
        });
        setError(null);
      } catch (err) {
        setError(String(err));
      }
    };

    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ecAvailable]);

  if (!ecAvailable) return <DriverGate />;

  const readings: Reading[] = Object.keys(history)
    .sort()
    .map((key) => {
      const [kind, label] = key.split(":");
      const value = history[key][history[key].length - 1];
      if (kind === "temp") {
        return { id: key, label, unit: "°C", icon: Thermometer, color: "#ff8c00", value, decimals: 1 };
      }
      if (kind === "fan") {
        return { id: key, label, unit: " RPM", icon: Fan, color: "#3b82f6", value, decimals: 0 };
      }
      return { id: key, label, unit: "W", icon: Zap, color: "#22c55e", value, decimals: 1 };
    });

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
          Failed to read sensors: {error}
        </div>
      )}
      {readings.length === 0 && !error && <div className="text-sm text-gray-500">Reading sensors...</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {readings.map((reading) => {
          const series = history[reading.id];
          const min = Math.min(...series);
          const max = Math.max(...series) || 1;
          const points = series
            .map((v, i) => {
              const x = (i / (series.length - 1)) * 100;
              const y = 40 - ((v - min) / (max - min || 1)) * 36 - 2;
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <Card key={reading.id} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <reading.icon size={16} style={{ color: reading.color }} />
                <span className="text-xs text-gray-400 uppercase tracking-wider">{reading.label}</span>
              </div>
              <div className="text-2xl font-mono text-white mb-2">
                {reading.value.toFixed(reading.decimals)}
                <span className="text-sm text-gray-400">{reading.unit}</span>
              </div>
              <svg viewBox="0 0 100 40" className="w-full h-10" preserveAspectRatio="none">
                <polyline
                  points={points}
                  fill="none"
                  stroke={reading.color}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
