# DATA STRATEGY: Local Persistence

### Philosophy

**"Local & Portable."** User data is stored in a single binary file on disk,
never transmitted anywhere. It's portable (can be copied between machines)
and lightly obfuscated (AES-256-GCM) so it isn't trivially hand-edited or
corrupted outside the app — but the encryption key is a public constant in
the source, so this is not a confidentiality guarantee. That's fine today
because nothing stored here (theme, profiles, keymaps) is sensitive. See
[SECURITY.md](../SECURITY.md) for the full explanation and what would need
to change before storing anything that actually needs to stay secret.

### Storage Locations

#### 1. User Data (Read/Write)

- **Path:**
  - _Windows:_ `%APPDATA%\MainFrameWork\user_data.bin`
  - _Linux:_ `~/.config/MainFrameWork/user_data.bin`
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
