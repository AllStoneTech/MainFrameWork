// SPDX-License-Identifier: GPL-3.0-or-later

//! Plain-text (not encrypted — nothing sensitive ends up here) frontend
//! error log. Paired with `src/components/ErrorBoundary.tsx`: a React
//! render crash that would otherwise just blank the screen with nothing
//! left behind now leaves a trail on disk, so a bug report of "the
//! screen went gray" has an actual stack trace to go with it instead of
//! needing to be reproduced live with someone watching.

use std::fs::OpenOptions;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

fn log_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap().join("frontend_errors.log")
}

/// Appends one timestamped entry to `frontend_errors.log` in the app
/// data directory. Best-effort — a failure here (e.g. disk full)
/// shouldn't itself crash the error-reporting path, so this returns a
/// `Result` for the caller to log/ignore rather than panicking.
#[tauri::command]
pub fn log_frontend_error(app: AppHandle, message: String) -> Result<(), String> {
    let path = log_path(&app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    writeln!(file, "[{timestamp}] {message}\n---").map_err(|e| e.to_string())
}
