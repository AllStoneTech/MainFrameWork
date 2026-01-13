import { NavLink } from "react-router-dom";
import { LayoutDashboard, Keyboard, Grid3X3, Cpu } from "lucide-react";

export function Sidebar() {
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Keyboard, label: "Input Studio", path: "/input" },
    { icon: Grid3X3, label: "Matrix Studio", path: "/matrix" },
    { icon: Cpu, label: "System Health", path: "/system" },
  ];

  return (
    <div className="w-64 bg-[#1a1a1a] border-r border-[#333] flex flex-col h-screen">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Main<span className="text-primary">Frame</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">v0.1.0 • Portable</p>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-[#333]">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/5">
          <div className="w-2 h-2 rounded-full bg-green-500 box-shadow-green" />
          <span className="text-xs font-medium text-gray-400">Device Connected</span>
        </div>
      </div>
    </div>
  );
}
