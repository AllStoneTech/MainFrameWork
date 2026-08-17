// SPDX-License-Identifier: GPL-3.0-or-later

//! General host hardware identification (CPU, memory, GPU, OS) for the
//! Dashboard's "System" card. Distinct from `device_manager.rs`, which
//! only enumerates Framework-VID USB peripherals — this module describes
//! the machine MainFrameWork is running on.
//!
//! CPU usage is a delta measurement, so [`SystemInfoState`] keeps one
//! [`sysinfo::System`] alive across calls (managed Tauri state, same
//! pattern as `keyboard_mapper::KeyboardHidState`) and refreshes it in
//! place rather than constructing a fresh one per call. The very first
//! call after launch has no prior sample to diff against, so
//! `cpu_usage_percent` reads `0.0` until a second call is made — the
//! frontend's manual refresh button naturally provides that second call.

use dmidecode::Structure;
use framework_lib::smbios::{self, PlatformFamily};
use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use sysinfo::System;

/// Snapshot of host hardware/OS info, returned by [`get_hardware_summary`].
#[derive(Serialize, Debug, Clone)]
pub struct HardwareSummary {
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub cpu_usage_percent: f32,
    pub total_memory_gb: f64,
    pub used_memory_gb: f64,
    pub gpu_name: String,
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub hostname: String,
    /// Friendly Framework model name (e.g. "Framework Laptop 16"), or
    /// `None` on a non-Framework PC — or on Linux without root, where
    /// SMBIOS simply isn't readable (see [`framework_system_name`]).
    pub framework_system: Option<String>,
}

/// Whether the SMBIOS manufacturer string is literally "Framework".
///
/// Deliberately doesn't use `framework_lib::smbios::is_framework()`: as of
/// framework_lib 0.6.5, that function treats `Platform::UnknownSystem` as a
/// Framework match — but `get_platform()` returns `UnknownSystem` for
/// *any* SMBIOS product string it doesn't recognize, Framework or not, so
/// `is_framework()` ends up true on non-Framework PCs too (its accurate
/// manufacturer-check fallback is dead code; the `UnknownSystem` branch
/// always fires first). Checking the manufacturer field directly — what
/// that fallback does — is the actually-correct version of the same idea.
fn smbios_manufacturer_is_framework() -> bool {
    let Some(store) = smbios::get_smbios() else {
        return false;
    };
    store
        .structures()
        .any(|result| matches!(result, Ok(Structure::System(sys)) if sys.manufacturer == "Framework"))
}

/// Friendly Framework model name from SMBIOS, or `None` if this isn't a
/// Framework system. Recognized platforms (Laptop 12/13/16, Desktop) get a
/// clean family name; an unrecognized-but-genuine Framework board falls
/// back to the raw SMBIOS product string rather than guessing.
///
/// On Linux, reading SMBIOS requires root — this returns `None` for a
/// regular user even on real Framework hardware, since there's no data to
/// read, not because the check failed.
fn framework_system_name() -> Option<String> {
    if !smbios_manufacturer_is_framework() {
        return None;
    }
    Some(match smbios::get_family() {
        Some(PlatformFamily::Framework12) => "Framework Laptop 12".to_string(),
        Some(PlatformFamily::Framework13) => "Framework Laptop 13".to_string(),
        Some(PlatformFamily::Framework16) => "Framework Laptop 16".to_string(),
        Some(PlatformFamily::FrameworkDesktop) => "Framework Desktop".to_string(),
        None => smbios::get_product_name().unwrap_or_else(|| "Framework system".to_string()),
    })
}

/// Whether this is specifically a Framework Laptop 16 — narrower than
/// [`smbios_manufacturer_is_framework`], for callers that need to gate a
/// Laptop-16-specific feature (e.g. `matrix_control`'s bay-position
/// detection, which relies on Laptop 16's specific internal USB wiring).
pub fn is_framework16() -> bool {
    smbios_manufacturer_is_framework() && matches!(smbios::get_family(), Some(PlatformFamily::Framework16))
}

/// Caches a [`System`] across calls so CPU usage can be measured as a
/// delta between refreshes, per sysinfo's own recommendation.
#[derive(Default)]
pub struct SystemInfoState {
    system: Mutex<Option<System>>,
}

/// Best-effort GPU name lookup. sysinfo doesn't expose GPU info, so this
/// shells out to a platform-native inventory tool instead. Only the
/// first adapter is reported; multi-GPU (e.g. integrated + discrete)
/// systems will only show one.
fn detect_gpu() -> String {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)",
            ])
            .output();
        if let Ok(out) = output {
            let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !name.is_empty() {
                return name;
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("sh")
            .arg("-c")
            .arg("lspci | grep -Ei 'vga|3d controller' | head -n1 | sed 's/^.*: //'")
            .output();
        if let Ok(out) = output {
            let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !name.is_empty() {
                return name;
            }
        }
    }
    "Unknown GPU".to_string()
}

/// Reports a snapshot of host CPU, memory, GPU, and OS info for the
/// Dashboard's "System" card.
#[tauri::command]
pub fn get_hardware_summary(state: tauri::State<SystemInfoState>) -> Result<HardwareSummary, String> {
    let mut guard = state.system.lock().map_err(|e| e.to_string())?;
    let sys = guard.get_or_insert_with(System::new_all);
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    Ok(HardwareSummary {
        cpu_name,
        cpu_cores: sys.cpus().len(),
        cpu_usage_percent: sys.global_cpu_usage(),
        total_memory_gb: sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0,
        used_memory_gb: sys.used_memory() as f64 / 1024.0 / 1024.0 / 1024.0,
        gpu_name: detect_gpu(),
        os_name: System::name().unwrap_or_else(|| "Unknown OS".to_string()),
        os_version: System::os_version().unwrap_or_default(),
        kernel_version: System::kernel_version().unwrap_or_default(),
        hostname: System::host_name().unwrap_or_default(),
        framework_system: framework_system_name(),
    })
}
