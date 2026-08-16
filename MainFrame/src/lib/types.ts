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

/**
 * General host hardware/OS info, not Framework-module-specific. Mirrors
 * `HardwareSummary` in `src-tauri/src/system_info.rs`.
 */
export interface HardwareSummary {
  cpu_name: string;
  cpu_cores: number;
  cpu_usage_percent: number;
  total_memory_gb: number;
  used_memory_gb: number;
  gpu_name: string;
  os_name: string;
  os_version: string;
  kernel_version: string;
  hostname: string;
  /** Friendly Framework model name (e.g. "Framework Laptop 16"), or null on a non-Framework PC. */
  framework_system: string | null;
}
