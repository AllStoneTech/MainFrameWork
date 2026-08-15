// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Thin wrapper around the Rust-side encrypted settings store (see
 * persistence.rs). All pages that persist local state (LightingTab,
 * WidgetsTab, AnimatorTab, etc.) share this single JSON blob, keyed by
 * their own top-level settings keys.
 */
import { invoke } from "@tauri-apps/api/core";

/**
 * Loads and parses the encrypted settings blob (see persistence.rs).
 * The Rust side treats it as an opaque JSON string, so callers own their
 * own keys — always merge via {@link patchSettings} rather than
 * overwriting the whole object, or you'll clobber other tabs' saved state.
 */
export async function loadSettings(): Promise<Record<string, unknown>> {
  const raw = await invoke<string>("load_settings").catch(() => "{}");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Merges `patch` into the saved settings blob and persists the result. */
export async function patchSettings(patch: Record<string, unknown>): Promise<void> {
  const current = await loadSettings();
  await invoke("save_settings", { settingsJson: JSON.stringify({ ...current, ...patch }) });
}
