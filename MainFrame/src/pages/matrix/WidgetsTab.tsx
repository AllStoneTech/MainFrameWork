// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Widget composer tab (Matrix Studio). See the exported component's doc
 * comment below for the three-pane layout and persistence model.
 */
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Clock, BatteryMedium, Cpu, AudioLines, GripVertical, X, Play, Pause } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PixelGrid } from "../../components/ui/PixelGrid";
import { EmptyState } from "../../components/ui/EmptyState";
import { loadSettings, patchSettings } from "../../lib/settings";
import { composeWidgetLayout, type WidgetType, type WidgetInstance, type ClockFormat, type ClockStyle } from "../../lib/matrixWidgets";
import type { HardwareSummary } from "../../lib/types";
import type { MatrixStudioContext } from "./MatrixStudio";

const WIDTH = 9;
const HEIGHT = 34;
const SETTINGS_KEY = "matrix_widgets";
const CLOCK_TICK_MS = 1000;
// How many clock ticks between hardware-poll refreshes — battery/CPU
// don't need per-second freshness, and EC/sysinfo reads aren't free.
// Matches BatteryTab.tsx's own 5000ms poll interval.
const HARDWARE_POLL_TICKS = 5;

interface BatterySnapshot {
  charge_percentage: number;
}

interface WidgetDef {
  type: WidgetType;
  label: string;
  icon: typeof Clock;
  /** False for widgets with no real data source yet (Audio EQ needs live
   * system audio capture, which this app doesn't have) — disabled in the
   * palette rather than silently rendering blank once added. */
  implemented: boolean;
}

// Persisted layout only stores {type, id, clockFormat?, clockStyle?} —
// icon/label are re-derived from PALETTE on load, since component
// references aren't JSON-serializable.
interface PlacedWidget extends WidgetDef {
  id: string;
  clockFormat?: ClockFormat;
  clockStyle?: ClockStyle;
}
interface SavedWidget {
  type: WidgetType;
  id: string;
  clockFormat?: ClockFormat;
  clockStyle?: ClockStyle;
}

const PALETTE: WidgetDef[] = [
  { type: "clock", label: "Clock", icon: Clock, implemented: true },
  { type: "battery", label: "Battery", icon: BatteryMedium, implemented: true },
  { type: "cpu", label: "CPU Load", icon: Cpu, implemented: true },
  { type: "eq", label: "Audio EQ", icon: AudioLines, implemented: false },
];

/**
 * Widget composer for the Matrix Studio "Widgets" tab, modeled on FWMM's
 * three-pane pattern: a live preview on the left, the active layout
 * (ordered widget stack) in the middle, and a widget palette on the
 * right. Renders Clock/Battery/CPU Load into the panel via
 * `matrixWidgets.ts` — Audio EQ is disabled in the palette (see
 * `WidgetDef.implemented`'s doc comment) rather than added and silently
 * doing nothing. Only one of each widget type can be placed at once —
 * the layout has no concept of two Clocks (or two of anything) sharing
 * or competing for the same slice.
 *
 * Battery is *also* disabled on a machine without EC access — its
 * backend command needs the same `CrosEC` driver check_ec_status
 * reports for System Health's Thermal/Battery/Sensors tabs (see
 * DriverGate.tsx), and this app won't fake a value it can't actually
 * read. On Windows without that driver this reads as visibly disabled
 * with an explanation, rather than being addable and just sitting blank
 * forever with no indication why.
 *
 * The preview pane always reflects the current layout live (it's just
 * local state, no hardware involved), but actually pushing that same
 * buffer to the real LED Matrix is gated behind the "Start Live Render"
 * toggle — matching this app's existing convention elsewhere in Matrix
 * Studio (EditorTab's Play button) of never writing to hardware just
 * because a tab is open. That also means, deliberately, that the live
 * render only runs while this tab stays mounted — it doesn't keep
 * running in the background if you navigate away or the window is
 * hidden to the tray; making it a true ambient/always-on display would
 * need its own background loop (like `power_watch.rs`'s), which is a
 * further step beyond this pass. Layout persists to the same encrypted
 * settings blob LightingTab uses.
 */
export default function WidgetsTab(): ReactElement {
  const { panel } = useOutletContext<MatrixStudioContext>();
  const [layout, setLayout] = useState<PlacedWidget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [cpuPercent, setCpuPercent] = useState<number | null>(null);
  const [ecAvailable, setEcAvailable] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const loaded = useRef(false);
  const tickCount = useRef(0);

  useEffect(() => {
    loadSettings().then((settings) => {
      const saved = (settings[SETTINGS_KEY] as SavedWidget[] | undefined) ?? [];
      const restored = saved
        .map((w) => {
          const def = PALETTE.find((p) => p.type === w.type);
          if (!def) return null;
          const widget: PlacedWidget = { ...def, id: w.id };
          if (w.clockFormat) widget.clockFormat = w.clockFormat;
          if (w.clockStyle) widget.clockStyle = w.clockStyle;
          return widget;
        })
        .filter((w): w is PlacedWidget => w !== null);
      setLayout(restored);
      loaded.current = true;
    });
    invoke<string>("check_ec_status")
      .then((status) => setEcAvailable(status === "Available"))
      .catch((err) => {
        console.error("Widgets: check_ec_status failed, treating EC as unavailable:", err);
        setEcAvailable(false);
      });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const toSave: SavedWidget[] = layout.map((w) => ({
      type: w.type,
      id: w.id,
      clockFormat: w.clockFormat,
      clockStyle: w.clockStyle,
    }));
    patchSettings({ [SETTINGS_KEY]: toSave }).catch((err) => console.error("Failed to save widget layout:", err));
  }, [layout]);

  // Ticks the preview's clock every second and refreshes battery/CPU
  // every HARDWARE_POLL_TICKS-th tick — runs regardless of `rendering`
  // so the preview pane stays live even before you start pushing to the
  // physical panel.
  useEffect(() => {
    const fetchHardware = (): void => {
      invoke<BatterySnapshot>("get_battery_snapshot")
        .then((s) => setBatteryPercent(s.charge_percentage))
        .catch((err) => console.error("Widgets: battery poll failed:", err));
      invoke<HardwareSummary>("get_hardware_summary")
        .then((s) => setCpuPercent(s.cpu_usage_percent))
        .catch((err) => console.error("Widgets: CPU poll failed:", err));
    };
    fetchHardware();

    const interval = window.setInterval(() => {
      setNow(new Date());
      tickCount.current += 1;
      if (tickCount.current % HARDWARE_POLL_TICKS === 0) fetchHardware();
    }, CLOCK_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  const composedBuffer = useMemo(() => {
    const instances: WidgetInstance[] = layout.map((w) => ({
      type: w.type,
      clockFormat: w.clockFormat,
      clockStyle: w.clockStyle,
    }));
    return composeWidgetLayout(instances, WIDTH, HEIGHT, { now, batteryPercent, cpuPercent });
  }, [layout, now, batteryPercent, cpuPercent]);

  // Pushes the composed buffer to the real panel once per tick while
  // `rendering` is on — `composedBuffer` gets a new value on every clock
  // tick above (and whenever the layout changes), so reacting to it here
  // naturally throttles to one push per tick rather than needing a
  // second interval of its own.
  useEffect(() => {
    if (!rendering) return;
    invoke("update_matrix", { imgData: composedBuffer, panel }).catch((err) => {
      console.error("Widgets live render push failed:", err);
      setRenderError(String(err));
    });
  }, [composedBuffer, rendering, panel]);

  const toggleRendering = (): void => {
    setRenderError(null);
    setRendering((r) => !r);
  };

  const isPlaced = (type: WidgetType): boolean => layout.some((w) => w.type === type);

  const addWidget = (def: WidgetDef): void => {
    if (!def.implemented || isPlaced(def.type)) return;
    if (def.type === "battery" && !ecAvailable) return;
    const widget: PlacedWidget = { ...def, id: `${def.type}-${Date.now()}` };
    if (def.type === "clock") {
      widget.clockFormat = "24h";
      widget.clockStyle = "digital";
    }
    setLayout((prev) => [...prev, widget]);
  };

  const removeWidget = (id: string): void => {
    setLayout((prev) => prev.filter((w) => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateClockConfig = (id: string, patch: Partial<Pick<PlacedWidget, "clockFormat" | "clockStyle">>): void => {
    setLayout((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  return (
    <div className="grid grid-cols-[1fr_320px_260px] gap-6 h-full">
      <Card className="p-6 flex flex-col items-center justify-center">
        <div className="bg-black/80 rounded-xl border border-gray-800 p-6">
          <PixelGrid width={WIDTH} height={HEIGHT} pixels={composedBuffer} interactive={false} cellSize={14} gap={3} />
        </div>
        <button
          onClick={toggleRendering}
          disabled={layout.length === 0}
          className={`flex items-center gap-2 mt-4 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            rendering ? "bg-red-500 text-white hover:bg-red-600" : "bg-primary text-black hover:bg-orange-600"
          }`}
        >
          {rendering ? <Pause size={16} /> : <Play size={16} />}
          {rendering ? "Stop Live Render" : "Start Live Render"}
        </button>
        {renderError && <p className="text-xs text-red-500 mt-2 max-w-xs text-center break-all">{renderError}</p>}
        <p className="text-xs text-gray-500 mt-2 text-center max-w-xs">
          Preview updates live either way — this only controls whether it's also pushed to {panel}.
        </p>
      </Card>

      <Card className="p-4 flex flex-col">
        <h3 className="text-sm font-bold text-white mb-3 px-2">Active Layout</h3>
        {layout.length === 0 ? (
          <EmptyState icon={GripVertical} message="Add widgets from the palette" className="flex-1" />
        ) : (
          <div className="space-y-2 flex-1 overflow-auto">
            {layout.map((widget) => (
              <div key={widget.id}>
                <button
                  onClick={() => setSelectedId(widget.id === selectedId ? null : widget.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                    selectedId === widget.id
                      ? "bg-primary/10 border-primary/40"
                      : "bg-black/20 border-white/5 hover:border-white/20"
                  }`}
                >
                  <GripVertical size={14} className="text-gray-600" />
                  <widget.icon size={16} className="text-primary" />
                  <span className="text-sm text-white flex-1">{widget.label}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWidget(widget.id);
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </span>
                </button>
                {widget.type === "battery" && !ecAvailable && (
                  <p className="text-xs text-red-400/80 px-3 mt-1">
                    Unavailable — needs the Framework EC driver (see System Health).
                  </p>
                )}
                {widget.type === "clock" && selectedId === widget.id && (
                  <div className="p-3 mt-1 bg-black/20 rounded-lg border border-white/5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-16">Format</span>
                      {(["24h", "12h"] as const).map((format) => (
                        <button
                          key={format}
                          onClick={() => updateClockConfig(widget.id, { clockFormat: format })}
                          className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                            (widget.clockFormat ?? "24h") === format
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                          }`}
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-16">Style</span>
                      {(["digital", "analog"] as const).map((style) => (
                        <button
                          key={style}
                          onClick={() => updateClockConfig(widget.id, { clockStyle: style })}
                          className={`px-2 py-1 rounded text-xs font-medium border capitalize transition-colors ${
                            (widget.clockStyle ?? "digital") === style
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "bg-black/20 border-white/10 text-gray-400 hover:text-white"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-white mb-3 px-2">Widget Palette</h3>
        <div className="space-y-2">
          {PALETTE.map((def) => {
            const placed = isPlaced(def.type);
            const ecBlocked = def.type === "battery" && !ecAvailable;
            const disabled = !def.implemented || placed || ecBlocked;
            const badge = placed ? "Added" : !def.implemented ? "Soon" : ecBlocked ? "No EC" : null;
            const title = !def.implemented
              ? "Needs live system audio capture — not implemented yet"
              : placed
                ? "Already in your layout — only one of each widget at a time"
                : ecBlocked
                  ? "Needs the Framework EC driver — unavailable on this machine (see System Health)"
                  : undefined;
            return (
              <button
                key={def.type}
                onClick={() => addWidget(def)}
                disabled={disabled}
                title={title}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-black/20 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/5 disabled:hover:bg-black/20"
              >
                <def.icon size={16} className="text-gray-400" />
                <span className="text-sm text-gray-300">{def.label}</span>
                {badge && <span className="text-xs text-gray-500 ml-auto">{badge}</span>}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
