// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Pro Automator pillar page: lists per-app switching profiles and lets the
 * user pick which one is active. See the exported component's doc comment
 * below for what is and isn't wired up yet.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { Plus, AppWindow, Keyboard, Fan } from "lucide-react";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";

interface Profile {
  id: string;
  name: string;
  triggerApp: string | null;
  fanCurve: string;
  active: boolean;
}

// Shape mirrors the Profile record in Docs/DATA_SCHEMA.md
// (id/name/trigger_app/keymaps/fan_curve). Persistence via
// save_settings/load_settings is a follow-up.
const MOCK_PROFILES: Profile[] = [
  { id: "p_default", name: "Default", triggerApp: null, fanCurve: "curve_balanced", active: true },
  { id: "p_gaming", name: "Gaming", triggerApp: "steam.exe", fanCurve: "curve_aggressive", active: false },
  { id: "p_focus", name: "Focus", triggerApp: "code.exe", fanCurve: "curve_silent", active: false },
];

/**
 * Pro Automator pillar: profile list with per-app auto-switching per
 * CONCEPT.md. Selecting a profile is visual only for now — activation
 * doesn't yet push keymap/fan-curve state to the backend.
 */
export default function Profiles(): ReactElement {
  const [profiles, setProfiles] = useState<Profile[]>(MOCK_PROFILES);

  const activate = (id: string): void => {
    setProfiles((prev) => prev.map((p) => ({ ...p, active: p.id === id })));
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Profiles</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-bold rounded-lg hover:bg-orange-600 transition-colors">
          <Plus size={18} /> New Profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <EmptyState icon={Plus} message="No profiles yet" className="h-48" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              className={`p-5 cursor-pointer transition-colors ${
                profile.active ? "border-primary/50 bg-primary/5" : "hover:border-white/20"
              }`}
              onClick={() => activate(profile.id)}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">{profile.name}</h3>
                {profile.active && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-black">ACTIVE</span>
                )}
              </div>
              <div className="space-y-2 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <AppWindow size={14} className="text-gray-600" />
                  {profile.triggerApp ? `Auto-switch: ${profile.triggerApp}` : "Manual activation"}
                </div>
                <div className="flex items-center gap-2">
                  <Fan size={14} className="text-gray-600" />
                  {profile.fanCurve}
                </div>
                <div className="flex items-center gap-2">
                  <Keyboard size={14} className="text-gray-600" />
                  Default keymap
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
