# Contributing to MainFrameWork

Thanks for considering a contribution. This is a small, hardware-specific
project — please read this before opening a PR so your change has the best
chance of landing cleanly.

## Setup

```bash
cd MainFrame
npm install
npm run tauri dev
```

Requires a Rust toolchain (see `MainFrame/src-tauri/rust-toolchain.toml`)
and Node.js. Full dev workflow is in
[MainFrame/README.md](MainFrame/README.md).

Before opening a PR, make sure both build cleanly:

```bash
# from MainFrame/
npm run build
cd src-tauri && cargo build
```

CI (`.github/workflows/ci.yml`) runs the same two build commands on every
push/PR, so a broken build won't merge silently — but there is no automated
*test* suite yet. Beyond "does it build," changes are currently verified by
running the app against real hardware (or, for UI-only changes, `npm run
dev`). If you're adding logic that's easy to get subtly wrong (protocol
parsing, byte-packing, coordinate math), consider adding a test.

## Code style

Follow the conventions already in the file you're editing:

- **Rust:** `gofmt`-equivalent is `cargo fmt`; run it before committing.
  Public functions and `#[tauri::command]`s get rustdoc `///` comments.
  Return `Result<T, String>` from commands, matching the existing pattern —
  don't introduce a different error type without discussing it first.
- **TypeScript/React:** 2-space indent, function components, TSDoc on
  exported components/functions. Tailwind utility classes for styling — no
  inline `<style>` blocks or CSS files beyond `index.css`/`App.css`.

## Hardware claims — be honest about what's confirmed

A lot of this codebase talks to undocumented USB/HID protocols
(Framework's VID/PID space, VIA's RGB matrix commands, the CrosEC EC
interface). Several existing comments (see
[`device_manager.rs`](MainFrame/src-tauri/src/device_manager.rs) and
[`keyboard_mapper.rs`](MainFrame/src-tauri/src/keyboard_mapper.rs))
explicitly flag which values are confirmed against real hardware vs. best
guesses. Please keep that norm: if you're guessing at a PID, effect number,
or protocol byte, say so in a comment rather than presenting it as fact —
the next person debugging a hardware issue needs to know which parts of the
code to trust.

## Security-sensitive changes

If your change touches `persistence.rs`, `tauri.conf.json`'s CSP, or
anything that would affect the app's local-only/zero-network posture, please
read [SECURITY.md](SECURITY.md) first and call out the change explicitly in
your PR description — these are areas where "it works" and "it's honestly
described" are both requirements.

## Pull requests

- Keep PRs scoped to one change — a mixed docs+refactor+feature PR is hard
  to review.
- Describe *why*, not just *what*, in the PR description.
- If you're not sure whether a change fits the project's direction, open an
  issue first rather than a large PR.
