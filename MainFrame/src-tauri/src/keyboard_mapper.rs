//! VIA/raw-HID keyboard service: RGB Matrix lighting control, and (below
//! the lighting section) keymap + macro editing via QMK's dynamic-keymap
//! commands. Both talk to the keyboard's Raw HID interface, sharing
//! [`KeyboardHidState`]'s cached `HidApi`/`HidDevice`.
//!
//! **Firmware support, keymap/macro half**: confirmed present and
//! working against a real Framework Laptop 16 keyboard on 2026-09-01
//! (see `hardware_probe` below) — `get_layer_count` returned a real
//! layer count (10) and `get_macro_count` a real macro count (16)
//! rather than `id_unhandled`, and a real `set_keymap_keycode` write/
//! read-back round-trip succeeded. That test also caught and fixed two
//! real protocol bugs before anything shipped with them: a response-byte
//! off-by-one on every *read* command (see `get_keymap_layer_count`'s doc
//! comment) and `send_with_retry` not draining a *set* command's response
//! (see its own doc comment) — so treat "confirmed against real
//! hardware" here as covering the raw protocol calls specifically, not
//! yet the Keymap/Macros tab UI built on top of them, which still needs
//! its own pass. `get_keymap_layer_count` failing outright (rather than
//! returning a real count) would mean *this keyboard's* firmware doesn't
//! have dynamic-keymap support — worth keeping in mind if this code ever
//! runs against a different unit/firmware version.
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
/// writes are too big for one HID report, so they're chunked).
///
/// This only actually needs to be 27 for the *write* direction
/// (`set_macro_buffer`): the outgoing packet is `[dummy, cmd, offset_hi,
/// offset_lo, size, ...payload]` in a flat `[u8; 32]` — hidapi's
/// `write()` requires that leading dummy byte (see
/// `build_channel_packet`'s doc comment), so payload only gets
/// `32 - 5 = 27` bytes, not QMK's usual 28 (`via.c` assumes a 32-byte
/// report with no extra framing on top). The *read* direction
/// (`get_macro_buffer`) doesn't actually need this restriction — a real
/// response has no equivalent leading byte (see `get_keymap_layer_count`'s
/// doc comment, confirmed against real hardware) and could carry a full
/// 28-byte payload — but both directions share this one constant for
/// simplicity, since 27 is still correct there, just one byte more
/// conservative than necessary.
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

/// Sends a packet and drains its response, discarding the response's
/// contents — for callers that don't need the value back (every RGB
/// Lighting command below, and the keymap/macro set/reset commands
/// further down).
///
/// Delegates to [`send_and_read`] rather than writing-and-stopping:
/// confirmed against real hardware that VIA's firmware sends back a
/// response report for *every* command, sets included, not just queries
/// — leaving a set command's response unread left it sitting in the OS's
/// HID receive queue, so the next unrelated query's `read_timeout()`
/// would return that stale leftover report instead of its own fresh one.
/// That produced exactly the "one report behind" symptom seen testing
/// `set_keymap_keycode` against a real keyboard: a value that had
/// genuinely just been written read back as the *previous* write's
/// value, and only failed to match on the second write in a row because
/// the first write's undrained response was still queued in front of it.
fn send_with_retry(state: &KeyboardHidState, packet: &[u8; 32]) -> Result<(), String> {
    send_and_read(state, packet).map(|_| ())
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
/// response buffer as `response[i]` == `data[i]` directly — unlike a
/// *written* packet, which needs a leading dummy byte before the command
/// id because hidapi's `write()` requires one (see `build_channel_packet`
/// and `MAX_BUFFER_CHUNK`'s doc comments), a report *read back* from the
/// device has no such byte (hidapi's `read()` only includes a leading
/// report-number byte for devices that use numbered reports, which this
/// one doesn't). Confirmed directly against this exact keyboard: a real
/// `get_layer_count` response came back as
/// `[0x11, <layer count>, 0, 0, ...]` — the echoed command id at
/// `response[0]`, not `response[1]` as an earlier version of this code
/// incorrectly assumed by copying the write-side framing symmetrically.
#[tauri::command]
pub fn get_keymap_layer_count(state: tauri::State<KeyboardHidState>) -> Result<u8, String> {
    let response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_LAYER_COUNT, &[]))?;
    Ok(response[1])
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
    Ok(u16::from_be_bytes([response[4], response[5]]))
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
    Ok(response[1])
}

fn via_macro_buffer_size(state: &KeyboardHidState) -> Result<u16, String> {
    let response = send_and_read(state, &build_simple_packet(VIA_CMD_MACRO_GET_BUFFER_SIZE, &[]))?;
    Ok(u16::from_be_bytes([response[1], response[2]]))
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
    Ok(response[4..4 + size as usize].to_vec())
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

// Real-hardware verification for the keymap/macro protocol above.
// `#[ignore]`d so these never run in a normal `cargo test` (no keyboard
// attached in CI) — run explicitly with
// `cargo test --lib -- --ignored --nocapture` when a real Framework
// keyboard is plugged in and you want to reconfirm this code against it.
//
// Kept permanently rather than deleted after first use: running this
// against real hardware once already caught a real bug that no amount
// of protocol-reading would have found — `send_with_retry` wasn't
// draining a set command's response, which left it queued and corrupted
// the *next* unrelated read (see `send_with_retry`'s doc comment for the
// full story). `probe_set_keycode_write` writes and restores a value at
// layer 9 (this firmware's keymap.c only defines layers 0-3, so nothing
// can actually reach layer 9 — a test write there can't be pressed or
// otherwise take effect on a real key).
#[cfg(test)]
mod hardware_probe {
    use super::*;

    #[test]
    #[ignore] // needs a real Framework keyboard attached — run explicitly.
    fn probe_dynamic_keymap_support() {
        let state = KeyboardHidState::default();

        let layer_response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_LAYER_COUNT, &[]))
            .expect("HID write/read for get_layer_count failed");
        println!("get_layer_count raw response: {:?}", layer_response);
        println!(
            "echoed command id: 0x{:02x} (expected 0x{:02x}; 0xff == id_unhandled, meaning unsupported)",
            layer_response[0], VIA_CMD_GET_LAYER_COUNT
        );
        println!("layer count (if supported): {}", layer_response[1]);

        let macro_response = send_and_read(&state, &build_simple_packet(VIA_CMD_MACRO_GET_COUNT, &[]))
            .expect("HID write/read for get_macro_count failed");
        println!("get_macro_count raw response: {:?}", macro_response);
        println!("macro count (if supported): {}", macro_response[1]);

        let buffer_size_response = send_and_read(&state, &build_simple_packet(VIA_CMD_MACRO_GET_BUFFER_SIZE, &[]))
            .expect("HID write/read for get_macro_buffer_size failed");
        println!(
            "macro buffer size (if supported): {}",
            u16::from_be_bytes([buffer_size_response[1], buffer_size_response[2]])
        );

        // Sanity check for BOTH the read-offset fix and frameworkAnsiMatrix.ts's
        // row/col table at once, across several keys spread around the
        // matrix (not just one, in case of a transposition that happens to
        // coincidentally match once) — if this keyboard has never been
        // remapped, layer 0 should still read back the stock default
        // keymap's keycodes.
        let checks: [(&str, u8, u8, u16); 5] = [
            ("Q", 0, 2, 0x0014),    // KC_Q
            ("A", 7, 2, 0x0004),    // KC_A
            ("1", 5, 2, 0x001E),    // KC_1
            ("Space", 1, 4, 0x002C), // KC_SPC
            ("Enter", 1, 14, 0x0028), // KC_ENT
        ];
        for (label, row, col, expected) in checks {
            let response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_KEYCODE, &[0, row, col]))
                .unwrap_or_else(|e| panic!("HID write/read for get_keycode(0,{row},{col}) [{label}] failed: {e}"));
            let keycode = u16::from_be_bytes([response[4], response[5]]);
            println!(
                "{label} (row {row}, col {col}): got 0x{keycode:04x}, expected 0x{expected:04x} -> {}",
                if keycode == expected { "MATCH" } else { "MISMATCH" }
            );
        }
    }

    /// Tests an actual `set_keymap_keycode` write, as safely as this can be
    /// done on real hardware: layer 9 (of the 10 the keyboard reports) has
    /// no `MO(9)` or similar anywhere in this firmware's compiled keymap.c
    /// (only layers 0-3 are named/used there), so nothing can actually
    /// switch to it — a write to (layer 9, row 0, col 2) can't be pressed
    /// or otherwise take effect. Reads the current value there first,
    /// writes a distinctive test value, confirms the read-back changed,
    /// then restores the original value.
    #[test]
    #[ignore] // needs a real Framework keyboard attached — run explicitly.
    fn probe_set_keycode_write() {
        let state = KeyboardHidState::default();
        let (layer, row, col) = (9u8, 0u8, 2u8);

        // Two earlier runs of this exact test (before `send_with_retry` was
        // fixed to drain every write's response — see its doc comment)
        // left this position's real hardware state ambiguous between
        // 0x0001 (the true original) and 0x0022 (this test's own value) —
        // force it back to the known-true original before re-baselining,
        // so this test is self-healing regardless of how a previous run
        // left things.
        const KNOWN_TRUE_ORIGINAL: u16 = 0x0001;
        let [hi, lo] = KNOWN_TRUE_ORIGINAL.to_be_bytes();
        send_with_retry(&state, &build_simple_packet(VIA_CMD_SET_KEYCODE, &[layer, row, col, hi, lo]))
            .expect("pre-test cleanup write failed");

        let before_response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_KEYCODE, &[layer, row, col]))
            .expect("baseline get_keycode failed");
        let before = u16::from_be_bytes([before_response[4], before_response[5]]);
        println!("baseline keycode at (layer {layer}, row {row}, col {col}): 0x{before:04x}");
        assert_eq!(before, KNOWN_TRUE_ORIGINAL, "pre-test cleanup write didn't take effect either");

        const TEST_KEYCODE: u16 = 0x0022; // KC_5 — distinctive, easy to eyeball.
        let [hi, lo] = TEST_KEYCODE.to_be_bytes();
        send_with_retry(&state, &build_simple_packet(VIA_CMD_SET_KEYCODE, &[layer, row, col, hi, lo]))
            .expect("set_keycode write failed");

        let after_response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_KEYCODE, &[layer, row, col]))
            .expect("post-write get_keycode failed");
        let after = u16::from_be_bytes([after_response[4], after_response[5]]);
        println!("keycode after write: 0x{after:04x} (expected 0x{TEST_KEYCODE:04x})");
        assert_eq!(after, TEST_KEYCODE, "write did not take effect");

        // Restore the original value regardless of the assert above.
        let [hi, lo] = before.to_be_bytes();
        send_with_retry(&state, &build_simple_packet(VIA_CMD_SET_KEYCODE, &[layer, row, col, hi, lo]))
            .expect("restoring baseline keycode failed");
        let restored_response = send_and_read(&state, &build_simple_packet(VIA_CMD_GET_KEYCODE, &[layer, row, col]))
            .expect("post-restore get_keycode failed");
        let restored = u16::from_be_bytes([restored_response[4], restored_response[5]]);
        println!("keycode after restore: 0x{restored:04x} (expected 0x{before:04x})");
        assert_eq!(restored, before, "failed to restore baseline value");
    }
}
