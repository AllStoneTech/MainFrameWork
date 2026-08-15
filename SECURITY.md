# Security Policy

## Threat model, honestly

MainFrameWork is a **local-only desktop app**. It talks to your Framework
Laptop 16's USB devices and (where available) its embedded controller — it
does not talk to the internet. The only outbound network request anywhere
in the codebase is a manual "visit our website" link
([`Sidebar.tsx`](MainFrame/src/components/Sidebar.tsx)) opened in your
system browser when you click it; nothing else ever leaves your machine.

### What "encrypted at rest" actually means here

Settings are written to `user_data.bin` using AES-256-GCM
([`persistence.rs`](MainFrame/src-tauri/src/persistence.rs)), but the
encryption key is a **compile-time constant** — the same on every install,
and visible to anyone who reads the source (which is everyone, since this
is public GPLv3 code). This is **not** a confidentiality guarantee. It
exists to keep the settings file from being casually hand-edited or
corrupted outside the app, nothing more.

That's an acceptable trade-off today because the file currently holds
nothing sensitive: UI theme, a keyboard color, a feature toggle. If a
future version stores something that genuinely needs to stay secret, the
key needs to move to something per-machine (an OS keyring, or a key derived
from a machine ID) before that data is written. Until then, treat
`user_data.bin` as **readable by anyone with access to your filesystem**,
encrypted or not.

### Content Security Policy

The Tauri WebView runs under a CSP scoped to what the frontend actually
needs — locally-bundled assets, inline styles (used for dynamic
pixel/sensor colors), and the Tauri IPC channel — with no external origins
permitted. See `security.csp` in
[`tauri.conf.json`](MainFrame/src-tauri/tauri.conf.json).

### Known unfinished features

- `install_driver` ([`installer.rs`](MainFrame/src-tauri/src/installer.rs))
  is currently a stub that returns "not implemented" — it does not install
  or touch any system driver. The corresponding UI button is disabled
  ("Coming Soon") in [`DriverGate.tsx`](MainFrame/src/pages/system/DriverGate.tsx).

## Reporting a vulnerability

If you find a real security issue (not the known trade-offs documented
above), please open a
[private security advisory](https://github.com/AllStoneTech/Framework/security/advisories/new)
on GitHub rather than a public issue, so we have a chance to address it
before details are public. We'll do our best to respond within a few days.
