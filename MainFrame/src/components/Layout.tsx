import type { ReactElement } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

/**
 * App shell: fixed-height flex row so only `<main>` scrolls internally.
 * Deliberately `h-screen` (capped) rather than `min-h-screen` (floor only) —
 * a floor lets tall page content (e.g. the 34-row matrix grid) grow the
 * whole row past the viewport, dragging the Sidebar into page-level scroll
 * along with it instead of staying pinned.
 */
export default function Layout(): ReactElement {
  return (
    <div className="flex h-screen bg-[#242424] text-white font-inter overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
