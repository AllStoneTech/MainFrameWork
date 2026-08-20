# CONCEPT: MainFrameWork

### The Vision

**"One App to Rule Them All."** Framework's modular hardware is a
masterpiece of design, but its software ecosystem is fragmented.
**MainFrameWork** unifies these tools into a single, ultra-lightweight,
local-only desktop application. It transforms Framework hardware from a
"DIY Tinkerer's Laptop" into a "Polished Flagship Machine."

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
  Fans and Battery requires a kernel-level driver. The only one that exists
  is a community project, unsigned for normal use — loading it means
  disabling Secure Boot, a real reduction in a user's boot security posture,
  not a routine install. See
  [SECURITY.md](../SECURITY.md#why-windows-fanbatterysensor-access-stays-unimplemented)
  for the full reasoning.
- **Strategy: "Graceful Degradation"**
  - **Tier 1 (Portable):** The app runs immediately without installation.
    Controls Input (Keyboard, Remapping) and Matrix (Drawing), which use
    standard HID.
  - **Tier 2 (Full EC Access):** Fan/Battery/Sensor tabs explain why they're
    unavailable on Windows instead of offering to install anything —
    MainFrameWork won't automate that Secure Boot trade-off on a user's
    behalf. Linux doesn't have this problem (`/dev/cros_ec` works out of the
    box); it's simply not implemented yet there.

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
