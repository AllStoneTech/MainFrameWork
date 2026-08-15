// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Root route tree. Uses HashRouter (not BrowserRouter) because the app is
 * served from a `tauri://` / `file://`-style origin in production, where
 * History-API routing can't resolve paths the way it can on a real HTTP
 * server. Top-level routes mirror the Sidebar's nav items and the three
 * feature "pillars" (Input, Matrix, System); each pillar has its own
 * shell component (InputStudio/MatrixStudio/SystemHealth) that renders a
 * TabBar plus a nested Outlet for its own sub-tabs, with an index route
 * that redirects to that pillar's first tab.
 */
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Profiles from "./pages/Profiles";
import Settings from "./pages/Settings";

import InputStudio from "./pages/input/InputStudio";
import KeymapTab from "./pages/input/KeymapTab";
import LightingTab from "./pages/input/LightingTab";
import MacrosTab from "./pages/input/MacrosTab";

import MatrixStudio from "./pages/matrix/MatrixStudio";
import CanvasTab from "./pages/matrix/CanvasTab";
import WidgetsTab from "./pages/matrix/WidgetsTab";
import AnimatorTab from "./pages/matrix/AnimatorTab";

import SystemHealth from "./pages/system/SystemHealth";
import ThermalTab from "./pages/system/ThermalTab";
import BatteryTab from "./pages/system/BatteryTab";
import ExpansionTab from "./pages/system/ExpansionTab";
import SensorsTab from "./pages/system/SensorsTab";

/** Top-level route tree for the whole app; see file header for the routing model. */
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />

          <Route path="input" element={<InputStudio />}>
            <Route index element={<Navigate to="keymap" replace />} />
            <Route path="keymap" element={<KeymapTab />} />
            <Route path="lighting" element={<LightingTab />} />
            <Route path="macros" element={<MacrosTab />} />
          </Route>

          <Route path="matrix" element={<MatrixStudio />}>
            <Route index element={<Navigate to="canvas" replace />} />
            <Route path="canvas" element={<CanvasTab />} />
            <Route path="widgets" element={<WidgetsTab />} />
            <Route path="animator" element={<AnimatorTab />} />
          </Route>

          <Route path="system" element={<SystemHealth />}>
            <Route index element={<Navigate to="thermal" replace />} />
            <Route path="thermal" element={<ThermalTab />} />
            <Route path="battery" element={<BatteryTab />} />
            <Route path="expansion" element={<ExpansionTab />} />
            <Route path="sensors" element={<SensorsTab />} />
          </Route>

          <Route path="profiles" element={<Profiles />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
