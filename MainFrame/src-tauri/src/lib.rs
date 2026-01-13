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
        .invoke_handler(tauri::generate_handler![
            greet,
            device_manager::scan_devices,
            matrix_control::update_matrix,
            keyboard_mapper::set_keyboard_color,
            ec_check::check_ec_status,
            persistence::save_settings,
            persistence::load_settings,
            installer::install_driver
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
