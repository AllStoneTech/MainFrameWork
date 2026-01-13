import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldAlert, Download, Activity, Thermometer } from "lucide-react";

type EcStatus = "Available" | "DriverMissing" | "NotFramework";

export default function SystemHealth() {
  const [status, setStatus] = useState<EcStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await invoke<EcStatus>("check_ec_status");
        setStatus(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Checking Hardware Access...</div>;

  if (status === "DriverMissing") {
    const handleInstall = async () => {
      setLoading(true);
      try {
        await invoke("install_driver");
        alert("Driver Simulation Successful. Please restart the app.");
        // Reload to re-check status (in valid scenario)
        window.location.reload();
      } catch (err) {
        alert("Installation Failed: " + err);
        setLoading(false);
      }
    };

    return (
      <div className="p-8 h-full flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="bg-primary/20 p-6 rounded-full inline-block mb-6">
            <ShieldAlert size={64} className="text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Pro Features Locked</h2>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Direct hardware access (Fans, Battery Limit) requires the 
            <span className="text-white font-medium"> CrosEC Kernel Driver</span>.
            <br />
            Windows does not expose this by default.
          </p>
          
          <button 
            onClick={handleInstall}
            disabled={loading}
            className="bg-primary hover:bg-orange-600 text-black font-bold py-3 px-6 rounded-lg flex items-center gap-2 mx-auto transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <div className="animate-spin w-5 h-5 border-2 border-black border-t-transparent rounded-full"/> : <Download size={20} />}
            {loading ? "Installing..." : "Install CrosEC Driver"}
          </button>
          
          <p className="mt-6 text-xs text-gray-600">
            MainFrame will continue to function in "Portal Mode" (Input & Matrix) without this driver.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-6">System Health</h1>
      <div className="grid gap-6">
        
        {/* Fan Curve (Unlocked) */}
        <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-6 relative z-10">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                  <Activity size={20}/> 
                </div>
                <div>
                  <h3 className="text-white font-bold">Fan Speed</h3>
                  <div className="text-xs text-gray-500">CPU TEMPERATE: 42°C</div>
                </div>
             </div>
             <div className="text-right">
                <span className="text-blue-400 font-mono text-xl block">3,400</span>
                <span className="text-xs text-gray-500">RPM</span>
             </div>
          </div>
          
          <div className="h-48 bg-[#111] rounded-lg border border-white/5 p-4 relative">
             {/* Mock SVG Graph */}
             <svg className="w-full h-full text-blue-500" viewBox="0 0 100 50" preserveAspectRatio="none">
               <defs>
                 <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                   <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                   <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                 </linearGradient>
               </defs>
               <path d="M0,50 Q20,50 40,40 T100,10" fill="url(#glow)" stroke="none" />
               <path d="M0,50 Q20,50 40,40 T100,10" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
               {/* Grid Lines */}
               <line x1="0" y1="12.5" x2="100" y2="12.5" stroke="#333" strokeWidth="0.5" strokeDasharray="2"/>
               <line x1="0" y1="25" x2="100" y2="25" stroke="#333" strokeWidth="0.5" strokeDasharray="2"/>
               <line x1="0" y1="37.5" x2="100" y2="37.5" stroke="#333" strokeWidth="0.5" strokeDasharray="2"/>
             </svg>
             <div className="absolute bottom-2 left-4 text-[10px] text-gray-600 font-mono">20°C</div>
             <div className="absolute bottom-2 right-4 text-[10px] text-gray-600 font-mono">100°C</div>
          </div>
        </div>

         {/* Battery (Unlocked) */}
         <div className="bg-[#2a2a2a] p-6 rounded-xl border border-white/5 shadow-lg">
          <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
                  <Thermometer size={20}/>
                </div>
                <div>
                  <h3 className="text-white font-bold">Battery Limit</h3>
                  <div className="text-xs text-gray-500">EXTEND LIFESPAN</div>
                </div>
             </div>
             <span className="text-green-400 font-mono text-xl">80%</span>
          </div>
          
          <div className="px-2">
            <input type="range" min="40" max="100" defaultValue="80" className="w-full accent-green-500 bg-[#111] h-3 rounded-full appearance-none cursor-pointer border border-white/5 hover:border-green-500/30 transition-colors" />
            <div className="flex justify-between mt-2 text-[10px] text-gray-500 font-mono">
              <span>TRIP (40%)</span>
              <span>BALANCED (80%)</span>
              <span>MAX (100%)</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
