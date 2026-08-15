// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Battery Guardian tab (System Health). See the exported component's doc
 * comment below for what is and isn't wired to the EC yet.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Thermometer, RotateCcw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { SliderControl } from "../../components/ui/SliderControl";
import { DriverGate } from "./DriverGate";
import type { SystemHealthContext } from "./SystemHealth";

/**
 * Battery Guardian: charge limit control plus a discharge calibration
 * section per CONCEPT.md's "Battery Guardian" feature pillar. Neither
 * control is wired to the EC yet — local state only.
 */
export default function BatteryTab(): ReactElement {
  const { ecAvailable } = useOutletContext<SystemHealthContext>();
  const [limit, setLimit] = useState(80);
  const [calibrating, setCalibrating] = useState(false);

  if (!ecAvailable) return <DriverGate />;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
              <Thermometer size={20} />
            </div>
            <div>
              <h3 className="text-white font-bold">Battery Limit</h3>
              <div className="text-xs text-gray-400">EXTEND LIFESPAN</div>
            </div>
          </div>
          <span className="text-green-400 font-mono text-xl">{limit}%</span>
        </div>

        <div className="px-2">
          <SliderControl label="" value={limit} min={40} max={100} accentClassName="accent-green-500" onChange={setLimit} />
          <div className="flex justify-between mt-2 text-[10px] text-gray-400 font-mono">
            <span>TRIP (40%)</span>
            <span>BALANCED (80%)</span>
            <span>MAX (100%)</span>
          </div>
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
        <button
          onClick={() => setCalibrating((c) => !c)}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
            calibrating ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-white/5 text-white hover:bg-white/10"
          }`}
        >
          {calibrating ? "Cancel Calibration" : "Start Calibration"}
        </button>
      </Card>
    </div>
  );
}
