use hidapi::{HidApi, HidDevice};
use std::sync::Mutex;

const FRAMEWORK_VID: u16 = 0x32AC;
const USAGE_PAGE: u16 = 0xFF60; // Raw HID usage page VIA uses

// VIA protocol constants, taken directly from QMK's quantum/via.c /
// quantum/via.h, and cross-checked against FrameworkComputer/qmk_hid's own
// src/via.rs (Framework's official CLI for this exact protocol) — its
// ViaRgbMatrixValue enum matches these four values exactly. Confirmed
// against real hardware: mode 1 (Solid Color) lit up and cycled colors.
//
// Effect *numbers* beyond mode 1 are NOT reliably the generic upstream QMK
// ordering: Framework's qmk_hid README states mode 38 is
// `SOLID_REACTIVE_MULTICROSS`, a Framework-specific effect variant. Tracing
// its source (solid_reactive_cross.h) shows it's registered by a second,
// independent `#ifdef` in the same file as the standard "Solid Reactive
// Cross" effect — so if Framework enables both (their docs say they
// "enable all"), that one file alone contributes two enum slots instead of
// one, shifting every mode number after it. There may be other files doing
// the same. Treat any label here other than mode 1 and mode 38 as a
// best-effort guess, not a confirmed fact — see LightingTab.tsx's UI
// disclaimer for the user-facing version of this caveat.
const VIA_CMD_CUSTOM_SET_VALUE: u8 = 0x07;
const VIA_CMD_CUSTOM_SAVE: u8 = 0x09;
const VIA_CHANNEL_RGB_MATRIX: u8 = 3;
const VIA_RGB_MATRIX_VALUE_BRIGHTNESS: u8 = 1;
const VIA_RGB_MATRIX_VALUE_EFFECT: u8 = 2;
const VIA_RGB_MATRIX_VALUE_EFFECT_SPEED: u8 = 3;
const VIA_RGB_MATRIX_VALUE_COLOR: u8 = 4;

/// Caches the HidApi context and an open device handle across calls, so
/// each command doesn't pay for a full HID re-enumeration.
#[derive(Default)]
pub struct KeyboardHidState {
    api: Mutex<Option<HidApi>>,
    device: Mutex<Option<HidDevice>>,
}

fn find_and_open(api: &HidApi) -> Result<HidDevice, String> {
    let device_info = api
        .device_list()
        .find(|d| d.vendor_id() == FRAMEWORK_VID && d.usage_page() == USAGE_PAGE)
        .ok_or("Keyboard not found (Raw HID Interface missing)".to_string())?;
    device_info.open_device(api).map_err(|e| e.to_string())
}

/// Builds a VIA packet for the RGB Matrix channel: `[report_id, command_id,
/// channel_id, ...rest]`. Used for both `id_custom_set_value` (rest =
/// `[value_id, ...value_data]`) and `id_custom_save` (rest empty).
fn build_channel_packet(command_id: u8, channel: u8, rest: &[u8]) -> [u8; 32] {
    let mut packet = [0u8; 32];
    packet[0] = 0x00; // HID report ID (unused, hidapi still wants the byte)
    packet[1] = command_id;
    packet[2] = channel;
    packet[3..3 + rest.len()].copy_from_slice(rest);
    packet
}

/// sRGB (0-255 each) to QMK's HSV convention: hue/sat/val all scaled to
/// 0-255 (not the usual 0-360 degree hue).
fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
    let (rf, gf, bf) = (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let delta = max - min;

    let hue_deg = if delta == 0.0 {
        0.0
    } else if max == rf {
        60.0 * (((gf - bf) / delta).rem_euclid(6.0))
    } else if max == gf {
        60.0 * (((bf - rf) / delta) + 2.0)
    } else {
        60.0 * (((rf - gf) / delta) + 4.0)
    };

    let sat = if max == 0.0 { 0.0 } else { delta / max };

    (
        ((hue_deg / 360.0) * 255.0).round() as u8,
        (sat * 255.0).round() as u8,
        (max * 255.0).round() as u8,
    )
}

/// Sends a packet, reopening the cached device handle once and retrying
/// if the write fails (handle may be stale after an unplug/replug).
fn send_with_retry(state: &KeyboardHidState, packet: &[u8; 32]) -> Result<(), String> {
    let mut api_guard = state.api.lock().map_err(|e| e.to_string())?;
    if api_guard.is_none() {
        *api_guard = Some(HidApi::new().map_err(|e| e.to_string())?);
    }
    let api = api_guard.as_ref().unwrap();

    let mut device_guard = state.device.lock().map_err(|e| e.to_string())?;
    if device_guard.is_none() {
        *device_guard = Some(find_and_open(api)?);
    }

    if device_guard.as_ref().unwrap().write(packet).is_err() {
        let reopened = find_and_open(api)?;
        reopened.write(packet).map_err(|e| e.to_string())?;
        *device_guard = Some(reopened);
    }

    Ok(())
}

/// Selects an RGB Matrix effect by its firmware mode number (1-39 on
/// stock QMK — see quantum/rgb_matrix/animations/rgb_matrix_effects.inc;
/// 0 turns the matrix off). Effects like Breathing, Rainbow cycles, and
/// Solid Reactive are all handled entirely by the firmware once selected
/// — no host polling needed.
#[tauri::command]
pub fn set_keyboard_effect(state: tauri::State<KeyboardHidState>, mode: u8) -> Result<String, String> {
    send_with_retry(&state, &build_channel_packet(VIA_CMD_CUSTOM_SET_VALUE, VIA_CHANNEL_RGB_MATRIX, &[VIA_RGB_MATRIX_VALUE_EFFECT, mode]))?;
    Ok("Effect Updated".to_string())
}

/// Sets RGB Matrix effect speed (0-255). For effects with no user "end
/// color" (there isn't one in the VIA protocol — see LightingTab.tsx's
/// doc comment), this is what actually controls how much color/position
/// spread the animation has, e.g. how far Gradient's hue shifts from one
/// edge of the keyboard to the other.
#[tauri::command]
pub fn set_keyboard_effect_speed(state: tauri::State<KeyboardHidState>, speed: u8) -> Result<String, String> {
    send_with_retry(&state, &build_channel_packet(VIA_CMD_CUSTOM_SET_VALUE, VIA_CHANNEL_RGB_MATRIX, &[VIA_RGB_MATRIX_VALUE_EFFECT_SPEED, speed]))?;
    Ok("Effect Speed Updated".to_string())
}

/// Sets RGB Matrix brightness (0-255), independent of color/effect.
#[tauri::command]
pub fn set_keyboard_brightness(state: tauri::State<KeyboardHidState>, brightness: u8) -> Result<String, String> {
    send_with_retry(&state, &build_channel_packet(VIA_CMD_CUSTOM_SET_VALUE, VIA_CHANNEL_RGB_MATRIX, &[VIA_RGB_MATRIX_VALUE_BRIGHTNESS, brightness]))?;
    Ok("Brightness Updated".to_string())
}

/// Sets RGB Matrix color (hue+saturation only — brightness is a separate
/// value, see `set_keyboard_brightness`).
#[tauri::command]
pub fn set_keyboard_color(state: tauri::State<KeyboardHidState>, r: u8, g: u8, b: u8) -> Result<String, String> {
    let (hue, sat, _val) = rgb_to_hsv(r, g, b);
    send_with_retry(&state, &build_channel_packet(VIA_CMD_CUSTOM_SET_VALUE, VIA_CHANNEL_RGB_MATRIX, &[VIA_RGB_MATRIX_VALUE_COLOR, hue, sat]))?;
    Ok("Color Updated".to_string())
}

/// Commits the current effect/brightness/color to the keyboard's EEPROM
/// so it's remembered on its own, without MainFrameWork running. VIA's
/// `id_custom_set_value` writes apply live but don't persist
/// (`_noeeprom` in via.c) until this is called — callers should debounce
/// this rather than calling it on every slider tick, since EEPROM has a
/// limited write-cycle lifetime.
#[tauri::command]
pub fn save_keyboard_lighting(state: tauri::State<KeyboardHidState>) -> Result<String, String> {
    send_with_retry(&state, &build_channel_packet(VIA_CMD_CUSTOM_SAVE, VIA_CHANNEL_RGB_MATRIX, &[]))?;
    Ok("Saved".to_string())
}
