import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Laptop, Keyboard, Grid3X3, Calculator, RefreshCw } from "lucide-react";

interface ConnectedDevice {
  vid: number;
  pid: number;
  description: string;
  device_type: string;
}

export default function Dashboard() {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const scanDevices = async () => {
    setLoading(true);
    try {
      const result = await invoke<ConnectedDevice[]>("scan_devices");
      setDevices(result);
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scanDevices();
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case "Keyboard": return <Keyboard size={24} className="text-primary" />;
      case "Numpad": return <Calculator size={24} className="text-primary" />;
      case "Macropad": return <Grid3X3 size={24} className="text-primary" />;
      case "Matrix": return <Grid3X3 size={24} className="text-primary" />;
      default: return <Laptop size={24} className="text-gray-400" />;
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <button
          onClick={scanDevices}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          title="Refresh Hardware"
        >
          <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 shadow-xl">
          <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-4">Connected Modules</h3>
          {devices.length === 0 ? (
            <div className="text-gray-500 text-sm">No Framework Detected</div>
          ) : (
            <div className="space-y-3">
              {devices.map((dev, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5">
                  {getIcon(dev.device_type)}
                  <div>
                    <div className="text-sm font-medium text-white">{dev.description}</div>
                    <div className="text-xs text-gray-500">PID: 0x{dev.pid.toString(16).toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
