// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * App entry point. Mounts the React tree into the `#root` element defined
 * in index.html, wrapped in StrictMode for extra dev-time checks (e.g.
 * double-invoking effects to surface missing cleanup). The `as HTMLElement`
 * cast is safe here because index.html is part of this repo and always
 * defines that element.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
