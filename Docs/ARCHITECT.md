# ARCHITECT: Technical Blueprint (MainFrameWork)

### Technology Stack

- **Application Framework:** [Tauri v2](https://tauri.app) (Rust Backend + Web
  Frontend).
- **Language (Core):** Rust (High performance, compiled, memory safe).
- **Language (UI):** TypeScript + React + TailwindCSS.
- **Persistence:** Encrypted JSON (handled by Rust `aes-gcm` + `std::fs`).
- **Size Profile:** Extremely Lightweight (~5MB - 10MB).

---

### System Boundaries

#### Layer 1: The UI (WebView)

- **Responsibility:** Pure visualization.
- **Constraint:** Zero logic. It just displays the `State` provided by Rust.
- **Hardware Awareness:** Dynamic — currently via on-demand polling
  (`invoke("scan_devices")` on mount, and manual "Refresh" buttons). A
  push-based `hardware_update` event from the Rust backend is the intended
  direction but isn't implemented yet.

#### Layer 2: The Tauri Bridge (IPC)

- **Mechanism:** Tauri Commands (`#[tauri::command]`).
- **Safety:** Strongly typed interfaces between TS and Rust.
- **Encryption boundary:** Data sent to UI is decrypted. Data on disk is
  encrypted.

#### Layer 3: The Rust Core (Hardware Abstraction)

All hardware access — USB, HID, serial, and (where available) the EC —
happens here, kept separate from the UI layer above. (Note: this used to be
described as "hard to reverse engineer" — that doesn't hold up for public
GPLv3 source; see Security Posture below for the honest version.)

**A. Device Manager (The "Scanner")**

- **Lifecycle:** Runs on App Launch and on "Refresh" command.
- **Logic:** Scans USB Bus for Framework VID (`0x32AC`).
- **Hot-Swap:** Uses `rusb` hotplug listener (on supported OS) or polling to
  detect removals/insertions.
- **Result:** Maintains a `Vec<ConnectedDevice>` state.

**B. Input Service (HID/Serial)**

- **Libraries:** `hidapi-rs` (Keyboard/Via), `serialport` (Matrix).
- **Behavior:** Direct binary communication with QMK devices and RP2040.
- **VIA dynamic-keymap (keymap + macros):** `keyboard_mapper.rs` — real
  key reassignment and a macro-buffer editor over VIA's raw-HID
  dynamic-keymap commands, confirmed against real Framework Laptop 16
  hardware (see that file's module doc comment and its `hardware_probe`
  tests). ANSI layout only; the physical key→matrix-position table
  (`frameworkAnsiMatrix.ts`) was reconstructed from Framework's own
  firmware source, since this app has no VIA-style per-keyboard layout
  definition to read it from.
- **Matrix serial access is mutex-guarded** (`MatrixSerialState` in
  `matrix_control.rs`): `port_for_panel` opens a fresh, uncached
  connection per command with no persistent handle, so two commands
  landing at once (different tabs, or a live-render loop racing a mount)
  could both try to open the same COM port — confirmed on real hardware
  that this hangs the whole app rather than failing fast. A single global
  lock held for the whole port-open-to-close span serializes all callers.

**C. System Service (EC/Platform)**

- **Linux:** Implemented in `ec_control.rs` via `framework_lib::chromium_ec`
  talking to `/dev/cros_ec` — present out of the box on Framework
  hardware's in-kernel driver, no separate install needed, unlike Windows
  below. Covers battery status, charge limit get/set, temperature sensors,
  and fan RPM/duty/auto — see that file's doc comment for exactly which
  parts of `framework_lib`'s public API are used versus reimplemented (temp
  sensor and fan RPM parsing, since framework_lib 0.6.5 only exposes those
  as a print-to-stdout helper, not structured data). Type-checks cleanly —
  the code isn't platform-gated, since `CrosEc` itself is cross-platform —
  but hasn't run against real Linux hardware yet; this project's dev/test
  machine is Windows-only.
- **Windows:**
  1. **Probe:** Attempt to open a handle to `\\.\GLOBALROOT\Device\CrosEC`
     (`ec_check.rs`). Almost always fails, for the reason below.
  2. **Fallback:** UI shows `DriverGate` in place of Thermal/Battery/Sensors
     content, explaining why rather than implying "coming soon."
  3. **No install step exists, deliberately.** The only driver that exposes
     that device path is the community
     [FrameworkWindowsUtils](https://github.com/DHowett/FrameworkWindowsUtils)
     CrosEC driver (MIT/BSD-licensed — redistribution itself isn't the
     issue). Its own release notes require enabling Windows test-signing
     mode and disabling Secure Boot to load it, since no WHQL- or EV-signed
     build exists (checked directly; Framework's own signed-driver work as
     of this writing covers a separate Desktop ARGB driver, not this one).
     Disabling Secure Boot also forces a BitLocker recovery-key prompt on
     next boot. `installer.rs`'s `install_driver` stays an intentional stub
     rather than automating or prompting for that trade-off — see its doc
     comment and [SECURITY.md](../SECURITY.md) for the full reasoning.

**D. Tray & Window Lifecycle (`tray.rs`, `power_watch.rs`)**

- **Behavior:** Builds a system tray icon with a Show/Quit menu on startup.
  Intercepts the main window's close event and hides it instead of exiting
  the process — only the tray's "Quit" item calls `app.exit(0)`. Stealth
  Mode (Settings) toggles the icon's real visibility via `set_tray_visible`,
  read from persisted settings on launch too.
- **Why:** Keyboard RGB and LED Matrix state should keep running in the
  background after the window is closed, not die with it.
- **Sleep/resume recovery:** `power_watch.rs` detects the host waking from
  sleep (comparing a monotonic clock, which stops advancing while
  suspended, against the wall clock, which doesn't — no OS-specific hooks
  needed) and emits a `system-resumed` event the frontend uses to
  re-push whatever should currently be on the LED Matrix, since the
  module itself loses all state across a host suspend.
- **Start on Boot:** `tauri-plugin-autostart`, reading/writing the OS's
  real startup registration directly rather than a value in the settings
  blob, so it can't drift out of sync with what the OS will actually do.
- **Status:** Verified against a real running window — see the root
  [README's System Tray section](../README.md#system-tray).

---

### Security Posture (Honest Version)

MainFrameWork's source is public (GPLv3), so any framing built on "compiled
code is hard to read" or "the key is hidden in the binary" doesn't hold up —
anyone can read the Rust source directly. The actual posture is simpler and,
we think, a better pitch anyway:

1. **No Network Surface:** The app makes zero outbound network calls except
   one manual "open our website" link (`Sidebar.tsx`, via the system
   browser). There's no server to compromise, no telemetry to leak, and
   nothing to intercept in transit, because nothing is ever in transit.
2. **Data At Rest:** `user_data.bin` is AES-256-GCM "encrypted," but the key
   (`CONSTANT_KEY` in `persistence.rs`) is a compile-time constant — public,
   same on every install. This layer exists to keep the file from being
   casually hand-edited or corrupted, not to provide confidentiality. It's
   appropriate today because the file holds no sensitive data (theme,
   keyboard color, a toggle). See [SECURITY.md](../SECURITY.md). If a future
   field needs real secrecy, the key needs to move to something per-machine
   (OS keyring or a machine-ID-derived key) before that data is stored.
3. **App Isolation:** Tauri's WebView has a Content-Security-Policy set in
   `tauri.conf.json` (`default-src 'self'; style-src 'self' 'unsafe-inline';
   img-src 'self' data: asset: https://asset.localhost; connect-src 'self'
   ipc: http://ipc.localhost`), scoped to what the frontend actually uses:
   locally-bundled assets, inline styles (used for dynamic pixel/sensor
   colors), and the Tauri IPC channel. No external origins are permitted.
