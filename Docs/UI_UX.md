# UI/UX: Design System & Flow

### Aesthetic: "Cybernetic Minimalism"

- **Theme:** Dark Mode default. Deep grays (`#1a1a1a`), vibrant accents (Cyber
  Yellow or Framework Orange).
- **Materials:** Glassmorphism (blur) for overlays.
- **Type:** Inter or JetBrains Mono for technical data.

---

### App Structure

#### 1. The Dashboard (Home)

- **Hardware Scanner:**
  - **Auto-Detect:** On launch, the app scans USB/EC to see what is plugged in.
  - **Hot-Swap:** Listens for changes (Module plugged in/out).
  - **Manual Trigger:** A prominent "REFRESH HARDWARE" button to force a
    re-scan.
- **Dynamic Modules:** The UI _only_ shows panels for connected devices.
  - _Example:_ IF `Numpad` is detected -> Show "Numpad" panel. ELSE -> Hide it.
- **Hero Section:** A 3D/SVG render that updates to match the real
  configuration.

#### 2. Input Studio (Keyboard & Modules)

- **The Framework Deck:** A visual map of connected modules.
- **Visualizer:** Full render of the active module.
- **Key Remapper:** Click key -> Open Remap Modal.

#### 3. Matrix Studio

- **The Canvas:** 34x9 grid drawing tool.
- **Widget Library:** Drag-and-drop items (Clock, CPU).
- **Live Preview:** Drawings update on the physical hardware instantly.

#### 4. System & Health

- **Thermal Graph:** Interactive fan curve editor.
- **Battery Health:** Charge limit toggle and stats.
- **Security:** Privacy Switch status indicators (Camera/Mic).

---

### Key Interactions

- **Optimistic UI:** Toggle a switch -> UI updates instantly -> Rust Backend
  confirms.
- **Error Handling:** If a device is unplugged while editing, the UI locks that
  panel and shows "Device Disconnected".
