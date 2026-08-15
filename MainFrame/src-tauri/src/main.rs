// SPDX-License-Identifier: GPL-3.0-or-later

//! Native binary entry point. Delegates immediately to
//! [`mainframework_lib::run`] (see `lib.rs`), which does all real setup
//! (Tauri builder, plugins, command registration). Kept separate from
//! `lib.rs` per the standard Tauri project layout so the app can also be
//! built as a library for mobile targets.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Hands off to the Tauri app runner in `lib.rs`.
fn main() {
    mainframework_lib::run()
}
