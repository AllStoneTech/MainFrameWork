// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Keyboard RGB Matrix control tab (Input Studio). See the EFFECTS catalog
 * comment below for important caveats about which effect names are
 * actually confirmed against real hardware, and the exported component's
 * doc comment for the live-apply/EEPROM-persist behavior.
 */
import type { ReactElement } from "react";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Keyboard as KeyboardIcon, Palette, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { SliderControl } from "../../components/ui/SliderControl";
import { loadSettings, patchSettings } from "../../lib/settings";

interface EffectDef {
  mode: number;
  name: string;
  confirmed?: boolean;
}

// The stock QMK RGB Matrix effect catalog, in firmware enum order — from
// quantum/rgb_matrix/animations/rgb_matrix_effects.inc, whose own comment
// says "order determines enum order." Mode 0 disables the matrix entirely.
//
// Only two entries are actually confirmed (see the `confirmed` flag and
// the banner below the list): mode 1 (Solid Color, lit up on real
// hardware) and mode 38 (Solid Reactive Multicross, straight from
// FrameworkComputer/qmk_hid's README — a Framework-specific effect name
// that doesn't even exist in generic upstream QMK). Tracing that name to
// its source file showed it's registered by a *second* independent
// #ifdef alongside the standard "Solid Reactive Cross" in the same file —
// so if Framework enables both (their docs say they enable all effects),
// that file alone contributes two enum slots instead of one, shifting
// every number after it. There may be other such insertions. Every other
// label below is a best-effort guess from generic ordering, not a
// confirmed fact — two attempts to match "Breathing" (modes 5, 25, 26)
// against what the keyboard actually does on its own all came up short.
const EFFECTS: EffectDef[] = [
  { mode: 0, name: "Off" },
  { mode: 1, name: "Solid Color", confirmed: true },
  { mode: 2, name: "Alpha Mods" },
  { mode: 3, name: "Gradient Up Down" },
  { mode: 4, name: "Gradient Left Right" },
  { mode: 5, name: "Breathing" },
  { mode: 6, name: "Colorband Sat" },
  { mode: 7, name: "Colorband Val" },
  { mode: 8, name: "Colorband Pinwheel Sat" },
  { mode: 9, name: "Colorband Pinwheel Val" },
  { mode: 10, name: "Colorband Spiral Sat" },
  { mode: 11, name: "Colorband Spiral Val" },
  { mode: 12, name: "Cycle All" },
  { mode: 13, name: "Cycle Left Right" },
  { mode: 14, name: "Cycle Up Down" },
  { mode: 15, name: "Rainbow Moving Chevron" },
  { mode: 16, name: "Cycle Out In" },
  { mode: 17, name: "Cycle Out In Dual" },
  { mode: 18, name: "Cycle Pinwheel" },
  { mode: 19, name: "Cycle Spiral" },
  { mode: 20, name: "Dual Beacon" },
  { mode: 21, name: "Rainbow Beacon" },
  { mode: 22, name: "Rainbow Pinwheels" },
  { mode: 23, name: "Raindrops" },
  { mode: 24, name: "Jellybean Raindrops" },
  { mode: 25, name: "Hue Breathing" },
  { mode: 26, name: "Hue Pendulum" },
  { mode: 27, name: "Hue Wave" },
  { mode: 28, name: "Pixel Rain" },
  { mode: 29, name: "Pixel Flow" },
  { mode: 30, name: "Pixel Fractal" },
  { mode: 31, name: "Typing Heatmap" },
  { mode: 32, name: "Digital Rain" },
  { mode: 33, name: "Solid Reactive Simple" },
  { mode: 34, name: "Solid Reactive" },
  { mode: 35, name: "Solid Reactive Wide" },
  { mode: 36, name: "Solid Reactive Cross" },
  { mode: 37, name: "Solid Reactive Nexus" },
  { mode: 38, name: "Solid Reactive Multicross", confirmed: true },
  { mode: 39, name: "Solid Splash" },
];

const SAVE_DEBOUNCE_MS = 800;

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * Keyboard RGB Matrix control. A full picker over the real firmware
 * effect catalog, plus independent color and brightness controls —
 * matching how VIA itself exposes RGB Matrix (three separate values, not
 * one bundled "effect"). Everything but color/brightness tweaking runs
 * entirely in firmware once an effect is selected; no host-side
 * polling, unlike the previous host-simulated Breathing/Rainbow/Reactive.
 * Changes apply live immediately; a debounced call commits them to the
 * keyboard's own EEPROM so they persist without MainFrameWork running.
 */
export default function LightingTab(): ReactElement {
  const [mode, setMode] = useState(1);
  const [color, setColor] = useState("#ff8c00");
  const [brightness, setBrightness] = useState(255);
  const [effectSpeed, setEffectSpeed] = useState(127);
  const [status, setStatus] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const loaded = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    loadSettings().then((settings) => {
      if (typeof settings.keyboard_effect_mode === "number") setMode(settings.keyboard_effect_mode);
      if (typeof settings.keyboard_color_hex === "string") setColor(settings.keyboard_color_hex);
      if (typeof settings.keyboard_brightness === "number") setBrightness(settings.keyboard_brightness);
      if (typeof settings.keyboard_effect_speed === "number") setEffectSpeed(settings.keyboard_effect_speed);
      if (typeof settings.keyboard_effect_banner_dismissed === "boolean") setBannerDismissed(settings.keyboard_effect_banner_dismissed);
      loaded.current = true;
    });
  }, []);

  const dismissBanner = (): void => {
    setBannerDismissed(true);
    patchSettings({ keyboard_effect_banner_dismissed: true }).catch((err) => console.error("Failed to save banner dismissal:", err));
  };

  const scheduleEepromSave = (): void => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      invoke("save_keyboard_lighting").catch((err) => console.error("Failed to save to keyboard EEPROM:", err));
    }, SAVE_DEBOUNCE_MS);
  };

  const handleEffectSelect = async (newMode: number): Promise<void> => {
    setMode(newMode);
    try {
      await invoke("set_keyboard_effect", { mode: newMode });
      await patchSettings({ keyboard_effect_mode: newMode });
      scheduleEepromSave();
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("Device Not Found");
    }
  };

  const handleColorChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const hex = e.target.value;
    setColor(hex);
    const [r, g, b] = hexToRgb(hex);
    try {
      await invoke("set_keyboard_color", { r, g, b });
      await patchSettings({ keyboard_color_hex: hex });
      scheduleEepromSave();
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("Device Not Found");
    }
  };

  const handleBrightnessChange = async (value: number): Promise<void> => {
    setBrightness(value);
    try {
      await invoke("set_keyboard_brightness", { brightness: value });
      await patchSettings({ keyboard_brightness: value });
      scheduleEepromSave();
    } catch (err) {
      console.error("Brightness update failed:", err);
    }
  };

  const handleEffectSpeedChange = async (value: number): Promise<void> => {
    setEffectSpeed(value);
    try {
      await invoke("set_keyboard_effect_speed", { speed: value });
      await patchSettings({ keyboard_effect_speed: value });
      scheduleEepromSave();
    } catch (err) {
      console.error("Effect speed update failed:", err);
    }
  };

  const activeEffectName = EFFECTS.find((fx) => fx.mode === mode)?.name ?? `Mode ${mode}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      <Card className="p-8 flex flex-col items-center justify-center min-h-[300px] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <KeyboardIcon
          size={120}
          color={color}
          className="mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-colors duration-300"
        />
        <div className="text-gray-400 font-medium">Framework Laptop 16 RGB</div>
        <div className="text-xs text-gray-500 mt-1">{activeEffectName}</div>
      </Card>

      <Card className="border border-white/10 p-6 flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="text-primary" size={24} />
          <h2 className="text-xl font-bold text-white">Lighting Control</h2>
        </div>

        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Color</label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={color}
                onChange={handleColorChange}
                className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-0 p-0"
              />
              <span className="text-white font-mono">{color.toUpperCase()}</span>
            </div>
          </div>
          <SliderControl label="Brightness" value={brightness} min={0} max={255} onChange={handleBrightnessChange} />
          <SliderControl label="Effect Speed" value={effectSpeed} min={0} max={255} onChange={handleEffectSpeedChange} />
        </div>

        {status && <div className="mb-4 p-3 rounded-lg text-sm font-medium bg-red-500/10 text-red-500">{status}</div>}

        <label className="block text-sm text-gray-400 mb-2">Effect ({EFFECTS.length} modes)</label>
        {!bannerDismissed && (
          <div className="flex items-start gap-2 mb-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs leading-relaxed">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">
              Only <span className="font-medium">Solid Color</span> and <span className="font-medium">Solid Reactive Multicross</span> (marked{" "}
              <CheckCircle2 size={11} className="inline -mt-0.5" />) are confirmed against Framework's own docs/hardware. The rest follow generic
              QMK ordering, which Framework's build doesn't exactly match — treat other names as a best guess, not fact.
            </span>
            <button
              onClick={dismissBanner}
              title="Dismiss"
              className="shrink-0 text-yellow-500/70 hover:text-yellow-500 -mt-0.5"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
          {EFFECTS.map((fx) => (
            <button
              key={fx.mode}
              onClick={() => handleEffectSelect(fx.mode)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                mode === fx.mode
                  ? "bg-primary/10 border border-primary/50 text-primary"
                  : "border border-transparent text-gray-300 hover:bg-white/5"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {fx.name}
                {fx.confirmed && <CheckCircle2 size={12} className="text-green-500" />}
              </span>
              <span className="text-xs font-mono text-gray-500">{fx.mode}</span>
            </button>
          ))}
        </div>

        <div className="pt-4 mt-4 border-t border-white/5">
          <p className="text-xs text-gray-400 leading-relaxed">
            Communicates via VIA's raw HID protocol (channel 0xFF60). Effects run entirely in firmware once
            selected. There's no "end color" setting in VIA — for effects like Gradient, Effect Speed is what
            actually controls how far the color shifts across the keyboard. Changes apply live immediately and
            save to the keyboard's EEPROM a moment after you stop adjusting, so they persist without
            MainFrameWork running.
          </p>
        </div>
      </Card>
    </div>
  );
}
