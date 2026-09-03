// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * App shell layout: pins the Sidebar and renders the active route's page
 * inside a scrollable `<main>` via React Router's Outlet.
 */
import type { ReactElement } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * App shell: fixed-height flex row so only `<main>` scrolls internally.
 * Deliberately `h-screen` (capped) rather than `min-h-screen` (floor only) —
 * a floor lets tall page content (e.g. the 34-row matrix grid) grow the
 * whole row past the viewport, dragging the Sidebar into page-level scroll
 * along with it instead of staying pinned.
 *
 * The routed page is wrapped in an ErrorBoundary so a crash in one page
 * doesn't blank the whole window — Sidebar navigation stays usable.
 * Keyed by pathname so switching pages remounts the boundary (clearing
 * its errored state) rather than leaving you stuck on the error screen
 * after navigating away from whatever crashed.
 */
export default function Layout(): ReactElement {
  const location = useLocation();
  return (
    <div className="flex h-screen bg-[#242424] text-white font-inter overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
