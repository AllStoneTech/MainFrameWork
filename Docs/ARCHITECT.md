# ARCHITECT: Technical Blueprint (MainFrame)

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
- **Hardware Awareness:** Dynamic. It subscribes to a `hardware_update` event.
  If the Rust backend says "Numpad Connected", the UI renders the Numpad tab.

#### Layer 2: The Tauri Bridge (IPC)

- **Mechanism:** Tauri Commands (`#[tauri::command]`).
- **Safety:** Strongly typed interfaces between TS and Rust.
- **Encryption boundary:** Data sent to UI is decrypted. Data on disk is
  encrypted.

#### Layer 3: The Rust Core (Hardware Abstraction)

This is the "Black Box" logic. Being compiled machine code, it is difficult to
reverse engineer.

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
- **Linux:** Direct file ops on `/sys/class/power_supply` and `/dev/cros_ec`.
- **Windows (Hybrid Strategy):**
  1. **Probe:** Attempt to open handle to `\\.\CrosEC`.
  2. **Fallback:** If failed, return `FeatureNotAvailable`. UI grays out
     "Thermal" and "Battery" tabs.
  3. **Install:** Provide embedded installer for `CrosEC.sys` (requires Admin).
  4. **Success:** Load driver and proxy EC instruction via IOCTLs.

---

### Security & Obfuscation Strategy

1. **Compiled Core:** The business logic (how we talk to the EC, how we map
   keys) is compiled to native Assembly. It is not readable like JavaScript.
2. **Data At Rest:** The `user_data.bin` file is encrypted with AES-256-GCM. The
   key is hardcoded (obfuscated) in the Rust binary or derived from machine ID.
3. **App Isolation:** Tauri locks down the WebView. No external URLs allowed.
   CSP (Content Security Policy) set to strict.
