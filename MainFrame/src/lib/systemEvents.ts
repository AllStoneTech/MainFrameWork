// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tauri event names emitted by the Rust backend, shared here so listeners
 * don't each hardcode the string.
 */

/**
 * Fired by `power_watch.rs`'s background thread when it detects the host
 * resuming from sleep. No payload — listen for it and re-sync whatever
 * device state you own (e.g. re-push the last LED Matrix frame/pattern,
 * since the module loses its own state across a suspend). Keep this in
 * sync with `RESUME_EVENT` in `src-tauri/src/power_watch.rs`.
 */
export const RESUME_EVENT = "system-resumed";
