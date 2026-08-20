// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactElement } from "react";
import { ShieldAlert } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Shared "needs EC driver" gate shown in place of Thermal/Battery/Sensors
 * tab content when `check_ec_status` reports the CrosEC driver is missing.
 * The Expansion tab does not use this gate — bay occupancy is plain USB
 * enumeration and works without EC access per ARCHITECT.md's Tier 1/2 split.
 *
 * No install button here, disabled or otherwise: the only driver that could
 * unlock this (DHowett's community CrosEC driver) isn't signed for normal
 * use — installing it means enabling Windows test-signing mode and
 * disabling Secure Boot, which also triggers a BitLocker recovery-key
 * prompt on next boot. MainFrameWork won't automate or casually prompt for
 * that trade-off, so this screen states the real reason instead of
 * implying it's a "coming soon" build-it-eventually gap. See
 * installer.rs's doc comment and SECURITY.md for the full explanation.
 */
export function DriverGate(): ReactElement {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md text-center">
        <div className="bg-primary/20 p-6 rounded-full inline-block mb-6">
          <ShieldAlert size={64} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Fan / Battery / Sensor Access Unavailable</h2>
        <p className="text-gray-400 mb-4 leading-relaxed">
          This needs a Windows kernel driver at <span className="text-white font-mono text-sm">CrosEC</span>,
          which Windows doesn't ship. The only driver that provides it isn't signed for normal use —
          installing it requires disabling Secure Boot and enabling Windows test-signing mode, which also
          forces a BitLocker recovery-key prompt on your next boot.
        </p>
        <p className="text-gray-400 mb-8 leading-relaxed">
          MainFrameWork won't do that to your machine automatically, so this isn't wired up. If you
          understand that trade-off and want to install it yourself anyway, the driver and its
          installation steps are documented upstream.
        </p>

        <button
          onClick={() =>
            openUrl("https://github.com/DHowett/FrameworkWindowsUtils").catch((err: unknown) =>
              console.error("Failed to open link:", err)
            )
          }
          className="text-primary text-sm font-medium hover:underline"
        >
          View the driver project ↗
        </button>

        <p className="mt-6 text-xs text-gray-400">
          MainFrameWork will continue to function in "Portal Mode" (Input & Matrix) without this driver.
        </p>
      </div>
    </div>
  );
}
