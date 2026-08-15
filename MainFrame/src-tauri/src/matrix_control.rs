// SPDX-License-Identifier: GPL-3.0-or-later

//! Serial control for the Framework Laptop 16 LED Matrix input module.
//!
//! Protocol reverse-engineered from `app.js` in
//! FrameworkComputer/dotmatrixtool @ 4154b14
//! (https://github.com/FrameworkComputer/dotmatrixtool/blob/4154b149ba962305af2b72a51ba419e244796f18/app.js)
//! and cross-checked against the official FrameworkComputer/inputmodule-rs
//! firmware/tooling repo. Pin the commit when comparing — upstream has
//! moved on since.
//! Every command is framed as `[0x32, 0xAC, <command_id>, ...params]` over
//! a 115200-baud USB-CDC serial port — no driver required on Windows or
//! Linux. The module ships as two independent 9x34 boards (Left/Right),
//! each its own serial port.
//!
//! Framing, `CMD_DRAW`'s 39-byte bit-packing, and `CMD_BRIGHTNESS` have
//! been confirmed against a real module (VID_32AC/PID_0020 on Windows,
//! enumerated as `USB Serial Device`) — sending the raw bytes lit the
//! panel fully on as expected. Only one panel was available to test, so
//! the Left/Right port-ordering assumption below is still unverified.
use serialport::{SerialPort, SerialPortType};
use std::time::Duration;

const MAGIC: [u8; 2] = [0x32, 0xAC];
const BAUD_RATE: u32 = 115200;
const FRAMEWORK_VID: u16 = 0x32AC;
const MATRIX_PID: u16 = 0x0020; // Confirmed on real hardware; see module docs above.

const CMD_BRIGHTNESS: u8 = 0x00;
const CMD_SLEEP: u8 = 0x03;
const CMD_DRAW: u8 = 0x06;

const MATRIX_WIDTH: usize = 9;
const MATRIX_HEIGHT: usize = 34;
const PACKED_LEN: usize = 39; // ceil(9*34/8), matches DRAW_CMD's expected payload size

/// Finds serial ports belonging to LED Matrix modules.
///
/// Both panels share the same VID/PID, so individual panels are
/// disambiguated by sorted port name (index 0 = Left, index 1 = Right).
/// This ordering is an assumption pending verification against real
/// dual-panel hardware — if panels come back swapped, flip the index
/// mapping in [`port_for_panel`].
fn find_matrix_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    let mut matches: Vec<String> = ports
        .into_iter()
        .filter(|p| {
            matches!(&p.port_type, SerialPortType::UsbPort(info) if info.vid == FRAMEWORK_VID && info.pid == MATRIX_PID)
        })
        .map(|p| p.port_name)
        .collect();
    matches.sort();
    Ok(matches)
}

/// Opens a fresh serial connection to the given panel (`"Left"` or
/// `"Right"`), looking it up fresh via [`find_matrix_ports`] each call —
/// there is no persistent/cached handle, unlike `keyboard_mapper`'s HID
/// state.
fn port_for_panel(panel: &str) -> Result<Box<dyn SerialPort>, String> {
    let index = match panel {
        "Left" => 0,
        "Right" => 1,
        other => return Err(format!("Unknown panel '{other}', expected 'Left' or 'Right'")),
    };

    let ports = find_matrix_ports()?;
    let port_name = ports
        .get(index)
        .ok_or_else(|| format!("{panel} Matrix panel not found ({} port(s) detected)", ports.len()))?;

    serialport::new(port_name, BAUD_RATE)
        .timeout(Duration::from_millis(200))
        .open()
        .map_err(|e| format!("Failed to open port {port_name}: {e}"))
}

/// Frames and writes one command: `MAGIC ++ [cmd] ++ params`, per the
/// protocol documented at the top of this module.
fn send_command(port: &mut dyn SerialPort, cmd: u8, params: &[u8]) -> Result<(), String> {
    let mut bytes = Vec::with_capacity(MAGIC.len() + 1 + params.len());
    bytes.extend_from_slice(&MAGIC);
    bytes.push(cmd);
    bytes.extend_from_slice(params);
    port.write_all(&bytes).map_err(|e| e.to_string())
}

/// Packs a flat `MATRIX_WIDTH * MATRIX_HEIGHT` brightness buffer
/// (0 = off, >0 = on) into the 1-bit-per-pixel, 39-byte layout DRAW_CMD
/// expects: bit `i` (LSB-first within each byte) corresponds to
/// `row * MATRIX_WIDTH + col`, mirroring dotmatrixtool's
/// `prepareValsForDrawing*` helpers.
fn pack_pixels(pixels: &[u8]) -> [u8; PACKED_LEN] {
    let mut out = [0u8; PACKED_LEN];
    for (i, &value) in pixels.iter().enumerate().take(MATRIX_WIDTH * MATRIX_HEIGHT) {
        if value > 0 {
            out[i / 8] |= 1 << (i % 8);
        }
    }
    out
}

/// Draws a full frame to one LED Matrix panel.
///
/// # Arguments
/// * `img_data` - Flat brightness buffer, length `MATRIX_WIDTH * MATRIX_HEIGHT`, 0-255 per pixel.
/// * `panel` - Which physical panel to target: `"Left"` or `"Right"`.
///
/// # Errors
/// Returns an error string if the buffer length is wrong, no matching
/// port is found, or the write fails.
#[tauri::command]
pub fn update_matrix(img_data: Vec<u8>, panel: String) -> Result<String, String> {
    let expected_len = MATRIX_WIDTH * MATRIX_HEIGHT;
    if img_data.len() != expected_len {
        return Err(format!("Expected {expected_len} pixels, got {}", img_data.len()));
    }

    println!("update_matrix panel:{panel} len:{} lit_pixels:{}", img_data.len(), img_data.iter().filter(|&&v| v > 0).count());
    let mut port = port_for_panel(&panel)?;
    let packed = pack_pixels(&img_data);
    let result = send_command(port.as_mut(), CMD_DRAW, &packed);
    println!("update_matrix write result: {:?}", result);
    result?;

    Ok("Updated".to_string())
}

/// Sets LED brightness (0-255) on one panel.
#[tauri::command]
pub fn set_matrix_brightness(panel: String, brightness: u8) -> Result<String, String> {
    let mut port = port_for_panel(&panel)?;
    send_command(port.as_mut(), CMD_BRIGHTNESS, &[brightness])?;
    Ok("Brightness updated".to_string())
}

/// Puts one panel to sleep or wakes it.
#[tauri::command]
pub fn set_matrix_sleep(panel: String, sleep: bool) -> Result<String, String> {
    let mut port = port_for_panel(&panel)?;
    send_command(port.as_mut(), CMD_SLEEP, &[sleep as u8])?;
    Ok(if sleep { "Sleeping".to_string() } else { "Awake".to_string() })
}
