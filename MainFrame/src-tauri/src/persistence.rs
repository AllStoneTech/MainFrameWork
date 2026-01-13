use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    AeadCore, Aes256Gcm, Nonce
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

// Hardcoded key for MVP (In prod, use OS Keyring)
// 32 bytes for AES-256
const CONSTANT_KEY: &[u8; 32] = b"MainFrame_MVP_Secret_Key_32bytes"; 

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppState {
    pub theme: String,
    pub keyboard_color_hex: String,
    pub matrix_enabled: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            keyboard_color_hex: "#ff8c00".to_string(),
            matrix_enabled: true,
        }
    }
}

fn get_data_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("user_data.bin")
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings_json: String) -> Result<String, String> {
    // 1. Encrypt
    let cipher = Aes256Gcm::new(CONSTANT_KEY.into());
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // 96-bits; unique per message
    
    let ciphertext = cipher.encrypt(&nonce, settings_json.as_bytes())
        .map_err(|e| format!("Encryption failure: {}", e))?;

    // 2. Format: Nonce + Ciphertext (we need nonce to decrypt)
    let mut final_blob = nonce.to_vec();
    final_blob.extend_from_slice(&ciphertext);

    // 3. Save to Disk
    let path = get_data_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    fs::write(&path, final_blob).map_err(|e| format!("File write error: {}", e))?;

    println!("Saved encrypted settings to {:?}", path);
    Ok("Saved".to_string())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<String, String> {
    let path = get_data_path(&app);
    if !path.exists() {
        // Return default JSON if no file exists
        let default_state = AppState::default();
        return serde_json::to_string(&default_state).map_err(|e| e.to_string());
    }

    let file_content = fs::read(&path).map_err(|e| e.to_string())?;
    
    if file_content.len() < 12 {
        return Err("Invalid file format (too short)".to_string());
    }

    // Split Nonce (12 bytes) and Ciphertext
    let (nonce_bytes, ciphertext) = file_content.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new(CONSTANT_KEY.into());
    
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed (Key mismatch or corruption)".to_string())?;

    let json_string = String::from_utf8(plaintext)
        .map_err(|_| "Invalid UTF-8 in decrypted data".to_string())?;

    Ok(json_string)
}
