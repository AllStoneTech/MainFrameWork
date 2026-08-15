// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Fan curve editor tab (System Health). See the exported component's doc
 * comment below for what is and isn't wired to the EC yet.
 */
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Activity } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { DriverGate } from "./DriverGate";
import type { SystemHealthContext } from "./SystemHealth";

interface CurvePoint {
  tempC: number;
  dutyPct: number;
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

// Map a curve point's domain values (temp in °C, duty in %) onto SVG
// viewBox pixel coordinates. Duty is inverted (0% -> bottom, 100% -> top)
// since SVG y grows downward.
const xForTemp = (t: number): number => ((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * GRAPH_W;
const yForDuty = (d: number): number => GRAPH_H - (d / 100) * GRAPH_H;

/**
 * Draggable fan curve editor, modeled on framework-control's curve editor
 * (drag points + live crosshair overlay). Curve points are local state
 * only — no `#[tauri::command]` writes the curve to the EC yet.
 */
export default function ThermalTab(): ReactElement {
  const { ecAvailable } = useOutletContext<SystemHealthContext>();
  const [curve, setCurve] = useState<CurvePoint[]>(INITIAL_CURVE);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const currentTemp = 42;
  const currentDuty = curve.reduce((acc, p) => (currentTemp >= p.tempC ? p.dutyPct : acc), curve[0].dutyPct);

  return (
    <Card className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
            <Activity size={20} />
          </div>
          <div>
            <h3 className="text-white font-bold">Fan Curve</h3>
            <div className="text-xs text-gray-400">CPU TEMP: {currentTemp}&deg;C</div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-blue-400 font-mono text-xl block">{Math.round(currentDuty * 34)}</span>
          <span className="text-xs text-gray-400">RPM (est.)</span>
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
      <p className="text-xs text-gray-400 mt-3">Drag points vertically to adjust fan duty at each temperature step.</p>
    </Card>
  );
}
