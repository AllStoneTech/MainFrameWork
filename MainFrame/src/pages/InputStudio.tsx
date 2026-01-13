import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Keyboard as KeyboardIcon, Palette } from "lucide-react";
export default function InputStudio() {
  const [color, setColor] = useState("#ff8c00");
  const [status, setStatus] = useState("");

  // Load saved color on mount
  useEffect(() => {
    async function load() {
      try {
        const settingsStr = await invoke<string>("load_settings");
        const settings = JSON.parse(settingsStr);
        if (settings.keyboard_color_hex) {
          setColor(settings.keyboard_color_hex);
          // Apply it to hardware immediately too? Maybe later.
        }
      } catch (e) {
        console.log("No settings found or load failed", e);
      }
    }
    load();
  }, []);

  const handleColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setColor(hex);

    // Convert Hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    try {
      await invoke("set_keyboard_color", { r, g, b });
      
      // Save to Disk
      const settingsStr = await invoke<string>("load_settings").catch(() => "{}");
      const settings = JSON.parse(settingsStr);
      settings.keyboard_color_hex = hex;
      await invoke("save_settings", { settingsJson: JSON.stringify(settings) });

      setStatus("Color Updated & Saved");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      console.error(err);
      setStatus("Device Not Found");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-6">Input Studio</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Visualizer Card */}
        <div className="bg-[#2a2a2a] rounded-xl border border-white/5 p-8 flex flex-col items-center justify-center min-h-[300px] shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          
          <KeyboardIcon 
            size={120} 
            color={color}
            className="mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-colors duration-300"
          />
          <div className="text-gray-400 font-medium">Framework Laptop 16 RGB</div>
        </div>

        {/* Controls Card */}
        <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Palette className="text-primary" size={24} />
            <h2 className="text-xl font-bold text-white">Lighting Control</h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Backlight Color</label>
              <div className="flex items-center gap-4">
                <input 
                  type="color" 
                  value={color}
                  onChange={handleColorChange}
                  className="w-16 h-16 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                />
                <div className="flex-1">
                  <div className="text-white font-mono text-lg">{color.toUpperCase()}</div>
                  <div className="text-xs text-gray-500 mt-1">Click square to pick color</div>
                </div>
              </div>
            </div>

            {status && (
              <div className={`p-3 rounded-lg text-sm font-medium ${status.includes("Error") || status.includes("Not Found") ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
                {status}
              </div>
            )}
           
           <div className="pt-4 border-t border-white/5">
             <p className="text-xs text-gray-500 leading-relaxed">
               Note: This communicates via Raw HID. Ensure your QMK firmware is configured to accept lighting commands on channel 0xFF60.
             </p>
           </div>
          </div>
        </div>

      </div>
    </div>
  );
}
