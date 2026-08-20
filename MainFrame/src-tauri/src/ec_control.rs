// SPDX-License-Identifier: GPL-3.0-or-later

//! Real EC-backed data for System Health (Thermal, Battery, Sensors), via
//! `framework_lib::chromium_ec::CrosEc`.
//!
//! This module's code is genuinely cross-platform — `CrosEc` supports a
//! Windows backend too — but it's written and framed as the Linux delivery
//! of the System Health feature specifically: on Linux, `/dev/cros_ec` is
//! the in-kernel driver Framework hardware exposes out of the box, no
//! separate install needed. On Windows, [`CrosEc::with`] simply won't find
//! a driver and every command here returns an error, *unless* someone has
//! manually installed the unsigned community driver `DriverGate.tsx` links
//! to — MainFrameWork doesn't do that for them, but doesn't refuse to talk
//! to it either if they've made that call themselves. See `installer.rs`
//! and SECURITY.md for the full reasoning on why Windows isn't automated.
//!
//! Battery and charge-limit read/write go through framework_lib's public
//! API directly (`power::power_info`, `CrosEc::get_charge_limit`/
//! `set_charge_limit`). Temperature and fan RPM don't have a public getter
//! in framework_lib 0.6.5 — only a print-to-stdout `power::print_thermal`
//! — so [`get_thermal_snapshot`] reads the raw EC memory-mapped region via
//! the public `CrosEc::dump_mem_region()` and parses it using the same
//! offsets and conversion formula as framework_lib's own (private)
//! implementation, confirmed by reading that source directly rather than
//! guessing: temperature sensors at byte offset 0x00 (up to 16 bytes, one
//! per sensor, raw value minus 73 = degrees Celsius; 0xFF/0xFE/0xFD/0xFC
//! are not-present/error/not-powered/not-calibrated sentinels), fan RPM at
//! offset 0x10 (4 fans, u16 little-endian each; 0xFFFF = not present,
//! 0xFFFE = stalled, the latter only on EC firmware from before 2023).
//!
//! **Unverified against real hardware.** This machine is Windows-only with
//! no CrosEC driver installed, so none of this has actually run against a
//! live EC yet — same caveat as this codebase's other Linux-specific code
//! (see `ec_check.rs`, the udev rules, and README.md's testing-status
//! note). It does fully type-check (`cargo check` on Windows, since the
//! code isn't platform-gated), which is more verification than those
//! existing paths had, but that's not the same as a real run.

use framework_lib::chromium_ec::{CrosEc, CrosEcDriverType};
use framework_lib::power;
use serde::Serialize;

const EC_MEMMAP_TEMP_SENSOR_OFFSET: usize = 0x00;
const EC_MEMMAP_TEMP_SENSOR_COUNT: usize = 16;
const EC_MEMMAP_FAN_OFFSET: usize = 0x10;
const EC_MEMMAP_FAN_COUNT: usize = 4;
const EC_FAN_SPEED_NOT_PRESENT: u16 = 0xFFFF;
const EC_FAN_SPEED_STALLED_DEPRECATED: u16 = 0xFFFE;

/// Opens the EC driver, or a clear error if none is available on this
/// platform/machine. Uses `CrosEcDriverType::CrosEc` (the Linux
/// `/dev/cros_ec` backend) explicitly rather than `CrosEc::new()`'s
/// auto-detection, which would silently fall back to the raw port-I/O
/// driver on non-Windows systems if `/dev/cros_ec` isn't present — that
/// fallback talks to the wrong transport for what this module assumes and
/// always needs root, so failing clearly here is better than guessing.
fn open_ec() -> Result<CrosEc, String> {
    CrosEc::with(CrosEcDriverType::CrosEc)
        .ok_or_else(|| "CrosEC driver not available (expected /dev/cros_ec on Linux)".to_string())
}

/// Snapshot of real battery state from the EC, for System Health's Battery
/// and Sensors tabs. Mirrors `framework_lib::power::BatteryInformation`'s
/// fields rather than re-exposing that whole struct, plus a computed
/// `power_draw_watts` (present_voltage_mv * present_rate_ma / 1_000_000 —
/// units confirmed from framework_lib's own debug-print formatting of
/// these two raw EC memory-mapped fields, not assumed).
#[derive(Serialize, Debug, Clone)]
pub struct BatterySnapshot {
    pub charge_percentage: u32,
    pub charging: bool,
    pub discharging: bool,
    pub level_critical: bool,
    pub cycle_count: u32,
    pub design_capacity_mah: u32,
    pub last_full_charge_capacity_mah: u32,
    pub ac_present: bool,
    pub power_draw_watts: f64,
}

/// Reads real battery state from the EC.
///
/// # Errors
/// Returns an error string if the EC driver isn't available, or if the EC
/// reports no battery present (e.g. a desktop board).
#[tauri::command]
pub fn get_battery_snapshot() -> Result<BatterySnapshot, String> {
    let ec = open_ec()?;
    let info = power::power_info(&ec).ok_or_else(|| "Failed to read power info from EC".to_string())?;
    let battery = info.battery.ok_or_else(|| "No battery reported by EC".to_string())?;

    let power_draw_watts = (battery.present_voltage as f64 * battery.present_rate as f64) / 1_000_000.0;

    Ok(BatterySnapshot {
        charge_percentage: battery.charge_percentage,
        charging: battery.charging,
        discharging: battery.discharging,
        level_critical: battery.level_critical,
        cycle_count: battery.cycle_count,
        design_capacity_mah: battery.design_capacity,
        last_full_charge_capacity_mah: battery.last_full_charge_capacity,
        ac_present: info.ac_present,
        power_draw_watts,
    })
}

/// Reads the current charge-limit range (min, max percent) from the EC.
#[tauri::command]
pub fn get_charge_limit() -> Result<(u8, u8), String> {
    let ec = open_ec()?;
    ec.get_charge_limit().map_err(|e| format!("{e:?}"))
}

/// Sets the charge-limit range (min, max percent) on the EC. Battery
/// Guardian's UI only exposes the max ("stop charging at N%"); min is
/// passed through unchanged by callers that don't care about it.
#[tauri::command]
pub fn set_charge_limit(min: u8, max: u8) -> Result<(), String> {
    let ec = open_ec()?;
    ec.set_charge_limit(min, max).map_err(|e| format!("{e:?}"))
}

/// One temperature sensor reading in Celsius, or `None` if the EC reported
/// it as not present/errored/unpowered/uncalibrated — see this module's
/// doc comment for the sentinel byte values this maps from.
fn temp_sensor_celsius(raw: u8) -> Option<i16> {
    match raw {
        0xFF | 0xFE | 0xFD | 0xFC => None,
        _ => Some(raw as i16 - 73),
    }
}

/// Real temperature and fan RPM readings for System Health's Thermal and
/// Sensors tabs. Sensors/fans the EC reports as not present are omitted
/// rather than shown as zero, since a platform rarely populates all
/// possible slots (see framework_lib's `power::print_thermal` for the
/// per-platform sensor layouts this doesn't attempt to replicate — labels
/// here are generic "Temp N"/"Fan N" rather than guessing which physical
/// component each index corresponds to on this specific board).
#[derive(Serialize, Debug, Clone)]
pub struct ThermalSnapshot {
    pub temps_celsius: Vec<(String, i16)>,
    pub fans_rpm: Vec<(String, u16)>,
}

/// Reads real temperature and fan RPM data from the EC's memory-mapped
/// region.
///
/// # Errors
/// Returns an error string if the EC driver isn't available or the memory
/// region can't be read.
#[tauri::command]
pub fn get_thermal_snapshot() -> Result<ThermalSnapshot, String> {
    let ec = open_ec()?;
    let region = ec
        .dump_mem_region()
        .ok_or_else(|| "Failed to read EC memory-mapped region".to_string())?;

    let mut temps_celsius = Vec::new();
    for i in 0..EC_MEMMAP_TEMP_SENSOR_COUNT {
        let Some(&raw) = region.get(EC_MEMMAP_TEMP_SENSOR_OFFSET + i) else {
            break;
        };
        if let Some(celsius) = temp_sensor_celsius(raw) {
            temps_celsius.push((format!("Temp {i}"), celsius));
        }
    }

    let mut fans_rpm = Vec::new();
    for i in 0..EC_MEMMAP_FAN_COUNT {
        let offset = EC_MEMMAP_FAN_OFFSET + i * 2;
        let (Some(&lo), Some(&hi)) = (region.get(offset), region.get(offset + 1)) else {
            break;
        };
        let rpm = u16::from_le_bytes([lo, hi]);
        if rpm != EC_FAN_SPEED_NOT_PRESENT && rpm != EC_FAN_SPEED_STALLED_DEPRECATED {
            fans_rpm.push((format!("Fan {i}"), rpm));
        }
    }

    Ok(ThermalSnapshot { temps_celsius, fans_rpm })
}

/// Sets one fan (or all fans, if `fan` is `None`) to a fixed duty cycle
/// (0-100%). Overrides automatic fan control until [`set_fan_auto`] is
/// called.
#[tauri::command]
pub fn set_fan_duty(fan: Option<u32>, percent: u32) -> Result<(), String> {
    let ec = open_ec()?;
    ec.fan_set_duty(fan, percent).map_err(|e| format!("{e:?}"))
}

/// Returns one fan (or all fans, if `fan` is `None`) to automatic EC
/// control, undoing [`set_fan_duty`].
#[tauri::command]
pub fn set_fan_auto(fan: Option<u8>) -> Result<(), String> {
    let ec = open_ec()?;
    ec.autofanctrl(fan).map_err(|e| format!("{e:?}"))
}
