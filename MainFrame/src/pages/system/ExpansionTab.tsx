import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Grid3X3, RefreshCw, Info } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";

interface ConnectedDevice {
  vid: number;
  pid: number;
  description: string;
  device_type: string;
}

/**
 * Detected Expansion Cards, sourced from the same `scan_devices` USB scan
 * as the Dashboard. Only cards with their own chip/firmware — HDMI/
 * DisplayPort and Audio, per device_manager.rs's PID table — can be
 * identified this way. Plain USB-A/USB-C/SD/Storage/Ethernet cards are
 * passive pass-throughs with no identity of their own, so they can't be
 * shown here; this intentionally isn't a fixed 6-slot grid anymore, since
 * that implied a precision of detection that doesn't exist in practice.
 */
export default function ExpansionTab(): ReactElement {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const scan = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await invoke<ConnectedDevice[]>("scan_devices");
      setDevices(result.filter((d) => d.device_type === "Expansion"));
    } catch (error) {
      console.error("Expansion scan failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scan();
  }, []);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Grid3X3 size={20} />
          </div>
          <div>
            <h3 className="text-white font-bold">Expansion Cards</h3>
            <div className="text-xs text-gray-400">DETECTED VIA USB</div>
          </div>
        </div>
        <button
          onClick={scan}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {devices.length === 0 ? (
        <EmptyState icon={Grid3X3} message="No firmware-identifiable expansion cards detected" className="h-32" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {devices.map((dev) => (
            <div
              key={`${dev.vid}-${dev.pid}`}
              className="flex items-center gap-3 p-3 bg-black/40 rounded-lg border border-primary/20"
            >
              <div className="p-2 bg-primary/10 rounded-md text-primary">
                <Grid3X3 size={20} />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{dev.description}</div>
                <div className="text-[10px] text-gray-400 font-mono">PID: 0x{dev.pid.toString(16).toUpperCase()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 p-3 rounded-lg bg-black/20 border border-white/5 text-xs text-gray-400 leading-relaxed">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          Only cards with their own chip — HDMI/DisplayPort and Audio — can be identified this way. Plain USB-A,
          USB-C, SD, Storage, and Ethernet cards are passive pass-throughs with no identity of their own; they
          can't be detected until something is plugged into them, and Framework doesn't expose per-bay occupancy
          for them in software.
        </span>
      </div>
    </Card>
  );
}
