// SPDX-License-Identifier: GPL-3.0-or-later

//! Persists user-facing app settings ([`AppState`]) to disk as an
//! AES-256-GCM encrypted blob under the Tauri app data directory
//! (`user_data.bin`).
//!
//! The encryption key is a compile-time constant (see the note above
//! [`CONSTANT_KEY`]) — this layer guards against accidental hand-editing
//! or corruption of the file, not against a determined local attacker.
//! Exposes two Tauri commands, [`save_settings`] and [`load_settings`],
//! both operating on the settings as an opaque JSON string so this module
//! doesn't need to know the frontend's exact settings shape beyond
//! [`AppState`]'s default.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    AeadCore, Aes256Gcm, Nonce
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

// NOTE: this key is a compile-time constant, so it is not a secret — anyone
// with the source (which is everyone, this is public GPLv3 code) can decrypt
// user_data.bin. That's acceptable today because AppState below holds no
// sensitive data (theme, keyboard color, a toggle); this AES layer exists to
// keep the file from being trivially hand-edited/corrupted, not to provide
// confidentiality. See SECURITY.md. If a future AppState field needs real
// secrecy, replace this with a per-machine key (OS keyring, or derived from
// a machine ID) before storing it.
// 32 bytes for AES-256
const CONSTANT_KEY: &[u8; 32] = b"MainFrame_MVP_Secret_Key_32bytes";

/// User-facing app settings persisted to `user_data.bin`. Serialized to
/// JSON, then that JSON is what gets encrypted by [`save_settings`].
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppState {
    pub theme: String,
    pub keyboard_color_hex: String,
    pub matrix_enabled: bool,
}

/// Default settings used when no `user_data.bin` exists yet (first run).
impl Default for AppState {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            keyboard_color_hex: "#ff8c00".to_string(),
            matrix_enabled: true,
        }
    }
}

/// Resolves the on-disk path for the encrypted settings blob, inside the
/// platform-specific Tauri app data directory.
fn get_data_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("user_data.bin")
}

/// Encrypts `settings_json` (expected to be the JSON-serialized
/// [`AppState`], though this function itself just treats it as opaque
/// bytes) with AES-256-GCM and writes `nonce ++ ciphertext` to
/// `user_data.bin`, creating the app data directory if needed.
///
/// # Errors
/// Returns an error string on encryption failure or any filesystem
/// error (directory creation, write).
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

/// Reads and decrypts `user_data.bin`, returning the settings as a JSON
/// string. If the file doesn't exist yet (first run), returns
/// [`AppState::default`] serialized to JSON instead of erroring.
///
/// # Errors
/// Returns an error string if the file is too short to contain a nonce,
/// decryption fails (wrong key or corruption), or the decrypted bytes
/// aren't valid UTF-8.
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
