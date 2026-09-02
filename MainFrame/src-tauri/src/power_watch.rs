// SPDX-License-Identifier: GPL-3.0-or-later

//! Detects the host resuming from sleep/hibernate and notifies the
//! frontend (via [`RESUME_EVENT`]) so it can re-push whatever should
//! currently be showing on the LED Matrix. The module is a separate USB
//! device that loses power during suspend and has no memory of what
//! MainFrameWork last drew, so without this the panel comes back either
//! blank or on its own firmware boot pattern instead of the user's last
//! frame/pattern.
//!
//! Tauri has no built-in cross-platform "system resumed" event, and the
//! real OS hooks (`WM_POWERBROADCAST` on Windows, logind's
//! `PrepareForSleep` D-Bus signal on Linux) would mean two separate
//! platform-specific implementations plus a new dependency for the Linux
//! D-Bus side. Instead this polls a monotonic clock against the wall
//! clock on a fixed interval: [`Instant`] stops advancing while the
//! process is suspended (`QueryPerformanceCounter` on Windows,
//! `CLOCK_MONOTONIC` on Linux), while [`SystemTime`] keeps ticking off
//! the RTC. A wall-clock jump much larger than the poll interval can
//! only be explained by the process — and so the machine — having been
//! asleep in between. Cheap, no new dependencies, and the same technique
//! several other cross-platform desktop apps use for this exact problem.
//!
//! **Caveat:** this is a heuristic, not an OS-confirmed signal, and (like
//! the EC/hardware code elsewhere in this project) hasn't been validated
//! against an actual suspend/resume cycle on real hardware — only
//! reasoned through from how `Instant`/`SystemTime` are documented to
//! behave. A false positive (e.g. the poll thread getting starved under
//! heavy load) just triggers a harmless extra re-draw; a false negative
//! (missed resume) leaves today's bug exactly as it is now. Revisit if
//! either turns out to happen in practice.

use std::thread;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_secs(3);
/// How much extra wall-clock drift beyond `POLL_INTERVAL` counts as a
/// sleep/resume rather than ordinary scheduling jitter.
const RESUME_THRESHOLD: Duration = Duration::from_secs(5);

/// Frontend event name (`listen(RESUME_EVENT, ...)`) fired when a resume
/// is detected. No payload — listeners just re-sync whatever they own.
/// Mirrored as a string literal in `src/lib/systemEvents.ts`; keep the
/// two in sync if this ever changes.
pub const RESUME_EVENT: &str = "system-resumed";

/// Spawns the background watcher thread. Called once from `run()`'s
/// `.setup()` hook; runs for the lifetime of the process.
pub fn watch_for_resume(app: AppHandle) {
    thread::spawn(move || {
        let mut last_instant = Instant::now();
        let mut last_wall = SystemTime::now();

        loop {
            thread::sleep(POLL_INTERVAL);

            let now_instant = Instant::now();
            let now_wall = SystemTime::now();

            let monotonic_elapsed = now_instant.duration_since(last_instant);
            // SystemTime can go backwards (clock adjustment/NTP); treat
            // that as "no drift" rather than erroring, since it can't be
            // a sleep/resume gap.
            let wall_elapsed = now_wall.duration_since(last_wall).unwrap_or(monotonic_elapsed);

            if wall_elapsed > monotonic_elapsed + RESUME_THRESHOLD {
                println!(
                    "power_watch: detected system resume (wall clock {:?} ahead of monotonic {:?})",
                    wall_elapsed, monotonic_elapsed
                );
                let _ = app.emit(RESUME_EVENT, ());
            }

            last_instant = now_instant;
            last_wall = now_wall;
        }
    });
}
