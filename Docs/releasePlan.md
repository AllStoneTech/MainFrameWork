# Release Plan: MainFrameWork

## Release 1: The Rust Foundation (MVP)

**Goal:** A "Hello World" Tauri app that can detect the Matrix and draw on it.
**Delivery:** Single Executable (`MainFrameWork.exe`, ~8MB).

- [x] **[Setup] Scaffold Tauri Project**
  - Initialize Tauri v2 (Rust) + React (TypeScript) + Vite.
  - Configure `tauri.conf.json` for "Single Instance" and "Hardware
    Permissions".
- [ ] **[Core] Rust Persistence**
  - Implement `PersistenceState` struct in Rust.
  - Add `aes-gcm` crate. Implement `save_encrypted()` and `load_encrypted()`
    functions.
- [x] **[Feature] Matrix Canvas**
  - **Rust:** Implement `serialport` communication with RP2040.
  - **React:** Build 34x9 Grid UI.
  - **Bridge:** Create Tauri Command `draw_matrix(bytes)` to flush buffer.

## Release 2: System Intelligence & Hardware Scan

**Goal:** Dynamic "God Mode" Dashboard (Fans, Battery, Hot-swap).

- [x] **[Core] Device Manager**
  - **Rust:** Build `DeviceScanner` struct using `rusb` crate.
  - **Poll Loop:** Check for VID `0x32AC` (Framework) every 2s or on USB Event.
  - **React:** Update Dashboard tabs based on `Scanner` state.
- [ ] **[Core] EC Access**
  - **Linux:** Implement `File` reader for `/dev/cros_ec` (ioctl).
  - **Windows:** Integrate `win_ring0` crate or unsafe extern "C" bindings.
- [ ] **[UI] Dashboard Widgets**
  - Bind "Refresh" button to `scanner.refresh()`.
  - Build Fan Curve Graph (SVG).

## Release 3: Input Commander (VIA)

**Goal:** Full Keyboard/Macropad configuration via Raw HID.

- [x] **[Core] VIA/HID Service**
  - **Rust:** Implement `hidapi` to send/receive Raw HID packets.
  - **Logic:** Port QMK/VIA protocol definitions to Rust structs.
  - **Status:** RGB Lighting Control Implemented (MVP).
- [ ] **[UI] Keymap Editor**
  - Build Layer visualizer.
  - Build Macro recorder.
