// SPDX-License-Identifier: GPL-3.0-or-later

//! Checks whether the Framework Embedded Controller (EC) driver/device
//! node is present on the current platform.
//!
//! This does not talk to the EC itself — it only checks for the presence
//! of the OS-level handle (`\\.\CrosEC` on Windows, `/dev/cros_ec` on
//! Linux) that a working CrosEC driver install exposes. Exposes one
//! Tauri command, [`check_ec_status`]. Platform-specific behavior is
//! split into separate `platform_check` implementations gated by
//! `#[cfg(target_os = ...)]`; unsupported platforms (e.g. macOS) always
//! report [`EcStatus::NotFramework`].

use serde::Serialize;

/// Result of probing for the Framework EC driver/device node.
#[derive(Serialize, Debug, Clone)]
pub enum EcStatus {
    Available,
    DriverMissing,
    NotFramework,
}

/// Windows implementation: attempts to open the CrosEC driver's DOS
/// device name with `CreateFileW`. Success (and immediate close) means
/// the driver is installed and reachable; failure is treated as
/// [`EcStatus::DriverMissing`] without distinguishing the underlying
/// `GetLastError()` reason.
#[cfg(target_os = "windows")]
fn platform_check() -> EcStatus {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HANDLE, INVALID_HANDLE_VALUE, GENERIC_READ, GENERIC_WRITE};
    use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL};
    
    // We try to open the DOS device name for the CrosEC driver
    // Common names: \\.\CrosEC or \\.\Global\CrosEC
    // We need wide strings for Windows API
    
    let path_str = "\\\\.\\CrosEC\0";
    let wide_path: Vec<u16> = path_str.encode_utf16().collect();

    unsafe {
        let handle: HANDLE = CreateFileW(
            PCWSTR(wide_path.as_ptr()),
            GENERIC_READ.0 | GENERIC_WRITE.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            HANDLE::default()
        ).unwrap_or(INVALID_HANDLE_VALUE); // unwrap_or to be safe vs panic, though CreateFile usually returns handle or INVALID

        if handle != INVALID_HANDLE_VALUE {
            // Close handle immediately, we just wanted to check existence
            let _ = windows::Win32::Foundation::CloseHandle(handle);
            EcStatus::Available
        } else {
            // Further refinement: Check GetLastError(). 
            // If strictly FileNotFound, then DriverMissing.
            // For now, simplicity:
            EcStatus::DriverMissing
        }
    }
}

/// Linux implementation: checks for the `/dev/cros_ec` device node
/// created by the in-kernel ChromeOS EC driver.
#[cfg(target_os = "linux")]
fn platform_check() -> EcStatus {
    use std::path::Path;
    if Path::new("/dev/cros_ec").exists() {
        EcStatus::Available
    } else {
        // On Linux, if the device Node is missing, it could be "NotFramework" or kernel module not loaded.
        // We'll assume DriverMissing/KernelModuleMissing for safety.
        EcStatus::DriverMissing
    }
}

/// Fallback for platforms with no known EC access path (e.g. macOS):
/// always reports [`EcStatus::NotFramework`].
#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn platform_check() -> EcStatus {
    EcStatus::NotFramework
}

/// Reports whether the Framework EC driver/device node is available on
/// this platform. Used by the frontend to gate EC-dependent features and
/// prompt driver installation when missing.
#[tauri::command]
pub fn check_ec_status() -> EcStatus {
    let status = platform_check();
    println!("EC Status Check: {:?}", status);
    status
}
