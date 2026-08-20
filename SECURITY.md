# Security Policy

## Threat model, honestly

MainFrameWork is a **local-only desktop app**. It talks to Framework USB
peripherals (keyboard, LED Matrix, expansion cards) wherever they're
plugged in — not necessarily a Framework-branded PC — and, where available,
to a genuine Framework mainboard's embedded controller. It does not talk to
the internet. The only outbound network request anywhere
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
  is a stub that returns an error — it does not install or touch any
  system driver, and there is deliberately no UI path to trigger it in
  [`DriverGate.tsx`](MainFrame/src/pages/system/DriverGate.tsx). This isn't
  a "not built yet" gap so much as a "won't do this automatically" one: see
  below.
- Real fan/battery/sensor data on Linux
  ([`ec_control.rs`](MainFrame/src-tauri/src/ec_control.rs)) is implemented
  and type-checks cleanly, but hasn't been run against real Linux hardware
  — this project's dev/test machine is Windows-only. Treat it as "written
  carefully, not yet confirmed" until someone runs it on an actual Linux
  Framework system.

### Why Windows fan/battery/sensor access stays unimplemented

Real EC access on Windows (fan curves, charge limits, live thermal data)
needs a kernel driver at `\\.\GLOBALROOT\Device\CrosEC`. The only one that
exists is the community
[FrameworkWindowsUtils](https://github.com/DHowett/FrameworkWindowsUtils)
CrosEC driver — MIT/BSD-style licensed, so redistribution itself isn't the
problem. What is: its own release notes require enabling Windows
test-signing mode and disabling Secure Boot to load it, since no WHQL- or
EV-signed build exists. Disabling Secure Boot in turn makes Windows demand
the user's BitLocker recovery key on next boot. (Checked directly against
Framework's own public driver work as of this writing, which covers a
separate Desktop ARGB driver, not this one.)

That's a real reduction in a user's boot security posture, not a routine
driver install — MainFrameWork won't automate it or prompt for it on your
behalf. If you understand the trade-off and want it anyway, `DriverGate.tsx`
links to the driver project directly rather than the app doing it for you.
This will be revisited if/when a properly signed build exists.

## Reporting a vulnerability

If you find a real security issue (not the known trade-offs documented
above), please open a
[private security advisory](https://github.com/AllStoneTech/Framework/security/advisories/new)
on GitHub rather than a public issue, so we have a chance to address it
before details are public. We'll do our best to respond within a few days.
