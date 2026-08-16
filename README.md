# MainFrameWork

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](#)

A unified desktop control panel for Framework hardware: keyboard remapping
and RGB lighting, LED Matrix drawing/animation, and system health (fans,
battery, expansion cards) in one lightweight Tauri app, instead of several
separate utilities.

Matrix drawing/animation and keyboard RGB lighting work today, verified
against real hardware. Keymap remapping and system health are UI-complete
but not yet wired up — see [Features](#features) below for the full
breakdown.

## Runs entirely on your machine

Zero outbound network calls. No cloud sync, no telemetry, no accounts. The
only exception is a manual "visit our website" link in the sidebar, which
opens your system browser. See [SECURITY.md](SECURITY.md) for what
"encrypted at rest" actually means here.

## Features

Working today, verified against real hardware:

- **Matrix Studio** — Live drawing canvas and a frame-by-frame animator that
  write directly to the LED Matrix expansion card over serial, plus
  brightness and sleep control.
- **Keyboard RGB Lighting** — Color, effect, effect speed, and brightness
  control over VIA's raw HID protocol, with EEPROM save so it persists
  without MainFrameWork running.
- **Expansion Inspector** — Live USB-based detection of expansion cards that
  expose their own identity (HDMI/DisplayPort, Audio); passive cards
  (USB-A/C, SD, Ethernet) can't be detected this way and aren't shown.
- **Dashboard** — Live hardware scan, plus host system info (CPU, GPU,
  memory, OS).

Built as UI, not yet wired to hardware:

- **Keymap remapping & Macros** (Input Studio) — editor and macro list
  exist, not yet connected to the real keycode matrix or macro protocol.
- **Numpad / Macropad detection** — PIDs aren't confirmed yet, so these show
  as "Unknown" rather than by name.
- **Widget library** (Matrix Studio) — layout composer for clock/battery/CPU
  widgets; doesn't push a live render to the matrix yet.
- **System Health** (Thermal, Battery, Sensors) — fan curves, charge
  limiting, and sensor readouts are UI-complete but not wired to the EC yet;
  sensor values shown today are simulated.

See [Docs/releasePlan.md](Docs/releasePlan.md) for feature-by-feature build
status, [Docs/CONCEPT.md](Docs/CONCEPT.md) for the product vision, and
[Docs/ARCHITECT.md](Docs/ARCHITECT.md) for the technical architecture.

## Hardware support

MainFrameWork isn't tied to one Framework model — or even to a Framework
system at all:

- **Keyboard RGB, LED Matrix, and expansion card detection** talk directly
  to the USB module (VID `0x32AC`), not the machine it's plugged into. Any
  PC these modules are connected to can use them — a Framework module
  plugged into a non-Framework PC works the same way.
- **Fan curves and battery limits** go through a genuine Framework
  mainboard's embedded controller, so those need an actual Framework
  system (laptop or desktop).
- **Dashboard system info** (CPU/GPU/memory/OS) is generic host info and
  works on any PC, Framework or not.

The LED Matrix and RGB keyboard modules themselves currently only ship with
Framework Laptop 16, so you need to own those specific modules to use those
specific features — the app doesn't check or care what brand of PC you're
running it on.

Tested on Windows against real Framework Laptop 16 hardware. Linux support
(including the udev rules below) is implemented but hasn't been run against
real Linux hardware yet — bug reports welcome.

## System Tray

MainFrameWork runs in the system tray. Closing the main window hides it to
the tray instead of quitting — the app keeps running in the background (so
keyboard RGB / LED Matrix state stays live) until you quit from the tray
menu. Left-click the tray icon, or use its "Show MainFrameWork" item, to
bring the window back; use "Quit" to exit.

## Getting started

```bash
cd MainFrame
npm install
npm run tauri dev
```

Since closing the window hides it to the tray, closing the dev window won't
stop the dev server — use Ctrl+C in the terminal (or the tray's "Quit").

See [MainFrame/README.md](MainFrame/README.md) for IDE setup and more on the
dev workflow.

### Linux: device permissions

Talking to the keyboard/matrix over raw USB HID and serial needs device
permissions most distros don't grant by default. Install the provided udev
rule first:

```bash
sudo cp MainFrame/udev/60-mainframework.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Then unplug and replug the affected device (or reboot).

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
