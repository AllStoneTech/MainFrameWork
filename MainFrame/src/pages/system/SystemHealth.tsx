import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Outlet } from "react-router-dom";
import { TabBar } from "../../components/ui/TabBar";

export type EcStatus = "Available" | "DriverMissing" | "NotFramework";

export interface SystemHealthContext {
  ecAvailable: boolean;
}

/**
 * Shell for the System Intelligence pillar. Checks EC driver availability
 * once and passes it down to child tabs via Outlet context — unlike the
 * old single-page version, the gate no longer blocks the whole section:
 * the Expansion tab (plain USB enumeration) stays usable regardless.
 */
export default function SystemHealth(): ReactElement {
  const [status, setStatus] = useState<EcStatus | null>(null);

  useEffect(() => {
    async function check(): Promise<void> {
      try {
        const res = await invoke<EcStatus>("check_ec_status");
        setStatus(res);
      } catch (err) {
        console.error(err);
        setStatus("NotFramework");
      }
    }
    check();
  }, []);

  return (
    <div className="p-8 h-full flex flex-col">
      <h1 className="text-3xl font-bold text-white mb-6">System Health</h1>

      <div className="mb-6">
        <TabBar
          items={[
            { to: "/system/thermal", label: "Thermal" },
            { to: "/system/battery", label: "Battery" },
            { to: "/system/expansion", label: "Expansion" },
            { to: "/system/sensors", label: "Sensors" },
          ]}
        />
      </div>

      <div className="flex-1 min-h-0">
        {status === null ? (
          <div className="text-gray-400">Checking Hardware Access...</div>
        ) : (
          <Outlet context={{ ecAvailable: status === "Available" } satisfies SystemHealthContext} />
        )}
      </div>
    </div>
  );
}
