// SPDX-License-Identifier: GPL-3.0-or-later

//! Placeholder for the future CrosEC kernel driver installer.
//!
//! Real installation on Windows requires triggering a UAC elevation prompt
//! and copying a signed `.sys` file into `System32/drivers`, then loading it
//! as a kernel service — none of that is implemented yet. This command is
//! kept registered (see `lib.rs`) as a stable IPC surface for the frontend's
//! "Coming Soon" gate in `DriverGate.tsx`, but it does not install anything.

/// Always returns an error describing this feature as not yet implemented.
/// Intentionally does not simulate success — a prior version of this
/// command slept for a couple seconds and reported "Driver Installed",
/// which would have misled real users into thinking Fan/Battery control
/// was now available when nothing had actually changed on their machine.
#[tauri::command]
pub async fn install_driver() -> Result<String, String> {
    Err("Driver installation is not implemented yet.".to_string())
}
