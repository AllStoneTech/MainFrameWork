# DATA STRATEGY: Encrypted Persistence

### Philosophy

**"Secure & Portable."** User data is stored in a single, encrypted binary file.
It is portable (can be copied) but secure (cannot be read without the app).

### Storage Locations

#### 1. User Data (Read/Write)

- **Path:**
  - _Windows:_ `%APPDATA%\MainFrame\user_data.bin`
  - _Linux:_ `~/.config/MainFrame/user_data.bin`
- **Format:** AES-256-GCM Encrypted JSON.
- **Owner:** The Rust Backend is the _only_ process that can read/write this
  file. The Frontend receives decrypted objects in memory.

---

### internal Schema (Decrypted)

#### A. Global Config

```json
{
  "theme": "dark",
  "master_fan_mode": "silent",
  "stealth_mode": false
}
```

#### B. Profiles

```json
[
  {
    "id": "p_gaming",
    "name": "Gaming",
    "trigger_app": "steam.exe",
    "keymaps": {
      "macropad_id": { "layers": [...] }
    },
    "fan_curve": "curve_aggressive"
  }
]
```

#### C. Hardware State (Ephemeral)

- This data is NOT stored on disk, but reconstructed on every scan.
  - `connected_devices`: List of VIDs/PIDs.
  - `ec_values`: Current Temp, Battery %.
