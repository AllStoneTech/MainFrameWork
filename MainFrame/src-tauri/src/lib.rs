// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(keyboard_mapper::KeyboardHidState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            device_manager::scan_devices,
            matrix_control::update_matrix,
            matrix_control::set_matrix_brightness,
            matrix_control::set_matrix_sleep,
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
