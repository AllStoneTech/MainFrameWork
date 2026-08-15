// SPDX-License-Identifier: GPL-3.0-or-later
/** Shared frontend types mirroring Rust structs exposed over Tauri IPC. */

/**
 * A Framework-VID USB device found by the Rust `scan_devices` command.
 * Mirrors `ConnectedDevice` in `src-tauri/src/device_manager.rs` — keep
 * the two in sync if that struct's fields change.
 */
export interface ConnectedDevice {
  vid: number;
  pid: number;
  description: string;
  device_type: string;
}
