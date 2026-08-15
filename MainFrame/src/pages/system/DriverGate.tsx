// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactElement } from "react";
import { ShieldAlert, Clock } from "lucide-react";

/**
 * Shared "needs EC driver" gate shown in place of Thermal/Battery/Sensors
 * tab content when `check_ec_status` reports the CrosEC driver is missing.
 * The Expansion tab does not use this gate — bay occupancy is plain USB
 * enumeration and works without EC access per ARCHITECT.md's Tier 1/2 split.
 *
 * The install button is intentionally disabled: the backend's
 * `install_driver` command (installer.rs) doesn't install anything yet, so
 * there is nothing here to wire up until that's implemented for real.
 */
export function DriverGate(): ReactElement {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md text-center">
        <div className="bg-primary/20 p-6 rounded-full inline-block mb-6">
          <ShieldAlert size={64} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Pro Features Locked</h2>
        <p className="text-gray-400 mb-8 leading-relaxed">
          Direct hardware access (Fans, Battery Limit, Sensors) requires the
          <span className="text-white font-medium"> CrosEC Kernel Driver</span>.
          <br />
          Windows does not expose this by default.
        </p>

        <button
          disabled
          className="bg-gray-700 text-gray-400 font-bold py-3 px-6 rounded-lg flex items-center gap-2 mx-auto cursor-not-allowed"
        >
          <Clock size={20} />
          Coming Soon
        </button>

        <p className="mt-6 text-xs text-gray-400">
          MainFrameWork will continue to function in "Portal Mode" (Input & Matrix) without this driver.
        </p>
      </div>
    </div>
  );
}
