# MainFrameWork

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](#)

A unified desktop control panel for the **Framework Laptop 16**, aiming to
bring keyboard remapping and RGB lighting, LED Matrix drawing/animation, and
system health (fans, battery, expansion cards) into one lightweight Tauri
app — instead of the several separate utilities Framework's own tooling
currently splits this across.

Matrix drawing/animation and keyboard RGB lighting are working today,
verified against real hardware. Keymap remapping and system health (fans,
battery, sensors) are UI-complete but not yet wired to the hardware — see
[Features](#features) below for the honest, feature-by-feature breakdown.

## Runs entirely on your machine

MainFrameWork makes **zero outbound network calls**. No cloud sync, no
telemetry, no accounts. The only exception is a manual "visit our website"
link in the sidebar, which opens your system browser — nothing else in the
app ever leaves your machine. See [SECURITY.md](SECURITY.md) for the full,
honest breakdown of what "encrypted at rest" does and doesn't mean here.

## Status

Early and actively developed. The [Features](#features) section below is
the authoritative "what actually works" list; [Docs/releasePlan.md](Docs/releasePlan.md)
tracks build status feature-by-feature, and
[SECURITY.md](SECURITY.md#known-unfinished-features) covers UI that's
visibly present but not yet functional (e.g. the CrosEC driver installer,
currently a "Coming Soon" placeholder).

## Features

Working today, verified against real Framework Laptop 16 hardware:

- **Matrix Studio** — Live drawing canvas and a frame-by-frame animator that
  write directly to the LED Matrix expansion card over serial, plus
  brightness and sleep control.
- **Keyboard RGB Lighting** — Color, effect, effect speed, and brightness
  control over VIA's Raw HID protocol, with EEPROM save so it persists
  without MainFrameWork running.
- **Expansion Inspector** — Live USB-based detection of expansion cards that
  expose their own identity (HDMI/DisplayPort, Audio); passive cards
  (USB-A/C, SD, Ethernet) can't be detected this way and aren't shown.
- **Dashboard** — Live hardware scan showing what's connected right now.

Built as UI, not yet wired to hardware — present in the app so the shape of
the feature is there, but functionality is incomplete:

- **Keymap remapping & Macros** (Input Studio) — visual editor and macro
  list exist; neither is connected to the real QMK keycode matrix or
  raw-HID macro protocol yet.
- **Numpad / Macropad detection** — their USB PIDs aren't confirmed yet, so
  they currently identify as "Unknown" rather than by name.
- **Widget library** (Matrix Studio) — local layout composer for
  clock/battery/CPU widgets; doesn't push a live render to the matrix yet.
- **System Health** (Thermal, Battery, Sensors) — fan curves, charge
  limiting, and sensor readouts are UI-complete but not wired to the EC; the
  app currently only detects whether the CrosEC driver is present (Windows
  requires it; Linux talks to `/dev/cros_ec` directly once EC read/write
  lands). Sensor values shown today are simulated, not real telemetry.

See [Docs/releasePlan.md](Docs/releasePlan.md) for the up-to-date
feature-by-feature build status, [Docs/CONCEPT.md](Docs/CONCEPT.md) for the
full product vision, and [Docs/ARCHITECT.md](Docs/ARCHITECT.md) for the
technical architecture.

## Hardware support

Built specifically for the **Framework Laptop 16** (USB VID `0x32AC`). Other
Framework models or third-party hardware are not supported.

> **Testing status:** MainFrameWork has so far only been tested on **Windows,
> against a real Framework Laptop 16**. Linux support (including the udev
> rules below) is implemented per the OS-specific paths in
> [Docs/ARCHITECT.md](Docs/ARCHITECT.md), but hasn't been verified against
> real Linux hardware yet. If you try it on Linux, bug reports (or
> confirmations that it works!) are welcome.

## System Tray

MainFrameWork runs in the system tray. Closing the main window **hides it to
the tray instead of quitting** — the app keeps running in the background (so
keyboard RGB / LED Matrix state stays live) until you quit it from the tray
icon's menu. Left-click the tray icon, or use its "Show MainFrameWork" menu
item, to bring the window back; use its "Quit" item to actually exit.

> **Verification status:** the tray icon and close-to-tray behavior compile
> and link cleanly (`cargo check` and a full `cargo build` both pass) but
> haven't been manually click-tested against a running window yet. If it
> doesn't behave as described here, please open an issue.

Note: Settings' "Stealth Mode" toggle describes hiding the tray icon, but
isn't actually wired to it yet — toggling it has no effect on the tray icon
today. That's a known gap, not a bug you need to report.

## Getting started

```bash
cd MainFrame
npm install
npm run tauri dev
```

**Heads up for `npm run tauri dev`:** since closing the window now hides it
to the tray instead of quitting, closing the dev window will **not** stop
the dev server/process — use Ctrl+C in the terminal (or the tray's "Quit"),
not the window's close button, to actually stop it.

See [MainFrame/README.md](MainFrame/README.md) for IDE setup and more detail
on the dev workflow.

### Linux: device permissions

Talking to the keyboard/matrix over raw USB HID and serial requires
permission to access those devices, which most distros don't grant to a
regular user by default. Install the provided udev rule before running the
app:

```bash
sudo cp MainFrame/udev/60-mainframework.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Then unplug and replug the affected device (or reboot). See
[MainFrame/udev/60-mainframework.rules](MainFrame/udev/60-mainframework.rules)
for what it does — and note its own disclaimer: it's a best-effort rule that
hasn't been verified against real Linux hardware yet, matching the testing
status above.

## Documentation

| Doc | Covers |
|---|---|
| [Docs/CONCEPT.md](Docs/CONCEPT.md) | Product vision, value proposition, target user |
| [Docs/ARCHITECT.md](Docs/ARCHITECT.md) | Tech stack, system boundaries, security posture |
| [Docs/DATA_SCHEMA.md](Docs/DATA_SCHEMA.md) | On-disk data format and schema |
| [Docs/UI_UX.md](Docs/UI_UX.md) | Design system and app flow |
| [Docs/releasePlan.md](Docs/releasePlan.md) | Feature-by-feature build status |
| [SECURITY.md](SECURITY.md) | Threat model and vulnerability reporting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for build
instructions and expectations before opening a PR.

## License

[GPLv3](LICENSE).
