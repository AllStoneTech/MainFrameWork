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
    })
}
