# CONCEPT: MainFrameWork

### The Vision

**"One App to Rule Them All."** The Framework Laptop 16 is a masterpiece of
modular hardware, but its software ecosystem is fragmented. **MainFrameWork**
unifies these tools into a single, ultra-lightweight, local-only desktop
application. It transforms the Framework 16 from a "DIY Tinkerer's Laptop" into
a "Polished Flagship Machine."

---

### Core Value Proposition

1. **Unified Control:** Change your keymap, draw on your matrix, and set your
   battery limit in one window.
2. **Lightweight & Portable:** Built with **Tauri (Rust)**. A single small
   executable (`.exe`/`.AppImage`) (~10MB) that requires no installation.
3. **Local-Only, Zero Telemetry:** MainFrameWork never talks to the internet.
   No cloud sync, no analytics, no accounts. The only outbound request in the
   entire app is a manual "visit our website" link — everything else runs
   fully offline against your own hardware. Settings are stored on disk with
   a light AES layer to keep the file from being hand-edited/corrupted, not
   as a security claim — see [SECURITY.md](../SECURITY.md) for the honest
   version of that story.
4. **Cross-Platform:** A single code base that runs natively on Windows and
   Linux.

---

### Strategic Challenges & Viability

**1. The "Driver Wall" (Windows EC Access)**

- **Challenge:** accessing the Embedded Controller (EC) on Windows to control
  Fans and Battery requires a kernel-level driver (`CrosEC.sys`) or disabling
  Secure Boot. It cannot be done from a purely portable user-mode application.
- **Strategy: "Graceful Degradation"**
  - **Tier 1 (Portable):** The app runs immediately without installation.
    Controls Input (Keyboard, Remapping) and Matrix (Drawing), which use
    standard HID.
  - **Tier 2 (Pro):** If the user wants Fan/Battery control, the app checks for
    the driver. If missing, these tabs are disabled with a "Enable Pro Features"
    button that installs the signed driver.

---

### Feature Pillars

#### 1. Input Commander (The "VIA" Layer)

- **Main Keyboard:** Embedded VIA/QMK Configurator. Remap keys, set macros,
  control per-key RGB.
- **Side Modules:** Full support for Numpad and RGB Macropad as independent
  devices.
- **Dot Matrix:**
  - **Drawing Mode:** Live canvas to draw pixels.
  - **Widget Store:** Drag-and-drop modules (Clock, Battery, CPU, EQ).
  - **Animator:** Frame-by-frame animation editor.

#### 2. System Intelligence (The "EC" Layer)

- **Thermal Control:** Visual fan curve editor (Silent/Performance/Custom).
- **Battery Guardian:** "Stop charging at 80%" toggle. Discharge calibration.
- **Expansion Inspector:** Visual dashboard of connected modules.

---

### Target User

The **"Framework Pro"**: Developers, Power Users, and Cyber-deck builders who
want total control over their hardware in a lightweight, professional
package that runs entirely on their own machine.
