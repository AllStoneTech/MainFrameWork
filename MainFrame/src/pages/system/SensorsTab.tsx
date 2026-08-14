import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Thermometer, Fan, Zap } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { DriverGate } from "./DriverGate";
import type { SystemHealthContext } from "./SystemHealth";

interface Sensor {
  id: string;
  label: string;
  unit: string;
  icon: typeof Thermometer;
  color: string;
  baseline: number;
  jitter: number;
}

const SENSORS: Sensor[] = [
  { id: "cpu_temp", label: "CPU Temp", unit: "°C", icon: Thermometer, color: "#ff8c00", baseline: 45, jitter: 6 },
  { id: "fan_rpm", label: "Fan Speed", unit: " RPM", icon: Fan, color: "#3b82f6", baseline: 2800, jitter: 400 },
  { id: "power_draw", label: "Power Draw", unit: "W", icon: Zap, color: "#22c55e", baseline: 18, jitter: 5 },
];

const HISTORY_LEN = 30;

function seedHistory(sensor: Sensor): number[] {
  return new Array(HISTORY_LEN).fill(sensor.baseline);
}

/**
 * Live telemetry strip, modeled on framework-control's sensor graphs.
 * Values are simulated locally (setInterval jitter around a baseline) —
 * no real polling of the EC yet.
 */
export default function SensorsTab(): ReactElement {
  const { ecAvailable } = useOutletContext<SystemHealthContext>();
  const [history, setHistory] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(SENSORS.map((s) => [s.id, seedHistory(s)]))
  );

  useEffect(() => {
    if (!ecAvailable) return;
    const interval = window.setInterval(() => {
      setHistory((prev) => {
        const next: Record<string, number[]> = {};
        for (const sensor of SENSORS) {
          const last = prev[sensor.id][prev[sensor.id].length - 1];
          const delta = (Math.random() - 0.5) * sensor.jitter * 0.4;
          const value = Math.max(0, last + delta);
          next[sensor.id] = [...prev[sensor.id].slice(1), value];
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [ecAvailable]);

  if (!ecAvailable) return <DriverGate />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {SENSORS.map((sensor) => {
        const series = history[sensor.id];
        const min = Math.min(...series);
        const max = Math.max(...series) || 1;
        const points = series
          .map((v, i) => {
            const x = (i / (series.length - 1)) * 100;
            const y = 40 - ((v - min) / (max - min || 1)) * 36 - 2;
            return `${x},${y}`;
          })
          .join(" ");
        const latest = series[series.length - 1];

        return (
          <Card key={sensor.id} className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <sensor.icon size={16} style={{ color: sensor.color }} />
              <span className="text-xs text-gray-400 uppercase tracking-wider">{sensor.label}</span>
            </div>
            <div className="text-2xl font-mono text-white mb-2">
              {latest.toFixed(sensor.id === "fan_rpm" ? 0 : 1)}
              <span className="text-sm text-gray-400">{sensor.unit}</span>
            </div>
            <svg viewBox="0 0 100 40" className="w-full h-10" preserveAspectRatio="none">
              <polyline points={points} fill="none" stroke={sensor.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </Card>
        );
      })}
    </div>
  );
}
