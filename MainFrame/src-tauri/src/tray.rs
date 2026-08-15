// SPDX-License-Identifier: GPL-3.0-or-later

//! System tray icon. Lets MainFrameWork keep running in the background
//! (so LED Matrix / keyboard RGB state stays live) after the main window
//! is closed, instead of quitting outright — the window's close button
//! hides it rather than exiting; only the tray menu's "Quit" item ends
//! the process. Settings' "Stealth Mode" toggle is meant to hide this
//! icon, but that wiring isn't connected yet (see the toggle's own
//! description in Settings.tsx) — this module always shows the icon.

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";

/// Builds the tray icon + its Show/Quit menu, and wires the main window's
/// close button to hide instead of quit. Called once from `run()`'s
/// `.setup()` hook, since building the menu needs an `App`/`AppHandle`.
pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show MainFrameWork", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("bundle.icon must be configured in tauri.conf.json");

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("MainFrameWork")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let window_handle = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_handle.hide();
            }
        });
    }

    Ok(())
}

/// Un-hides and focuses the main window — shared by the tray menu's
/// "Show" item and a left-click on the tray icon itself.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
