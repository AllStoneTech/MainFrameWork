// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Catches a render crash in the routed page content (wrapped around
 * Layout's `<Outlet/>`, not the whole app) so one broken page shows a
 * recoverable error screen instead of silently blanking the entire
 * window — Sidebar navigation stays usable, and the error is also sent
 * to the Rust side (`log_frontend_error`) so it leaves a trail on disk
 * instead of vanishing the moment the window closes.
 *
 * Must be a class component: React only supports error boundaries via
 * `getDerivedStateFromError`/`componentDidCatch`, there's no hook
 * equivalent. Layout.tsx keys this by route path so navigating to a
 * different page remounts it (resetting out of the errored state) —
 * an error boundary doesn't clear itself just because its children
 * change otherwise.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const message = `${error.stack ?? error.message}\n${info.componentStack ?? ""}`;
    console.error("Caught by ErrorBoundary:", message);
    invoke("log_frontend_error", { message }).catch((err) => console.error("Failed to log frontend error:", err));
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-center">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">This page hit an error</h2>
        <p className="text-sm text-gray-400 mb-1 max-w-lg font-mono break-words">{this.state.error.message}</p>
        <p className="text-xs text-gray-500 mb-6 max-w-lg">
          Logged to disk for debugging (see frontend_errors.log in the app data folder). Pick another page from the
          sidebar, or reload.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-black font-bold rounded-lg text-sm hover:bg-orange-600"
        >
          Reload MainFrameWork
        </button>
      </div>
    );
  }
}
