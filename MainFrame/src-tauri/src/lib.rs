// SPDX-License-Identifier: GPL-3.0-or-later

//! MainFrameWork Tauri application entry point.
//!
//! Declares the app's module tree, registers all `#[tauri::command]`
//! handlers exposed to the frontend via `invoke()`, and wires up managed
//! state (currently just [`keyboard_mapper::KeyboardHidState`], which
//! caches the HID handle for the keyboard's RGB matrix across calls).
//! This is the single place new backend commands must be registered or
//! the frontend will get an "unknown command" error at runtime.

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
mod persistence;
mod installer;
mod tray;
mod system_info;

/// Builds and runs the Tauri application: registers plugins, managed
/// state, the tray icon, and every invokable command, then blocks on the
/// event loop.
///
/// # Panics
/// Panics if the Tauri runtime fails to start (e.g. webview
/// initialization failure) — mirrors the Tauri scaffold's default
/// behavior via `.expect(...)`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(keyboard_mapper::KeyboardHidState::default())
        .manage(system_info::SystemInfoState::default())
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
            matrix_control::set_matrix_sleep,
            matrix_control::get_matrix_bay_hint,
            keyboard_mapper::set_keyboard_color,
            keyboard_mapper::set_keyboard_effect,
            keyboard_mapper::set_keyboard_effect_speed,
            keyboard_mapper::set_keyboard_brightness,
            keyboard_mapper::save_keyboard_lighting,
            ec_check::check_ec_status,
            persistence::save_settings,
            persistence::load_settings,
            installer::install_driver
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
