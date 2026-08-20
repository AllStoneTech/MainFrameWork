// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Battery Guardian tab (System Health). See the exported component's doc
 * comment below for what is and isn't wired to the EC.
 */
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Thermometer, RotateCcw, BatteryCharging, Battery } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { SliderControl } from "../../components/ui/SliderControl";
import { DriverGate } from "./DriverGate";
import type { SystemHealthContext } from "./SystemHealth";

interface BatterySnapshot {
  charge_percentage: number;
  charging: boolean;
  discharging: boolean;
  level_critical: boolean;
  cycle_count: number;
  ac_present: boolean;
}

const POLL_INTERVAL_MS = 5000;

/**
 * Battery Guardian: real charge state (polled `get_battery_snapshot` every
 * 5s) plus a charge-limit slider wired to `get_charge_limit`/
 * `set_charge_limit` — both via ec_control.rs. The limit slider only
 * exposes max (the "stop charging at N%" trip point); min is read once on
 * mount and passed through unchanged on every update, since this UI has no
 * control for it.
 *
 * Discharge calibration stays local-state only — framework_lib doesn't
 * expose a "start calibration cycle" EC command, so there's nothing to
 * wire this button to yet. It says so directly rather than pretending
 * clicking it does something.
 */
export default function BatteryTab(): ReactElement {
  const { ecAvailable } = useOutletContext<SystemHealthContext>();
  const [snapshot, setSnapshot] = useState<BatterySnapshot | null>(null);
  const [limitMin, setLimitMin] = useState(0);
  const [limitMax, setLimitMax] = useState(80);
  const [limitLoaded, setLimitLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState(false);

  useEffect(() => {
    if (!ecAvailable) return;

    invoke<[number, number]>("get_charge_limit")
      .then(([min, max]) => {
        setLimitMin(min);
        setLimitMax(max);
        setLimitLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to read charge limit:", err);
        setLimitLoaded(true);
      });

    const poll = (): void => {
      invoke<BatterySnapshot>("get_battery_snapshot")
        .then(setSnapshot)
        .catch((err) => console.error("Failed to read battery snapshot:", err));
    };
    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ecAvailable]);

  if (!ecAvailable) return <DriverGate />;

  const handleLimitChange = async (max: number): Promise<void> => {
    setLimitMax(max);
    try {
      await invoke("set_charge_limit", { min: limitMin, max });
      setStatus(null);
    } catch (err) {
      setStatus(`Failed to set charge limit: ${err}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
              {snapshot?.charging ? <BatteryCharging size={20} /> : <Battery size={20} />}
            </div>
            <div>
              <h3 className="text-white font-bold">Battery</h3>
              <div className="text-xs text-gray-400">
                {snapshot === null
                  ? "READING..."
                  : `${snapshot.charging ? "CHARGING" : snapshot.discharging ? "DISCHARGING" : "IDLE"} · ${
                      snapshot.ac_present ? "AC CONNECTED" : "ON BATTERY"
                    } · ${snapshot.cycle_count} CYCLES`}
              </div>
            </div>
          </div>
          <span className="text-green-400 font-mono text-xl">
            {snapshot === null ? "—" : `${snapshot.charge_percentage}%`}
          </span>
        </div>

        {snapshot?.level_critical && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
            Battery level critical.
          </div>
        )}

        <div className="px-2">
          <SliderControl
            label="Stop charging at"
            value={limitMax}
            min={40}
            max={100}
            accentClassName="accent-green-500"
            onChange={handleLimitChange}
          />
          <div className="flex justify-between mt-2 text-[10px] text-gray-400 font-mono">
            <span>TRIP (40%)</span>
            <span>BALANCED (80%)</span>
            <span>MAX (100%)</span>
          </div>
          {!limitLoaded && <div className="mt-2 text-xs text-gray-500">Reading current limit from EC...</div>}
          {status && <div className="mt-2 text-xs text-red-500">{status}</div>}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/5 rounded-lg text-gray-300">
            <RotateCcw size={20} />
          </div>
          <div>
            <h3 className="text-white font-bold">Discharge Calibration</h3>
            <div className="text-xs text-gray-400">RECALIBRATE THE FUEL GAUGE</div>
          </div>
        </div>
        <p className="text-sm text-gray-400 mb-4 leading-relaxed">
          Fully discharges and recharges the battery once to correct drift between reported and
          actual capacity. Takes several hours and should be run while plugged in overnight.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCalibrating((c) => !c)}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
              calibrating ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-white/5 text-white hover:bg-white/10"
            }`}
          >
            {calibrating ? "Cancel Calibration" : "Start Calibration"}
          </button>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Thermometer size={12} /> Not wired to the EC — no command exists to actually start a
            calibration cycle yet.
          </span>
        </div>
      </Card>
    </div>
  );
}
