import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export interface TabBarItem {
  to: string;
  label: string;
  icon?: LucideIcon;
  end?: boolean;
}

interface TabBarProps {
  items: TabBarItem[];
}

/**
 * Pill-style sub-navigation bar, generalized from the Pen/Eraser toggle
 * pattern in the original Matrix Studio canvas. Routes via NavLink so the
 * active tab reflects the current nested route.
 */
export function TabBar({ items }: TabBarProps): ReactElement {
  return (
    <div className="flex gap-2 p-1 bg-black/20 border border-white/10 rounded-lg w-fit">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-black"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`
          }
        >
          {item.icon && <item.icon size={16} />}
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
