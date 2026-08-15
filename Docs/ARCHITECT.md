# ARCHITECT: Technical Blueprint (MainFrameWork)

### Technology Stack

- **Application Framework:** [Tauri v2](https://tauri.app) (Rust Backend + Web
  Frontend).
- **Language (Core):** Rust (High performance, compiled, memory safe).
- **Language (UI):** TypeScript + React + TailwindCSS.
- **Persistence:** Encrypted JSON (handled by Rust `aes-gcm` + `std::fs`).
- **Size Profile:** Extremely Lightweight (~5MB - 10MB).

---

---

### Codebase Strategy ("Open Core")

**Planned, not yet implemented** — there is currently no `src/pro`
directory, submodule, or `pro` Cargo feature in this codebase. Documented
here as the intended direction, not current architecture.

- **Repo Structure:** Monorepo with a Private Submodule (`src/pro`).
- **Compilation:** Rust Feature Flags (`#[cfg(feature = "pro")]`).
  - `cargo build` = **Community Edition** (Fully Functional, Open Source).
  - `cargo build --features pro` = **Pro Edition** (Includes proprietary
    sub-crate).
- **Protection:** Pro logic is physically absent from the public repo,
  preventing unauthorized compilation of paid features.

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

**C. System Service (EC/Platform)**

- **Linux:** Direct file ops on `/sys/class/power_supply` and `/dev/cros_ec`.
- **Windows (Hybrid Strategy):**
  1. **Probe:** Attempt to open handle to `\\.\CrosEC`.
  2. **Fallback:** If failed, return `FeatureNotAvailable`. UI grays out
     "Thermal" and "Battery" tabs.
  3. **Install:** Provide embedded installer for `CrosEC.sys` (requires Admin).
  4. **Success:** Load driver and proxy EC instruction via IOCTLs.

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
