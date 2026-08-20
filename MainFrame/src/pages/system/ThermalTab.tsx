// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Fan curve editor tab (System Health). See the exported component's doc
 * comment below for what is and isn't wired to the EC.
 */
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Activity } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { DriverGate } from "./DriverGate";
import type { SystemHealthContext } from "./SystemHealth";

interface CurvePoint {
  tempC: number;
  dutyPct: number;
}

interface ThermalSnapshot {
  temps_celsius: [string, number][];
  fans_rpm: [string, number][];
}

const INITIAL_CURVE: CurvePoint[] = [
  { tempC: 30, dutyPct: 10 },
  { tempC: 50, dutyPct: 25 },
  { tempC: 70, dutyPct: 55 },
  { tempC: 85, dutyPct: 80 },
  { tempC: 95, dutyPct: 100 },
];

const GRAPH_W = 500;
const GRAPH_H = 220;
const TEMP_MIN = 20;
const TEMP_MAX = 100;
const POLL_INTERVAL_MS = 2000;

// Map a curve point's domain values (temp in °C, duty in %) onto SVG
// viewBox pixel coordinates. Duty is inverted (0% -> bottom, 100% -> top)
// since SVG y grows downward.
const xForTemp = (t: number): number => ((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * GRAPH_W;
const yForDuty = (d: number): number => GRAPH_H - (d / 100) * GRAPH_H;

/**
 * Draggable fan curve editor, modeled on framework-control's curve editor
 * (drag points + live crosshair overlay). The curve shape is local state
 * only, dragging never touches the EC by itself — but the header's temp
 * and RPM readout is now real (polled `get_thermal_snapshot` every 2s via
 * ec_control.rs), and "Apply Curve Now" sends the duty the curve currently
 * implies at the hottest reported sensor via `set_fan_duty`. There's no
 * background loop that continuously re-applies the curve as temperature
 * changes — that's a real control loop with its own safety questions
 * (what happens if MainFrameWork crashes mid-curve, EC comms hiccup, etc.)
 * deliberately left for a later pass rather than shipped in this one.
 * "Auto" hands control back to the EC's own fan logic via `set_fan_auto`.
 */
export default function ThermalTab(): ReactElement {
  const { ecAvailable } = useOutletContext<SystemHealthContext>();
  const [curve, setCurve] = useState<CurvePoint[]>(INITIAL_CURVE);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<ThermalSnapshot | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ecAvailable) return;
    const poll = (): void => {
      invoke<ThermalSnapshot>("get_thermal_snapshot")
        .then(setSnapshot)
        .catch((err) => console.error("Failed to read thermal snapshot:", err));
    };
    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ecAvailable]);

  if (!ecAvailable) return <DriverGate />;

  const pathD = curve
    .map((p, i) => `${i === 0 ? "M" : "L"}${xForTemp(p.tempC)},${yForDuty(p.dutyPct)}`)
    .join(" ");

  const handleDrag = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (dragIndex === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * GRAPH_H;
    const dutyPct = Math.round(Math.max(0, Math.min(100, 100 - (y / GRAPH_H) * 100)));
    setCurve((prev) => prev.map((p, i) => (i === dragIndex ? { ...p, dutyPct } : p)));
  };

  const temps = snapshot?.temps_celsius.map(([, c]) => c) ?? [];
  const hottestTemp = temps.length > 0 ? Math.max(...temps) : null;
  const firstFanRpm = snapshot?.fans_rpm[0]?.[1] ?? null;
  const currentDuty =
    hottestTemp === null ? null : curve.reduce((acc, p) => (hottestTemp >= p.tempC ? p.dutyPct : acc), curve[0].dutyPct);

  const applyCurve = async (): Promise<void> => {
    if (currentDuty === null) return;
    setStatus("Applying...");
    try {
      await invoke("set_fan_duty", { fan: null, percent: currentDuty });
      setStatus(`Applied ${currentDuty}% duty`);
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus(`Error: ${err}`);
    }
  };

  const setAuto = async (): Promise<void> => {
    setStatus("Setting auto...");
    try {
      await invoke("set_fan_auto", { fan: null });
      setStatus("EC auto control restored");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus(`Error: ${err}`);
    }
  };

  return (
    <Card className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
            <Activity size={20} />
          </div>
          <div>
            <h3 className="text-white font-bold">Fan Curve</h3>
            <div className="text-xs text-gray-400">
              HOTTEST SENSOR: {hottestTemp === null ? "reading..." : `${hottestTemp}°C`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-blue-400 font-mono text-xl block">{firstFanRpm ?? "—"}</span>
          <span className="text-xs text-gray-400">RPM (live)</span>
        </div>
      </div>

      <div className="flex-1 bg-[#111] rounded-lg border border-white/5 p-4 relative min-h-[240px]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
          className="w-full h-full text-blue-500"
          onPointerMove={handleDrag}
          onPointerUp={() => setDragIndex(null)}
          onPointerLeave={() => setDragIndex(null)}
        >
          <defs>
            <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((frac) => (
            <line key={frac} x1="0" y1={GRAPH_H * frac} x2={GRAPH_W} y2={GRAPH_H * frac} stroke="#333" strokeWidth="0.5" strokeDasharray="4" />
          ))}
          <path d={`${pathD} L${GRAPH_W},${GRAPH_H} L0,${GRAPH_H} Z`} fill="url(#glow)" stroke="none" />
          <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" />
          {curve.map((p, i) => (
            <circle
              key={i}
              cx={xForTemp(p.tempC)}
              cy={yForDuty(p.dutyPct)}
              r={dragIndex === i ? 7 : 5}
              fill="currentColor"
              stroke="#111"
              strokeWidth="2"
              className="cursor-ns-resize"
              onPointerDown={(e) => {
                (e.target as SVGCircleElement).setPointerCapture(e.pointerId);
                setDragIndex(i);
              }}
            />
          ))}
        </svg>
        <div className="absolute bottom-2 left-4 text-[10px] text-gray-400 font-mono">{TEMP_MIN}&deg;C</div>
        <div className="absolute bottom-2 right-4 text-[10px] text-gray-400 font-mono">{TEMP_MAX}&deg;C</div>
      </div>

      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <p className="text-xs text-gray-400">Drag points vertically to adjust fan duty at each temperature step.</p>
        <div className="flex items-center gap-2">
          {status && <span className="text-xs text-gray-400">{status}</span>}
          <button
            onClick={setAuto}
            className="px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 text-gray-400 hover:text-white text-xs font-medium"
          >
            Auto
          </button>
          <button
            onClick={applyCurve}
            disabled={currentDuty === null}
            className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Curve Now ({currentDuty ?? "—"}%)
          </button>
        </div>
      </div>
    </Card>
  );
}
