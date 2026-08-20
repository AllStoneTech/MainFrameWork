// SPDX-License-Identifier: GPL-3.0-or-later

//! Placeholder for a CrosEC kernel driver installer on Windows — and, as of
//! this writing, deliberately staying a placeholder rather than becoming a
//! real one.
//!
//! Real EC access on Windows (fan curves, charge limits, live sensor data)
//! needs a kernel driver at `\\.\GLOBALROOT\Device\CrosEC`. The only one
//! that exists is the community
//! [FrameworkWindowsUtils](https://github.com/DHowett/FrameworkWindowsUtils)
//! CrosEC driver (MIT/BSD-style licensed, so redistribution itself isn't
//! the blocker) — but its own v0.0.2 release notes say installing it
//! requires enabling Windows test-signing mode (`bcdedit /set {default}
//! testsigning on`), which in turn requires disabling Secure Boot, which in
//! turn makes Windows demand the user's BitLocker recovery key on next
//! boot. No WHQL- or EV-signed build exists (checked directly against
//! Framework's own public driver work, which as of this writing covers a
//! separate Desktop ARGB driver, not this one).
//!
//! That's not "install a driver," that's "lower your machine's boot
//! security posture," and MainFrameWork isn't going to automate or lightly
//! prompt for that on a user's behalf just to unlock fan/battery control.
//! This command stays a stub — kept registered (see `lib.rs`) as a stable
//! IPC surface for `DriverGate.tsx` — until an actually-signed driver
//! exists to install instead.

/// Always returns an error explaining why driver installation isn't
/// implemented. Intentionally does not simulate success — a prior version
/// of this command slept for a couple seconds and reported "Driver
/// Installed", which would have misled real users into thinking Fan/Battery
/// control was now available when nothing had actually changed on their
/// machine.
#[tauri::command]
pub async fn install_driver() -> Result<String, String> {
    Err("Not implemented: the only available CrosEC driver for Windows requires test-signing \
         mode and disabling Secure Boot, which this app won't do automatically. See SECURITY.md."
        .to_string())
}
