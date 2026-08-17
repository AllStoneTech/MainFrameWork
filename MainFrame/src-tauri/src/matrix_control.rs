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
//! Linux. The module ships as up to two independent 9x34 boards, each its
//! own serial port, referred to here as "Panel 1"/"Panel 2" rather than
//! "Left"/"Right" — see [`port_for_panel`] for why.
//!
//! Framing, `CMD_DRAW`'s 39-byte bit-packing, and `CMD_BRIGHTNESS` have
//! been confirmed against a real module (VID_32AC/PID_0020 on Windows,
//! enumerated as `USB Serial Device`) — sending the raw bytes lit the
//! panel fully on as expected. One gotcha found the hard way: `CMD_SLEEP`
//! persists on-device across app restarts, and a `CMD_DRAW` sent while
//! asleep writes successfully (`Ok(())`) but shows nothing until the
//! panel is woken. [`send_visible_command`] handles this by waking the
//! panel immediately before anything meant to be seen, rather than
//! leaving "is it asleep?" as a manual troubleshooting step.
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
/// disambiguated by sorted port name (index 0 = "Panel 1", index 1 =
/// "Panel 2"). There's no way to query which physical bay a port belongs
/// to, so these are deliberately *not* called "Left"/"Right" — a real
/// single-panel setup came back mapped to index 0 while physically
/// installed on the right, which would have made a "Left" label a lie.
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

/// Opens a fresh serial connection to the given panel (`"Panel 1"` or
/// `"Panel 2"`), looking it up fresh via [`find_matrix_ports`] each call —
/// there is no persistent/cached handle, unlike `keyboard_mapper`'s HID
/// state.
fn port_for_panel(panel: &str) -> Result<Box<dyn SerialPort>, String> {
    let index = match panel {
        "Panel 1" => 0,
        "Panel 2" => 1,
        other => return Err(format!("Unknown panel '{other}', expected 'Panel 1' or 'Panel 2'")),
    };

    let ports = find_matrix_ports()?;
    let port_name = ports
        .get(index)
        .ok_or_else(|| format!("{panel} not found ({} LED Matrix port(s) detected)", ports.len()))?;

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

/// Wakes the panel, then sends `cmd`. Use this instead of [`send_command`]
/// directly for anything meant to have a visible effect (drawing,
/// brightness) — see the module doc comment for why. Not used for
/// `CMD_SLEEP` itself, since deliberately putting the panel to sleep
/// shouldn't wake it first.
fn send_visible_command(port: &mut dyn SerialPort, cmd: u8, params: &[u8]) -> Result<(), String> {
    send_command(port, CMD_SLEEP, &[0])?;
    send_command(port, cmd, params)
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
/// * `panel` - Which panel to target: `"Panel 1"` or `"Panel 2"`.
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

    let mut port = port_for_panel(&panel)?;
    let packed = pack_pixels(&img_data);
    send_visible_command(port.as_mut(), CMD_DRAW, &packed)?;

    Ok("Updated".to_string())
}

/// Sets LED brightness (0-255) on one panel.
#[tauri::command]
pub fn set_matrix_brightness(panel: String, brightness: u8) -> Result<String, String> {
    let mut port = port_for_panel(&panel)?;
    send_visible_command(port.as_mut(), CMD_BRIGHTNESS, &[brightness])?;
    Ok("Brightness updated".to_string())
}

/// Puts one panel to sleep or wakes it.
#[tauri::command]
pub fn set_matrix_sleep(panel: String, sleep: bool) -> Result<String, String> {
    let mut port = port_for_panel(&panel)?;
    send_command(port.as_mut(), CMD_SLEEP, &[sleep as u8])?;
    Ok(if sleep { "Sleeping".to_string() } else { "Awake".to_string() })
}

/// Maps a Laptop 16 input-module USB hub-port chain to a bay label.
///
/// The 5 raw `(port, port)` tuples are reverse-engineered by Framework's
/// own team in `framework_lib::inputmodule::check_inputmodule_version` —
/// not officially documented, and specific to the Laptop 16's internal USB
/// wiring, hence this whole feature being gated to that one platform. That
/// source only labels them by position in an ASCII diagram of 3 bays then
/// a gap then 2 bays; the "left of keyboard" / "right of keyboard" reading
/// below is this project's own interpretation of that gap, empirically
/// confirmed for exactly one case — `(3, 3)` — against a real single-panel
/// setup physically installed on the right. The other four are inferred
/// from the same grouping, not independently verified.
fn bay_label(port_numbers: &[u8]) -> Option<String> {
    if port_numbers.len() != 2 {
        return None;
    }
    let label = match (port_numbers[0], port_numbers[1]) {
        (4, 2) => "left bay 1 of 3",
        (4, 3) => "left bay 2 of 3",
        (3, 1) => "left bay 3 of 3",
        (3, 2) => "right bay 1 of 2",
        (3, 3) => "right bay 2 of 2", // Confirmed — see doc comment above.
        _ => return None,
    };
    Some(label.to_string())
}

/// Best-effort physical bay position for a *single* connected LED Matrix
/// panel, via USB hub-port topology (see [`bay_label`]).
///
/// Only handles the unambiguous case — exactly one Matrix module found via
/// `rusb`. With two panels connected there's no verified way (yet) to
/// correlate a given `rusb` device back to which `"Panel 1"`/`"Panel 2"`
/// it corresponds to in [`find_matrix_ports`]'s serial-port view, so this
/// deliberately returns `None` rather than guess which bay goes with which
/// panel selector — the same caution that kept the selector itself
/// labeled "Panel 1"/"Panel 2" instead of asserting a side.
#[tauri::command]
pub fn get_matrix_bay_hint() -> Option<String> {
    if !crate::system_info::is_framework16() {
        return None;
    }

    let devices = rusb::devices().ok()?;
    let mut matrix_devices = devices.iter().filter(|dev| {
        dev.device_descriptor()
            .map(|d| d.vendor_id() == FRAMEWORK_VID && d.product_id() == MATRIX_PID)
            .unwrap_or(false)
    });

    let device = matrix_devices.next()?;
    if matrix_devices.next().is_some() {
        return None; // Two panels — see doc comment above.
    }

    let port_numbers = device.port_numbers().ok()?;
    bay_label(&port_numbers)
}
