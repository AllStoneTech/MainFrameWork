# Release Plan: MainFrameWork

## Release 1: The Rust Foundation (MVP)

**Goal:** A "Hello World" Tauri app that can detect the Matrix and draw on it.
**Delivery:** Single Executable (`MainFrameWork.exe`, ~8MB).

- [x] **[Setup] Scaffold Tauri Project**
  - Initialize Tauri v2 (Rust) + React (TypeScript) + Vite.
  - Configure `tauri.conf.json` for "Single Instance" and "Hardware
    Permissions".
- [x] **[Core] Rust Persistence**
  - Implemented as `AppState` + `save_settings()`/`load_settings()` in
    `persistence.rs` (named differently than originally planned, same
    result).
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
- [x] **[Core] EC Access** — via `framework_lib::chromium_ec`, not a
  custom ioctl/extern-C implementation as originally planned here.
  - **Linux:** Implemented in `ec_control.rs` (battery, charge limit,
    temps, fan RPM/duty/auto) — written and type-checked, but not yet run
    against real Linux hardware (this project's dev/test machine is
    Windows-only). Needs that verification pass before calling it done.
  - **Windows:** Deliberately not implemented — the only available EC
    driver requires disabling Secure Boot, which this app won't automate.
    See [SECURITY.md](../SECURITY.md#why-windows-fanbatterysensor-access-stays-unimplemented).
- [ ] **[UI] Dashboard Widgets**
  - Bind "Refresh" button to `scanner.refresh()`.
  - Build Fan Curve Graph (SVG).

## Release 3: Input Commander (VIA)

**Goal:** Full Keyboard/Macropad configuration via Raw HID.

- [x] **[Core] VIA/HID Service**
  - **Rust:** Implement `hidapi` to send/receive Raw HID packets.
  - **Logic:** Port QMK/VIA protocol definitions to Rust structs.
  - **Status:** RGB Lighting Control Implemented (MVP). Dynamic-keymap
    (keymap + macro) commands added and confirmed against real Framework
    Laptop 16 hardware — see `keyboard_mapper.rs`'s module doc comment
    and its `hardware_probe` tests for what was actually verified.
- [x] **[UI] Keymap Editor**
  - Build Layer visualizer. — Done: `KeymapTab.tsx`, real ANSI matrix
    (`frameworkAnsiMatrix.ts`), Basic/Media/Layer/Macro assignment.
  - Build Macro recorder. — Done as a step editor rather than OS-level
    recording (matching how VIA itself works): `MacrosTab.tsx` +
    `macroEncoding.ts`. Both tested end-to-end on real hardware
    (2026-09-01): keymap remap and macro assignment confirmed working.
  - Numpad/Macropad devices and ISO/JIS layouts are out of scope — Main
    Keyboard/ANSI only for this pass.

## Release 4: System Tray, Live Widgets & Reliability

**Goal:** Close out the background/lifecycle story and turn Matrix Studio's
Widgets from a UI stub into something that actually renders, then fix what
broke along the way.

- [x] **[Core] System Tray**
  - Background persistence, single-instance handling, tray Show/Quit menu —
    already working; this pass fixed a duplicate-tray-icon bug and finished
    the loose end: Stealth Mode now actually hides the tray icon
    (`set_tray_visible`) instead of being visual-only.
  - **LED Matrix sleep/resume recovery** (`power_watch.rs`): detects the
    host waking from sleep (wall-clock-vs-monotonic-clock drift — no OS
    hooks needed) and re-pushes whatever was last shown, since the LED
    Matrix module loses its own state across a host suspend.
  - **Start on Boot** toggle (`tauri-plugin-autostart`), reading/writing the
    OS's real startup registration directly.
- [x] **[Feature] Matrix Studio Widgets**
  - Live Clock (24h/12h, digital or analog face), Battery, and CPU Load
    widgets, stacked into the panel and pushed on a "Start Live Render"
    toggle. Battery is gated on `check_ec_status` (same check System
    Health uses); Audio EQ is listed but disabled — no live audio capture
    backend exists, and this app won't fake one.
  - Only one of each widget type can be placed at once.
- [x] **[Feature] Matrix Studio Editor: drag-reorder + live widget frames**
  - Frame thumbnails are draggable to reorder; "Add Frame" inserts after
    the selected frame instead of always appending.
  - A frame can be a **live widget frame** (Clock/Battery/CPU Load) that
    re-renders from current system data every time Play cycles to it,
    reusing the Widgets tab's own renderers (`matrixFrames.ts`).
- [x] **[Reliability] Fixes found building the above, on real hardware**
  - Tauri intercepts HTML5 drag-and-drop by default on Windows
    (`dragDropEnabled` now `false`) — otherwise frame reordering shows a
    permanent "not allowed" cursor.
  - `matrix_control.rs` opened a fresh, uncached serial connection per
    command with no coordination between commands — two commands landing
    at once (e.g. Widgets' render loop still mid-tick exactly when the
    Editor tab mounts) could both try to open the same COM port and hang
    the whole app ("Not Responding"). Fixed with a shared
    `MatrixSerialState` mutex held for the whole port-open-to-close span.
  - A schedule/saved-arrangement entry saved *before* widget frames
    existed (plain pixel arrays, no `kind` field) crashed the Editor tab
    on load — `normalizeFrame` wasn't applied to data coming back from
    `SavedArrangements`/`Schedule`, only the initial settings load. Fixed,
    plus a defensive fallback in `renderWidgetSlice` so an unrecognized
    frame renders blank instead of crashing.
  - Added a React error boundary around the routed page content
    (`ErrorBoundary.tsx`) plus a plain-text `frontend_errors.log`
    (`error_log.rs`) — a page-level crash now shows a recoverable error
    screen with the Sidebar still usable, instead of blanking the whole
    window with nothing left behind to debug from.
