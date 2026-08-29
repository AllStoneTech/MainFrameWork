// SPDX-License-Identifier: GPL-3.0-or-later

//! MainFrameWork Tauri application entry point.
//!
//! Declares the app's module tree, registers all `#[tauri::command]`
//! handlers exposed to the frontend via `invoke()`, and wires up managed
//! state: [`keyboard_mapper::KeyboardHidState`] (caches the keyboard's HID
//! handle across calls), [`system_info::SystemInfoState`] (caches the
//! `sysinfo::System` needed for delta CPU-usage readings), and
//! [`device_manager::DeviceScanState`] (remembers the last USB scan result
//! so it only logs when something actually changes). This is the single
//! place new backend commands must be registered or the frontend will get
//! an "unknown command" error at runtime.

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
/// Trivial example command left over from the Tauri template; not used by
/// the MainFrameWork UI.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod device_manager;
mod matrix_control;
mod keyboard_mapper;
mod ec_check;
mod ec_control;
mod persistence;
mod installer;
mod tray;
mod system_info;

/// Builds and runs the Tauri application: registers plugins, managed
/// state, the tray icon, and every invokable command, then blocks on the
/// event loop.
///
/// `tauri_plugin_single_instance` must be the first plugin registered
/// (per its own docs) so it can intercept a second launch before anything
/// else runs: the new process hands its args/cwd to the already-running
/// one via that callback and exits, instead of spawning a second window
/// and a second tray icon.
///
/// # Panics
/// Panics if the Tauri runtime fails to start (e.g. webview
/// initialization failure) — mirrors the Tauri scaffold's default
/// behavior via `.expect(...)`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(keyboard_mapper::KeyboardHidState::default())
        .manage(system_info::SystemInfoState::default())
        .manage(device_manager::DeviceScanState::default())
        .setup(|app| {
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            device_manager::scan_devices,
            system_info::get_hardware_summary,
            matrix_control::update_matrix,
            matrix_control::set_matrix_brightness,
            matrix_control::get_matrix_brightness,
            matrix_control::set_matrix_pattern,
            matrix_control::set_matrix_animate,
            matrix_control::set_matrix_pattern_and_animate,
            matrix_control::set_matrix_sleep,
            matrix_control::get_matrix_sleep,
            matrix_control::get_matrix_bay_hint,
            keyboard_mapper::set_keyboard_color,
            keyboard_mapper::set_keyboard_effect,
            keyboard_mapper::set_keyboard_effect_speed,
            keyboard_mapper::set_keyboard_brightness,
            keyboard_mapper::save_keyboard_lighting,
            ec_check::check_ec_status,
            ec_control::get_battery_snapshot,
            ec_control::get_charge_limit,
            ec_control::set_charge_limit,
            ec_control::get_thermal_snapshot,
            ec_control::set_fan_duty,
            ec_control::set_fan_auto,
            persistence::save_settings,
            persistence::load_settings,
            installer::install_driver
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
