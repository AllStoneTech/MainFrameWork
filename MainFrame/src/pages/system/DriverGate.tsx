import type { ReactElement } from "react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldAlert, Download } from "lucide-react";

/**
 * Shared "needs EC driver" gate shown in place of Thermal/Battery/Sensors
 * tab content when `check_ec_status` reports the CrosEC driver is missing.
 * The Expansion tab does not use this gate — bay occupancy is plain USB
 * enumeration and works without EC access per ARCHITECT.md's Tier 1/2 split.
 */
export function DriverGate(): ReactElement {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async (): Promise<void> => {
    setInstalling(true);
    try {
      await invoke("install_driver");
      alert("Driver Simulation Successful. Please restart the app.");
      window.location.reload();
    } catch (err) {
      alert("Installation Failed: " + err);
      setInstalling(false);
    }
  };

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
          onClick={handleInstall}
          disabled={installing}
          className="bg-primary hover:bg-orange-600 text-black font-bold py-3 px-6 rounded-lg flex items-center gap-2 mx-auto transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {installing ? (
            <div className="animate-spin w-5 h-5 border-2 border-black border-t-transparent rounded-full" />
          ) : (
            <Download size={20} />
          )}
          {installing ? "Installing..." : "Install CrosEC Driver"}
        </button>

        <p className="mt-6 text-xs text-gray-400">
          MainFrameWork will continue to function in "Portal Mode" (Input & Matrix) without this driver.
        </p>
      </div>
    </div>
  );
}
