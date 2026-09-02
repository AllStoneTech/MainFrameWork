//! VIA/raw-HID keyboard service: RGB Matrix lighting control, and (below
//! the lighting section) keymap + macro editing via QMK's dynamic-keymap
//! commands. Both talk to the keyboard's Raw HID interface, sharing
//! [`KeyboardHidState`]'s cached `HidApi`/`HidDevice`.
//!
//! **Firmware-version caveat for the keymap/macro half specifically**:
//! unlike the RGB Matrix custom-channel commands above (confirmed
//! against real hardware, per their own doc comments), the dynamic-keymap
//! commands depend on the keyboard's firmware actually having that
//! feature built in. They're implemented here against
//! `FrameworkComputer/qmk_firmware`, branch `fl16-2026-remap-keys`
//! (fetched 2026-09-01) — a branch name that reads as in-progress work
//! adding this capability, with no confirmation that exact branch is
//! what's flashed on a given keyboard right now. If it isn't, these
//! commands should fail cleanly (`id_unhandled` echoed back, or a
//! timeout on the read) rather than silently doing the wrong thing — see
//! `via_get_layer_count`'s doc comment for how that's surfaced.
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

// Dynamic-keymap VIA command IDs, from quantum/via.h in qmk/qmk_firmware
// @ master (fetched 2026-09-01) — a stable part of the VIA protocol
// itself (unlike the RGB Matrix effect-number caveats above, these
// command IDs aren't Framework-specific and aren't expected to drift).
const VIA_CMD_GET_KEYCODE: u8 = 0x04;
const VIA_CMD_SET_KEYCODE: u8 = 0x05;
const VIA_CMD_KEYMAP_RESET: u8 = 0x06;
const VIA_CMD_MACRO_GET_COUNT: u8 = 0x0C;
const VIA_CMD_MACRO_GET_BUFFER_SIZE: u8 = 0x0D;
const VIA_CMD_MACRO_GET_BUFFER: u8 = 0x0E;
const VIA_CMD_MACRO_SET_BUFFER: u8 = 0x0F;
const VIA_CMD_MACRO_RESET: u8 = 0x10;
const VIA_CMD_GET_LAYER_COUNT: u8 = 0x11;

/// Timeout for reading back a VIA command's response report. VIA
/// commands are normally answered within a couple milliseconds — this is
/// generous headroom, not a tuned value, so a genuinely unresponsive
/// keyboard (firmware doesn't support this command — see this module's
/// doc comment) fails within a second rather than hanging.
const HID_READ_TIMEOUT_MS: i32 = 1000;

/// Max payload bytes per get/set-buffer packet (macro buffer reads/
/// writes are too big for one HID report, so they're chunked). QMK's own
/// `via.c` caps a chunk at 28 bytes, assuming a 32-byte raw HID report
/// with the command byte as the report's own first byte. This project's
/// packets are a flat `[u8; 32]` with an extra leading dummy byte
/// hidapi's `write()` requires (see `build_channel_packet`'s doc comment
/// above) — so one of those 32 bytes is spent on that dummy instead of
/// payload, leaving room for only 27. Confirmed this isn't a bug specific
/// to this codebase: Framework's own `qmk_hid` CLI
/// (FrameworkComputer/qmk_hid @ main, `src/raw_hid.rs`,
/// `RAW_HID_BUFFER_SIZE = 32` with `data[0] = 0x00` as the same dummy
/// byte) uses the identical convention, so 27 is what Framework's actual
/// raw HID framing supports, not 28.
///
/// Derivation: of the 32 bytes, byte 0 is the dummy, byte 1 is the
/// command id, bytes 2-3 are the big-endian offset, byte 4 is this size
/// byte, leaving bytes 5-31 (27 bytes) for payload.
const MAX_BUFFER_CHUNK: u8 = 27;

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

// --- Keymap & Macro editing (QMK dynamic-keymap commands) ---
//
// Unlike the RGB Matrix channel above, dynamic-keymap writes
// (`nvm_dynamic_keymap_update_keycode`/`_macro_update_buffer` in QMK's
// `dynamic_keymap.c`) go straight to EEPROM on every call — there's no
// separate "Save" commit step needed here.

/// Builds a VIA packet with no channel byte: `[report_id, command_id,
/// ...rest]` — the shape `id_dynamic_keymap_*`/`id_get_layer_count` use,
/// as opposed to `build_channel_packet`'s `[report_id, command_id,
/// channel_id, ...]` shape for the custom-value channel commands above.
fn build_simple_packet(command_id: u8, rest: &[u8]) -> [u8; 32] {
    let mut packet = [0u8; 32];
    packet[0] = 0x00;
    packet[1] = command_id;
    packet[2..2 + rest.len()].copy_from_slice(rest);
    packet
}

/// Writes `packet`, then reads back one 32-byte input report — for VIA
/// commands that return data (keymap/macro reads, layer count), unlike
/// the RGB Lighting commands above which are fire-and-forget.
///
/// Deliberately does *not* delegate the write half to [`send_with_retry`]
/// and then lock `state.device` again for the read: that would drop the
/// lock between write and read, and the Keymap editor fires many of
/// these back-to-back (e.g. reading every key on a layer) — a second
/// call's write could land in that gap, and this call's read would then
/// come back with the wrong command's response. Holding `device_guard`
/// across both the write and the read makes each call one atomic
/// request/response round trip, so concurrent callers serialize safely
/// on this lock instead of interleaving on the wire.
fn send_and_read(state: &KeyboardHidState, packet: &[u8; 32]) -> Result<[u8; 32], String> {
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

    let mut response = [0u8; 32];
    device_guard
        .as_ref()
        .unwrap()
        .read_timeout(&mut response, HID_READ_TIMEOUT_MS)
        .map_err(|e| format!("No response from keyboard (firmware may not support this command): {e}"))?;
    Ok(response)
}

/// Number of keymap layers the firmware actually has (`keymaps[][][]`'s
/// first dimension) — the Keymap editor should only offer this many
/// layer tabs, not assume a fixed count, since that's compiled into
/// firmware and this app has no other way to know it.
///
/// Response byte layout here and in every command below is derived from
/// `via.c`'s `case` handlers (each documented at the call site) by
/// mapping its `command_data[i]` (== `data[1+i]`) onto this project's
/// packet framing (`data[N]` == `packet[N+1]`, since `packet[1]` carries
/// what `via.c` calls `data[0]`) — see `MAX_BUFFER_CHUNK`'s doc comment
/// for the same mapping applied to the buffer commands below.
#[tauri::command]
pub fn get_keymap_layer_count(state: tauri::State<KeyboardHidState>) -> Result<u8, String> {
    let response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_LAYER_COUNT, &[]))?;
    Ok(response[2])
}

/// Reads the keycode currently assigned to one (layer, row, col) matrix
/// position. Row/col addressing (rather than a linear buffer offset) is
/// the point of this command over the bulk `id_dynamic_keymap_get_buffer`
/// — the firmware resolves the position internally, so the host never
/// needs to know the matrix's total row/col counts as a prerequisite.
///
/// `via.c`: `case id_dynamic_keymap_get_keycode` reads `command_data[0..3)`
/// as `(layer, row, col)` and writes the keycode's two bytes (big-endian)
/// to `command_data[3]`/`command_data[4]`.
#[tauri::command]
pub fn get_keymap_keycode(state: tauri::State<KeyboardHidState>, layer: u8, row: u8, col: u8) -> Result<u16, String> {
    let response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_KEYCODE, &[layer, row, col]))?;
    Ok(u16::from_be_bytes([response[5], response[6]]))
}

/// Sets the keycode at one (layer, row, col) matrix position. Persists
/// immediately (see this section's doc comment) — no separate save call.
#[tauri::command]
pub fn set_keymap_keycode(
    state: tauri::State<KeyboardHidState>,
    layer: u8,
    row: u8,
    col: u8,
    keycode: u16,
) -> Result<String, String> {
    let [hi, lo] = keycode.to_be_bytes();
    send_with_retry(&state, &build_simple_packet(VIA_CMD_SET_KEYCODE, &[layer, row, col, hi, lo]))?;
    Ok("Keycode set".to_string())
}

/// Resets every layer's keymap back to the firmware's compiled-in
/// default — irreversible from MainFrameWork's side (there's no "undo",
/// only whatever the firmware shipped with). The frontend should gate
/// this behind an explicit confirmation rather than exposing it as a
/// plain button.
#[tauri::command]
pub fn reset_keymap(state: tauri::State<KeyboardHidState>) -> Result<String, String> {
    send_with_retry(&state, &build_simple_packet(VIA_CMD_KEYMAP_RESET, &[]))?;
    Ok("Keymap reset to firmware default".to_string())
}

/// Number of macro slots the firmware supports — the Macros tab should
/// list exactly this many slots (padding/truncating whatever the buffer
/// itself 0x00-splits to, since a fresh/short buffer can 0x00-split to
/// fewer segments than this — see `macroEncoding.ts`'s `ensureSlotCount`
/// on the frontend).
#[tauri::command]
pub fn get_macro_count(state: tauri::State<KeyboardHidState>) -> Result<u8, String> {
    let response = send_and_read(&state, &build_simple_packet(VIA_CMD_MACRO_GET_COUNT, &[]))?;
    Ok(response[2])
}

fn via_macro_buffer_size(state: &KeyboardHidState) -> Result<u16, String> {
    let response = send_and_read(state, &build_simple_packet(VIA_CMD_MACRO_GET_BUFFER_SIZE, &[]))?;
    Ok(u16::from_be_bytes([response[2], response[3]]))
}

/// Total capacity (bytes) of the macro EEPROM region — every macro
/// slot's encoded bytes share this one fixed-size pool (see
/// `get_macro_buffer`'s doc comment), so the frontend needs this to warn
/// before a save that would overflow it rather than let a chunked write
/// silently run past the space that's actually there.
#[tauri::command]
pub fn get_macro_buffer_size(state: tauri::State<KeyboardHidState>) -> Result<u16, String> {
    via_macro_buffer_size(&state)
}

fn via_macro_get_chunk(state: &KeyboardHidState, offset: u16, size: u8) -> Result<Vec<u8>, String> {
    let [offset_hi, offset_lo] = offset.to_be_bytes();
    let response = send_and_read(state, &build_simple_packet(VIA_CMD_MACRO_GET_BUFFER, &[offset_hi, offset_lo, size]))?;
    Ok(response[5..5 + size as usize].to_vec())
}

fn via_macro_set_chunk(state: &KeyboardHidState, offset: u16, chunk: &[u8]) -> Result<(), String> {
    let [offset_hi, offset_lo] = offset.to_be_bytes();
    let mut rest = Vec::with_capacity(3 + chunk.len());
    rest.push(offset_hi);
    rest.push(offset_lo);
    rest.push(chunk.len() as u8);
    rest.extend_from_slice(chunk);
    send_with_retry(state, &build_simple_packet(VIA_CMD_MACRO_SET_BUFFER, &rest))
}

/// Reads the entire macro buffer, chunked into `MAX_BUFFER_CHUNK`-sized
/// reads (one HID report can't carry the whole thing — the buffer holds
/// every macro slot's encoded steps concatenated together, each
/// terminated by a single `0x00` byte, so it's easily hundreds of bytes).
/// The frontend (`macroEncoding.ts`) owns splitting this back into
/// individual slots and decoding each slot's steps.
#[tauri::command]
pub fn get_macro_buffer(state: tauri::State<KeyboardHidState>) -> Result<Vec<u8>, String> {
    let total_size = via_macro_buffer_size(&state)?;
    let mut buffer = Vec::with_capacity(total_size as usize);
    let mut offset: u16 = 0;
    while offset < total_size {
        let chunk_size = (total_size - offset).min(MAX_BUFFER_CHUNK as u16) as u8;
        buffer.extend(via_macro_get_chunk(&state, offset, chunk_size)?);
        offset += chunk_size as u16;
    }
    Ok(buffer)
}

/// Writes the entire macro buffer, chunked the same way `get_macro_buffer`
/// reads it. `data` must fit within `get_macro_buffer_size`'s value — the
/// macro EEPROM region is a fixed size, it can't grow to fit more; the
/// frontend should check that before calling this rather than relying on
/// this command to reject an oversized write cleanly (a chunked write
/// that runs past the real capacity has no well-defined firmware-side
/// behavior here, so this deliberately doesn't attempt to allow for it).
#[tauri::command]
pub fn set_macro_buffer(state: tauri::State<KeyboardHidState>, data: Vec<u8>) -> Result<String, String> {
    let mut offset: u16 = 0;
    while (offset as usize) < data.len() {
        let end = (offset as usize + MAX_BUFFER_CHUNK as usize).min(data.len());
        via_macro_set_chunk(&state, offset, &data[offset as usize..end])?;
        offset = end as u16;
    }
    Ok("Macro buffer saved".to_string())
}

/// Clears every macro slot back to empty. Irreversible, same caveat as
/// `reset_keymap` — the frontend should gate this behind confirmation.
#[tauri::command]
pub fn reset_macros(state: tauri::State<KeyboardHidState>) -> Result<String, String> {
    send_with_retry(&state, &build_simple_packet(VIA_CMD_MACRO_RESET, &[]))?;
    Ok("Macros reset".to_string())
}
